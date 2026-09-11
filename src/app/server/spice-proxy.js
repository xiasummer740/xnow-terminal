const net = require('net')
const log = require('../common/log')
const proxySock = require('./socks')

const LOG_PREFIX = '[SPICE-PROXY]'

async function createTcpConnection (host, port, options = {}) {
  const { proxy, readyTimeout = 15000 } = options

  if (proxy) {
    log.debug(`${LOG_PREFIX} 正在通过代理连接：${proxy}`)
    const proxyResult = await proxySock({
      readyTimeout,
      host,
      port,
      proxy
    })
    log.debug(`${LOG_PREFIX} 代理连接已建立`)
    return proxyResult.socket
  }

  return new Promise((resolve, reject) => {
    const tcpSocket = net.createConnection({ host, port }, () => {
      log.debug(`${LOG_PREFIX} 已建立到 ${host}:${port} 的 TCP 连接`)
      tcpSocket.setKeepAlive(true, 5000)
      tcpSocket.setTimeout(0)
      resolve(tcpSocket)
    })
    tcpSocket.once('error', (err) => {
      reject(new Error(`TCP connection failed: ${err.message}`))
    })
    tcpSocket.setTimeout(readyTimeout, () => {
      tcpSocket.destroy()
      reject(new Error('Connection timed out'))
    })
  })
}

async function handleConnection (ws, options = {}) {
  const { host, port, proxy, readyTimeout = 15000, onCleanup, channelId } = options
  const id = channelId || 'unknown'

  log.debug(`${LOG_PREFIX}[${id}] 新的 WebSocket 连接用于 SPICE 代理`)

  if (!host || !port) {
    log.error(`${LOG_PREFIX}[${id}] 缺少主机或端口`)
    ws.close()
    if (onCleanup) onCleanup()
    return
  }

  const messageBuffer = []
  let wsClosed = false
  let tcpClosed = false
  let tcpSocket = null

  const cleanup = (source) => {
    if (wsClosed && tcpClosed) return
    log.debug(`${LOG_PREFIX}[${id}] 清理触发来源：${source}`)
    wsClosed = true
    tcpClosed = true

    try {
      if (ws && ws.readyState !== ws.CLOSED) {
        ws.close()
      }
    } catch (e) {
      log.debug(`${LOG_PREFIX}[${id}] WebSocket 关闭错误：`, e.message)
    }

    try {
      if (tcpSocket) {
        tcpSocket.destroy()
      }
    } catch (e) {
      log.debug(`${LOG_PREFIX}[${id}] TCP 套接字销毁错误：`, e.message)
    }

    if (onCleanup) {
      onCleanup()
    }
  }

  ws.on('message', (data) => {
    if (tcpClosed) return
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)

    if (tcpSocket) {
      try {
        tcpSocket.write(buf)
      } catch (e) {
        log.error(`${LOG_PREFIX}[${id}] TCP 写入错误：`, e.message)
        cleanup('TCP 写入错误')
      }
    } else {
      messageBuffer.push(buf)
    }
  })

  ws.on('close', () => cleanup('WebSocket'))
  ws.on('error', (err) => {
    log.error(`${LOG_PREFIX}[${id}] WebSocket 错误：`, err.message)
    cleanup('WebSocket 错误')
  })

  try {
    tcpSocket = await createTcpConnection(host, port, { proxy, readyTimeout })
    log.debug(`${LOG_PREFIX}[${id}] 已连接到 SPICE 服务器 ${host}:${port}`)

    tcpSocket.on('data', (data) => {
      if (wsClosed) return
      try {
        ws.send(data)
      } catch (e) {
        log.error(`${LOG_PREFIX}[${id}] WebSocket 发送错误：`, e.message)
        cleanup('WebSocket 发送错误')
      }
    })

    tcpSocket.on('close', () => cleanup('TCP 关闭'))
    tcpSocket.on('end', () => cleanup('TCP 结束'))
    tcpSocket.on('error', (err) => {
      log.error(`${LOG_PREFIX}[${id}] TCP 错误：`, err.message)
      cleanup('TCP 错误')
    })

    if (messageBuffer.length > 0) {
      for (const buf of messageBuffer) {
        try {
          tcpSocket.write(buf)
        } catch (e) {
          log.error(`${LOG_PREFIX}[${id}] TCP 写入错误：`, e.message)
          cleanup('TCP 写入错误')
          return
        }
      }
      messageBuffer.length = 0
    }
  } catch (err) {
    log.error(`${LOG_PREFIX}[${id}] 连接失败：`, err.message)
    try {
      ws.close()
    } catch (e) {}
    if (onCleanup) onCleanup()
  }
}

function setupRelay (ws, tcpSocket, options = {}) {
  const { onCleanup, channelId } = options
  let wsClosed = false
  let tcpClosed = false
  const id = channelId || 'unknown'

  const cleanup = (source) => {
    if (wsClosed && tcpClosed) return
    log.debug(`${LOG_PREFIX}[${id}] 清理触发来源：${source}`)
    wsClosed = true
    tcpClosed = true

    try {
      if (ws && ws.readyState !== ws.CLOSED) {
        ws.close()
      }
    } catch (e) {
      log.debug(`${LOG_PREFIX}[${id}] WebSocket 关闭错误：`, e.message)
    }

    try {
      tcpSocket.destroy()
    } catch (e) {
      log.debug(`${LOG_PREFIX}[${id}] TCP 套接字销毁错误：`, e.message)
    }

    if (onCleanup) {
      onCleanup()
    }
  }

  tcpSocket.on('data', (data) => {
    if (wsClosed) return
    try {
      ws.send(data)
    } catch (e) {
      log.error(`${LOG_PREFIX}[${id}] WebSocket 发送错误：`, e.message)
      cleanup('WebSocket 发送错误')
    }
  })

  tcpSocket.on('close', () => cleanup('TCP 关闭'))
  tcpSocket.on('end', () => cleanup('TCP 结束'))
  tcpSocket.on('error', (err) => {
    log.error(`${LOG_PREFIX}[${id}] TCP 错误：`, err.message)
    cleanup('TCP 错误')
  })

  ws.on('message', (data) => {
    if (tcpClosed) return
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(data)
    try {
      tcpSocket.write(buf)
    } catch (e) {
      log.error(`${LOG_PREFIX}[${id}] TCP 写入错误：`, e.message)
      cleanup('TCP 写入错误')
    }
  })

  ws.on('close', () => cleanup('WebSocket'))
  ws.on('error', (err) => {
    log.error(`${LOG_PREFIX}[${id}] WebSocket 错误：`, err.message)
    cleanup('WebSocket 错误')
  })
}

module.exports = {
  handleConnection,
  createTcpConnection,
  setupRelay
}
