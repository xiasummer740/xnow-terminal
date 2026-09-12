/**
 * Single instance lock with socket-based IPC fallback
 * for Electron versions where additionalData doesn't work (e.g., Electron 22)
 *
 * 关于鉴权（ISSUES #44）：
 * 这条 socket 原来**完全不校验来源** —— 本机任意进程连上命名管道、写一段 JSON，
 * 就会被转发成 `add-tab-from-command-line`，渲染进程照单全收：
 * `options.privateKeyPath` 会被 readFile 出来当私钥发到 `options.host` 去
 * （任意文件读取 + 外发），`options.batchOp` 同理。而命令行的**正常**
 * 第二实例只会发自己那份 progs，所以这里加一道共享 token 握手，
 * 把「任意进程可注入」收窄成「能读到用户数据目录里 token 文件的进程可注入」。
 *
 * token 是主实例启动时随机生成、写进用户数据目录的（Windows 该目录按用户 ACL，
 * 非本用户读写不了）。写不进去就退回旧行为并在日志里说明 —— 宁可少一层防护，
 * 也不能让单实例锁直接失效（那会变成开两个窗口）。
 */

const net = require('net')
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')
const { app } = require('electron')
const globalState = require('./glob-state')

/** 单条消息上限：管道无鉴权，不设上限的话本机进程能拿它把内存撑爆 */
const MAX_MESSAGE_BYTES = 1024 * 1024

// Get socket path based on platform
function getSocketPath () {
  const appName = app.getName()
  if (process.platform === 'win32') {
    return `\\\\.\\pipe\\${appName}-instance-lock`
  }
  // Unix socket
  const tmpDir = app.getPath('temp')
  return path.join(tmpDir, `${appName}-instance.sock`)
}

function getTokenFile () {
  return path.join(app.getPath('userData'), 'instance-token')
}

const socketPath = getSocketPath()

/** 恒定时间比较，避免按字节比较泄露 token 前缀 */
function sameToken (a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

function readToken () {
  try {
    const t = fs.readFileSync(getTokenFile(), 'utf8').trim()
    return t || null
  } catch (e) {
    return null
  }
}

function writeToken (t) {
  try {
    fs.writeFileSync(getTokenFile(), t, { mode: 0o600 })
    return true
  } catch (e) {
    return false
  }
}

// Clean up stale socket file on Unix
function cleanupSocket () {
  if (process.platform !== 'win32' && fs.existsSync(socketPath)) {
    try {
      fs.unlinkSync(socketPath)
    } catch (e) {
      // Ignore errors
    }
  }
}

/**
 * Start socket server to receive data from second instances
 * @param {Function} onSecondInstance - Callback when second instance sends data
 */
function startSocketServer (onSecondInstance) {
  cleanupSocket()

  // 每次当上主实例都换一把新 token：上次异常退出留下的旧 token 自然作废
  const token = crypto.randomBytes(32).toString('hex')
  const tokenSaved = writeToken(token)
  if (!tokenSaved) {
    console.error('单实例 token 写不进去，本次退回不校验握手（ISSUES #44）')
  }

  const server = net.createServer((socket) => {
    let data = ''
    let overflow = false
    socket.on('data', (chunk) => {
      if (overflow) return
      data += chunk.toString()
      if (data.length > MAX_MESSAGE_BYTES) {
        overflow = true
        data = ''
        console.error('单实例消息超长，已断开（ISSUES #44）')
        socket.destroy()
      }
    })
    socket.on('end', () => {
      if (overflow) return
      let parsed
      try {
        parsed = JSON.parse(data)
      } catch (e) {
        console.error('Failed to parse second instance data:', e)
        return
      }
      // tokenSaved 为 false 时是"降级模式"，此时只能沿用旧行为
      if (tokenSaved && !sameToken(parsed && parsed.token, token)) {
        console.error('拒绝未通过握手的本机连接（ISSUES #44）')
        return
      }
      onSecondInstance(parsed ? parsed.progs : undefined)
    })
  })

  server.on('error', (err) => {
    console.error('Socket server error:', err)
  })

  server.listen(socketPath)

  // Clean up on app quit
  app.on('will-quit', () => {
    server.close()
    cleanupSocket()
  })

  return server
}

/**
 * Send data to primary instance via socket
 * @param {Object} data - Data to send
 * @returns {Promise<boolean>} - True if sent successfully
 */
function sendToFirstInstance (data) {
  return new Promise((resolve) => {
    // token 读不到也要**照连不误**：主实例可能处于降级模式（token 写不进去），
    // 那种情况下它什么 token 都收。真没有主实例时这次连接会 ECONNREFUSED，
    // 走下面的 error 分支返回 false —— 那头才知道"我才是主实例"。
    // 早就在这里 return false 的话，降级模式下第二个实例会自己开一个窗口。
    const token = readToken()

    const client = net.createConnection(socketPath, () => {
      client.write(JSON.stringify(token ? { token, progs: data } : { progs: data }))
      client.end()
    })

    client.on('error', () => {
      // No server listening, we are the first instance
      resolve(false)
    })

    client.on('close', () => {
      resolve(true)
    })
  })
}

/**
 * Handle second instance connection with socket fallback
 * @param {Object} progs - Parsed command line options
 * @returns {Promise<boolean>} - True if this is the primary instance
 */
async function handleSingleInstance (progs) {
  // Try to send to existing instance first via socket
  const sent = await sendToFirstInstance(progs)
  if (sent) {
    // Successfully sent to primary instance, quit this one
    return false
  }

  // We are the primary instance, start socket server
  startSocketServer((data) => {
    const win = globalState.get('win')
    if (win) {
      if (win.isMinimized()) {
        win.restore()
      }
      win.focus()
      win.webContents.send('add-tab-from-command-line', data)
    }
  })

  return true
}

module.exports = {
  handleSingleInstance,
  sendToFirstInstance,
  startSocketServer,
  // 下面这些导出只为单测能验边界，正常调用用不到
  sameToken,
  readToken,
  MAX_MESSAGE_BYTES
}
