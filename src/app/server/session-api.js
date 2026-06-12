/**
 * run cmd with terminal
 */

const net = require('net')
const {
  terminals
} = require('./remote-common')
const { startSession } = require('./session')

async function runCmd (body) {
  const { pid, cmd } = body
  const term = terminals(pid)
  let txt = ''
  if (term) {
    txt = await term.runCmd(cmd)
  }
  return txt
}

async function resize (body) {
  const { pid, cols, rows } = body
  const term = terminals(pid)
  if (term) {
    term.resize(cols, rows)
  }
  return 'ok'
}

async function toggleTerminalLog (body) {
  const { pid } = body
  const term = terminals(pid)
  if (term) {
    term.toggleTerminalLog()
  }
  return 'ok'
}

async function toggleTerminalLogTimestamp (body) {
  const { pid } = body
  const term = terminals(pid)
  if (term) {
    term.toggleTerminalLogTimestamp()
  }
  return 'ok'
}

async function createTerm (body, ws) {
  const t = await startSession(body, ws)
  return t.pid
}

async function testTerm (body, ws) {
  const r = await startSession(body, ws, 'test')
  if (r) {
    return r
  } else {
    throw new Error('test failed')
  }
}

async function setTerminalLogPath (body) {
  const { pid, logPath } = body
  const term = terminals(pid)
  if (term) {
    term.setTerminalLogPath(logPath)
  }
  return 'ok'
}

async function startTerminalLogFile (body) {
  const { pid, logFilePath, addTimeStampToTermLog } = body
  const term = terminals(pid)
  if (term) {
    term.startTerminalLogFile(logFilePath, addTimeStampToTermLog)
  }
  return 'ok'
}

async function tcpPing (body) {
  const { pid } = body
  const term = terminals(pid)
  const opts = term?.initOptions || {}
  const { proxy, readyTimeout = 3000 } = opts

  // SSH 会话：通过已有 SSH 通道发送快速命令测 RTT（类似 FinalShell）
  if (typeof term?.runCmd === 'function') {
    const start = Date.now()
    try {
      await term.runCmd('echo ping')
      return Date.now() - start
    } catch {
      return -1
    }
  }

  // 非 SSH 会话（本地终端）：TCP ping
  const { host, port = 22 } = opts
  if (!host) return -1

  if (proxy) {
    try {
      const proxySock = require('./socks')
      const start = Date.now()
      const result = await proxySock({ readyTimeout, host, port, proxy })
      const elapsed = Date.now() - start
      result.socket.destroy()
      return elapsed
    } catch {
      return -1
    }
  }

  return new Promise((resolve) => {
    const start = Date.now()
    const sock = net.createConnection({ host, port }, () => {
      const elapsed = Date.now() - start
      sock.destroy()
      resolve(elapsed)
    })
    sock.on('error', () => {
      sock.destroy()
      resolve(-1)
    })
    sock.setTimeout(readyTimeout, () => {
      sock.destroy()
      resolve(-1)
    })
  })
}

exports.createTerm = createTerm
exports.testTerm = testTerm
exports.resize = resize
exports.runCmd = runCmd
exports.tcpPing = tcpPing
exports.toggleTerminalLog = toggleTerminalLog
exports.toggleTerminalLogTimestamp = toggleTerminalLogTimestamp
exports.setTerminalLogPath = setTerminalLogPath
exports.startTerminalLogFile = startTerminalLogFile
