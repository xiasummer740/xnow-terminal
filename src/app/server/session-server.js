const express = require('express')
const { Sftp } = require('./session-sftp')
const { Ftp } = require('./session-ftp')
const {
  sftp,
  transfer,
  onDestroySftp,
  onDestroyTransfer,
  terminals,
  cleanAllSessions
} = require('./remote-common')
const { Transfer } = require('./transfer')
const { Transfer: FtpTransfer } = require('./ftp-transfer')
const app = express()
const log = require('../common/log')
const { parseWsMessage } = require('./parse-ws-message')
const appDec = require('./app-wrap')
const {
  createTerm,
  testTerm,
  resize,
  runCmd,
  tcpPing,
  toggleTerminalLog,
  toggleTerminalLogTimestamp,
  setTerminalLogPath,
  startTerminalLogFile
} = require('./session-api')
const {
  isWin
} = require('../common/runtime-constants')
const wsDec = require('./ws-dec')
const { isLoopbackOrigin, tokenEquals } = require('./ws-origin')
const { zmodemManager } = require('./zmodem')
const { trzszManager } = require('./trzsz')
const { xmodemManager } = require('./xmodem')

const {
  tokenElecterm,
  electermHost,
  wsPort,
  type
} = process.env

// Track whether any WebSocket has connected to detect orphaned processes
let firstWsConnected = false
function markConnected () {
  firstWsConnected = true
}

function verify (req) {
  // 同 dispatch-center：先挡非回环来源，再比对 token（ISSUES #3）
  if (!isLoopbackOrigin(req.headers.origin)) {
    log.warn('拒绝非回环来源的 WS 连接:', req.headers.origin)
    throw new Error('not valid origin')
  }
  const { token: to } = req.query
  if (!tokenEquals(to, tokenElecterm)) {
    log.warn('拒绝 token 不匹配的 WS 连接')
    throw new Error('not valid request')
  }
}

appDec(app)

