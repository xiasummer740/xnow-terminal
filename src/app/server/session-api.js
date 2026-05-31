/**
 * run cmd with terminal
 */

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
  if (!term || !term.conn || !term.conn._protocol || !term.conn._callbacks) {
    return -1
  }
  // SSH协议层 keepalive ping，单次往返RTT（类似FinalShell原理）
  return new Promise((resolve) => {
    const start = Date.now()
    const timeout = setTimeout(() => resolve(-1), 3000)
    term.conn._callbacks.push(() => {
      clearTimeout(timeout)
      resolve(Date.now() - start)
    })
    term.conn._protocol.ping()
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