if (type === 'rdp') {
  app.ws('/rdp/:pid', function (ws, req) {
    const { width, height } = req.query
    verify(req)
    markConnected()
    const term = terminals(req.params.pid)
    term.ws = ws
    log.debug('WS：已连接到 RDP 会话 ->', term.pid, '宽度=', width, '高度=', height)
    term.start(width, height)
    ws.on('error', (err) => {
      log.error('RDP WS 错误：', err)
    })
    ws.on('close', () => {
      log.debug('WS：RDP 会话已关闭 ->', term.pid)
      cleanup()
    })
  })
} else if (type === 'vnc') {
  app.ws('/vnc/:pid', function (ws, req) {
    const { query } = req
    verify(req)
    markConnected()
    const { pid } = req.params
    const term = terminals(pid)
    term.ws = ws
    term.start(query)
    log.debug('WS：已连接到 VNC 会话 ->', pid)
    ws.on('error', (err) => {
      log.error(err)
    })
    ws.on('close', () => {
      cleanup()
    })
  })
} else if (type === 'spice') {
  app.ws('/spice/:pid', function (ws, req) {
    const { query } = req
    verify(req)
    markConnected()
    const { pid } = req.params
    const term = terminals(pid)
    log.debug('WS：已连接到 SPICE 会话 ->', pid)
    term.start(query, ws)
    ws.on('error', (err) => {
      log.error(err)
    })
  })
} else {
  app.ws('/terminals/:pid', function (ws, req) {
    verify(req)
    markConnected()
    const term = terminals(req.params.pid)
    const { pid } = term
    log.debug('WS：已连接到终端 ->', pid)

    const dataBuffer = []
    let sendTimeout = null

    const flushBufferedData = () => {
      if (!dataBuffer.length) {
        sendTimeout = null
        return
      }
      const combinedData = Buffer.concat(dataBuffer.splice(0).map(d => Buffer.isBuffer(d) ? d : Buffer.from(d)))

      // Write to log (keep this)
      term.writeLog(combinedData)

      // Check for zmodem escape sequence before sending to client
      const zmodemConsumed = zmodemManager.handleData(pid, combinedData, term, ws)
      if (zmodemConsumed) {
        sendTimeout = null
        return
      }

      // Check for trzsz magic key before sending to client
      const trzszConsumed = trzszManager.handleData(pid, combinedData, term, ws)
      if (trzszConsumed) {
        sendTimeout = null
        return
      }

      // Check for xmodem protocol before sending to client
      const xmodemConsumed = xmodemManager.handleData(pid, combinedData, term, ws)
      if (xmodemConsumed) {
        sendTimeout = null
        return
      }

      // Not zmodem, trzsz, or xmodem data, send to WebSocket
      ws.send(combinedData)
      sendTimeout = null
    }

    // Create ws.s function for zmodem to send messages to client
    ws.s = (data) => {
      ws.send(JSON.stringify(data))
    }

    // In the WebSocket setup, replace the data handler:
    term.on('data', function (data) {
      // Check if zmodem session is active and handle data
      if (zmodemManager.isActive(pid)) {
        // Let zmodem handle the data, but still log it
        term.writeLog(data)
        zmodemManager.handleData(pid, data, term, ws)
        return
      }

      // Check if trzsz session is active and handle data
      if (trzszManager.isActive(pid)) {
        // Let trzsz handle the data, but still log it
        term.writeLog(data)
        trzszManager.handleData(pid, data, term, ws)
        return
      }

      // Check if xmodem session is active and handle data.
      // For serial terminals (term.port exists) a raw port listener (registered below)
      // bypasses rxLineEnding transformation and feeds raw bytes to xmodem.
      if (xmodemManager.isActive(pid)) {
        if (!term.port) {
          // Non-serial fallback (should not normally happen)
          term.writeLog(data)
          xmodemManager.handleData(pid, data, term, ws)
        }
        return
      }

      const chunk = Buffer.isBuffer(data) ? data : Buffer.from(data)

      // Bypass batching for very large chunks to avoid parser desync.
      if (chunk.length > 16384) {
        if (sendTimeout) {
          clearTimeout(sendTimeout)
          sendTimeout = null
        }
        if (dataBuffer.length) {
          flushBufferedData()
        }
        term.writeLog(chunk)
        const zmodemConsumed = zmodemManager.handleData(pid, chunk, term, ws)
        if (zmodemConsumed) {
          return
        }
        const trzszConsumed = trzszManager.handleData(pid, chunk, term, ws)
        if (trzszConsumed) {
          return
        }
        const xmodemConsumed = xmodemManager.handleData(pid, chunk, term, ws)
        if (xmodemConsumed) {
          return
        }
        ws.send(chunk)
        return
      }

      // Buffer incoming data instead of sending immediately for normal text workload
      dataBuffer.push(chunk)

      // If no timeout is pending, schedule a batched send
      if (!sendTimeout) {
        sendTimeout = setTimeout(flushBufferedData, 10) // Small delay (10ms) to throttle; adjust based on testing
      }
    })

    // For serial terminals, register a raw data listener directly on the port to
    // feed binary XMODEM data to xmodemManager without rxLineEnding transformation.
    if (term.port) {
      term.port.on('data', function (rawData) {
        if (xmodemManager.isActive(pid)) {
          term.writeLog(rawData)
          xmodemManager.handleData(pid, rawData, term, ws)
        }
      })
    }

    let onCloseCalled = false
    function onClose () {
      if (onCloseCalled) return
      onCloseCalled = true
      // Cancel any pending batched send
      if (sendTimeout) {
        clearTimeout(sendTimeout)
        sendTimeout = null
      }
      dataBuffer.length = 0
      // Clean up zmodem session
      zmodemManager.destroySession(pid)
      // Clean up trzsz session
      trzszManager.destroySession(pid)
      // Clean up xmodem session
      xmodemManager.destroySession(pid)
      term.kill()
      log.debug('终端已关闭 ' + pid)
      // Clean things up
      ws.close && ws.close()
      cleanup()
    }

    term.on('close', onClose)
    if (term.isLocal && isWin) {
      term.on('exit', onClose)
    }

    ws.on('message', function (msg) {
      try {
        // Check if message is a zmodem or trzsz control message (JSON)
        if (typeof msg === 'string') {
          try {
            const parsed = JSON.parse(msg)
            if (parsed.action === 'zmodem-event') {
              zmodemManager.handleMessage(pid, parsed, term, ws)
              return
            }
            if (parsed.action === 'trzsz-event') {
              trzszManager.handleMessage(pid, parsed, term, ws)
              return
            }
            if (parsed.action === 'xmodem-event') {
              xmodemManager.handleMessage(pid, parsed, term, ws)
              return
            }
            if (parsed.action === 'keepalive') {
              // Write \n to the PTY.  In canonical mode the TTY line discipline
              // only delivers data to read() when a newline completes the line,
              // so \x00 (NUL) sits in the buffer and never wakes bash up.
              // A newline wakes bash's read(), resets the TMOUT alarm, and bash
              // simply re-displays the prompt.  The client suppresses that echo.
              term.write('\n\r\x1b[K')
              return
            }
          } catch (e) {
            // Not JSON, treat as regular terminal input
          }
        }
        term.write(msg)
      } catch (ex) {
        log.error(ex)
      }
    })

    ws.on('error', (err) => {
      log.error(err)
    })

    ws.on('close', onClose)
  })

  // sftp function
  app.ws('/sftp/:id', (ws, req) => {
    verify(req)
    wsDec(ws)
    const { id } = req.params
    ws.on('close', () => {
      onDestroySftp(id)
    })
    ws.on('message', (message) => {
      const msg = parseWsMessage(message)
      if (!msg) return
      const { action } = msg

      if (action === 'sftp-new') {
        const { id, terminalId, type } = msg
        const Cls = type === 'ftp' ? Ftp : Sftp
        sftp(id, new Cls({
          uid: id,
          terminalId,
          type
        }))
      } else if (action === 'sftp-func') {
        const { id, args, func, uid } = msg
        const inst = sftp(id)
        if (inst) {
          inst[func](...args)
            .then(data => {
              ws.s({
                id: uid,
                data
              })
            })
            .catch(err => {
              ws.s({
                id: uid,
                error: {
                  message: err.message,
                  stack: err.stack
                }
              })
            })
        }
      } else if (action === 'sftp-destroy') {
        const { id } = msg
        ws.close()
        onDestroySftp(id)
      }
    })
    // end
  })

  // transfer function
  app.ws('/transfer/:id', (ws, req) => {
    verify(req)
    wsDec(ws)
    const { id } = req.params
    const { sftpId } = req.query

    ws.on('close', () => {
      onDestroyTransfer(id, sftpId)
    })

    ws.on('message', (message) => {
      const msg = parseWsMessage(message)
      if (!msg) return
      const { action } = msg

      if (action === 'transfer-new') {
        const { sftpId, id, isFtp } = msg
        const session = sftp(sftpId)
        const opts = Object.assign({}, msg, {
          sftp: session.sftp,
          conn: session.client,
          ftpSession: isFtp ? session : null,
          sftpId,
          ws
        })
        const Cls = isFtp ? FtpTransfer : Transfer
        transfer(id, sftpId, new Cls(opts))
      } else if (action === 'transfer-func') {
        const { id, func, args, sftpId } = msg
        if (func === 'destroy') {
          return onDestroyTransfer(id, sftpId)
        }
        transfer(id, sftpId)[func](...args)
      }
    })
    // end
  })
}

// Add a process message handler instead
process.on('message', async (message) => {
  if (message.type === 'common') {
    const msg = message.data
    const { action, id, body } = msg

    let promise

    const ws = {
      s: (data) => {
        process.send({
          type: 'common',
          data
        })
      },
      once: (callack, id) => {
        const func = (arg) => {
          if (id === arg.id) {
            callack(arg)
            process.removeListener('message', func)
          }
        }
        process.on('message', func)
      }
    }

    if (action === 'create-terminal') {
      promise = createTerm(body, ws)
    } else if (action === 'test-terminal') {
      promise = testTerm(body, ws)
    } else if (action === 'resize-terminal') {
      promise = resize(body)
    } else if (action === 'toggle-terminal-log') {
      promise = toggleTerminalLog(body)
    } else if (action === 'toggle-terminal-log-timestamp') {
      promise = toggleTerminalLogTimestamp(body)
    } else if (action === 'set-terminal-log-path') {
      promise = setTerminalLogPath(body)
    } else if (action === 'start-terminal-log-file') {
      promise = startTerminalLogFile(body)
    } else if (action === 'run-cmd') {
      promise = runCmd(body)
    } else if (action === 'tcp-ping') {
      promise = tcpPing(body)
    }

    const result = await promise
      .then(r => {
        return {
          id,
          data: r
        }
      })
      .catch(err => {
        log.error('通用消息错误', err)
        return {
          id,
          error: {
            message: err.message,
            stack: err.stack
          }
        }
      })

    // Send the result back to the parent process
    process.send(result)
  }
})

const runServer = function () {
  return new Promise((resolve) => {
    app.listen(wsPort, electermHost, () => {
      log.info('会话服务端', '运行于', electermHost, wsPort)
      resolve()
    })
  })
}

async function main () {
  await runServer()
  process.send({ serverInited: true })
}

main()

let cleanupCalled = false
function cleanup () {
  if (cleanupCalled) return
  cleanupCalled = true
  cleanAllSessions()
  setTimeout(() => {
    process.exit(0)
  }, 2000)
}

// Self-terminate if the parent process IPC channel disconnects (e.g. Electron crashes/restarts)
// Without this, child processes become orphans and accumulate in memory
process.on('disconnect', () => {
  log.warn('会话服务端：父进程 IPC 已断开，正在退出')
  cleanup()
})

// Self-terminate if no WebSocket connects within 2 minutes of server start
// This handles the case where the frontend unmounts before the WebSocket is established
const noConnectionTimer = setTimeout(() => {
  if (!firstWsConnected) {
    log.warn('会话服务端：2 分钟内没有 WS 连接，正在退出')
    cleanup()
  }
}, 120000)
if (noConnectionTimer.unref) noConnectionTimer.unref()

process.on('uncaughtException', (err) => {
  log.error('未捕获异常', err)
  cleanup()
})
process.on('unhandledRejection', (err) => {
  log.error('未处理的 Promise 拒绝', err)
  cleanup()
})

process.on('SIGTERM', cleanup)
