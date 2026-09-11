const log = require('../common/log')

function forwardRemoteToLocal ({
  conn,
  sshTunnelRemotePort,
  sshTunnelLocalPort,
  sshTunnelRemoteHost = '127.0.0.1',
  sshTunnelLocalHost = '127.0.0.1'
}) {
  return new Promise((resolve, reject) => {
    const result = `remote:${sshTunnelRemoteHost}:${sshTunnelRemotePort} => local:${sshTunnelLocalHost}:${sshTunnelLocalPort}`

    const handleTcpConnection = (info, accept, rejectConn) => {
      // Check if this connection is for this tunnel
      if (info.destPort !== sshTunnelRemotePort && info.destPort !== Number(sshTunnelRemotePort)) {
        return
      }

      const srcStream = accept() // Source stream for forwarding

      if (!srcStream) {
        log.error(`隧道 ${result} 接受连接失败`)
        return
      }

      // Add error handling for source stream immediately
      srcStream.on('error', (err) => {
        log.error(`隧道 ${result} 源流错误：`, err)
      })

      // Connect the local machine source stream to the local port
      // Create a NEW server connection for each forwarded connection
      const server = require('net').connect(sshTunnelLocalPort, sshTunnelLocalHost)

      // CRITICAL: Add error handling IMMEDIATELY before any async operations
      // This prevents unhandled errors from crashing the SSH session
      server.on('error', (err) => {
        log.error(`隧道 ${result} 服务端连接错误：`, err.message)
        // Just close this specific connection, don't break the tunnel
        srcStream.destroy()
        server.destroy()
      })

      server.on('close', () => {
        log.log(`隧道 ${result} 的本地服务端连接已关闭`)
        srcStream.end()
      })

      srcStream.on('close', () => {
        server.destroy()
      })

      srcStream.pipe(server).pipe(srcStream)
    }

    conn.on('tcp connection', handleTcpConnection)

    const handleClose = () => {
      log.log(`隧道 ${result} 的 SSH 连接已关闭`)
      conn.removeListener('tcp connection', handleTcpConnection)
      conn.removeListener('close', handleClose)
    }

    conn.on('close', handleClose)

    // Forward the remote server's port to the local machine's port
    conn.forwardIn(sshTunnelRemoteHost, sshTunnelRemotePort, (err) => {
      if (err) {
        log.error('转发端口出错：', err)
        return reject(err)
      }
      log.log(`端口已转发：${result}`)
      resolve(1)
    })
  })
}

function forwardLocalToRemote ({
  conn,
  sshTunnelRemotePort,
  sshTunnelLocalPort,
  sshTunnelRemoteHost = '127.0.0.1',
  sshTunnelLocalHost = '127.0.0.1'
}) {
  return new Promise((resolve, reject) => {
    const activeSockets = new Set()
    const localServer = require('net').createServer((socket) => {
      // ⬇️ 2. Add new sockets to the set and remove them when they close
      activeSockets.add(socket)
      socket.on('close', () => {
        activeSockets.delete(socket)
      })

      socket.on('error', (err) => {
        log.error('客户端套接字错误：', err)
        socket.end()
      })

      conn.forwardOut(sshTunnelLocalHost, sshTunnelLocalPort, sshTunnelRemoteHost, sshTunnelRemotePort, (err, remoteSocket) => {
        if (err) {
          log.error('转发连接出错：', err)
          socket.destroy()
          // Don't reject - just close this connection
          // Rejecting would break the entire tunnel
          return
        }

        // Add error handlers immediately
        remoteSocket.on('error', (err) => {
          log.error('远程套接字错误：', err)
          socket.destroy()
        })

        socket.on('close', () => {
          remoteSocket.destroy()
        })

        socket.pipe(remoteSocket).pipe(socket)
      })
    })

    localServer.listen(sshTunnelLocalPort, sshTunnelLocalHost, () => {
      log.log(`本地服务端正在监听端口 ${sshTunnelLocalPort}`)
      resolve(1)
    })
    localServer.on('error', (err) => {
      log.error('监听本地连接出错：', err)
      reject(err)
    })

    conn.on('close', () => {
      log.log('SSH 连接已关闭，正在关闭本地服务端')
      // ⬇️ 3. Destroy all active sockets before closing the server
      for (const socket of activeSockets) {
        socket.destroy()
      }
      localServer && localServer.close()
    })
  })
}

function dynamicForward ({
  conn,
  sshTunnelLocalPort,
  sshTunnelLocalHost = '127.0.0.1'
}) {
  const socks = require('socksv5-server')
  return new Promise((resolve, reject) => {
    const dproxyServer = socks.createServer((info, accept, deny) => {
      conn.forwardOut(
        info.srcAddr,
        info.srcPort,
        info.dstAddr,
        info.dstPort,
        (err, stream) => {
          if (err) {
            log.error('SOCKS 转发错误：', err)
            deny()
            // Don't reject - just deny this connection
            // Rejecting would break the entire tunnel
            return
          }
          const clientSocket = accept(true)
          if (clientSocket) {
            // Add error handling for stream immediately
            stream.on('error', (err) => {
              log.error('SOCKS 流错误：', err)
              clientSocket.destroy()
            })

            // Add error handling for client socket immediately
            clientSocket.on('error', (err) => {
              log.error('SOCKS 客户端套接字错误：', err)
              stream.destroy()
            })

            stream.on('close', () => {
              clientSocket.destroy()
            })

            clientSocket.on('close', () => {
              stream.destroy()
            })

            stream.pipe(clientSocket).pipe(stream)
          }
        })
    })
    dproxyServer.on('error', (err) => {
      log.error('监听本地连接出错：', err)
      reject(err)
    })
    dproxyServer.listen(sshTunnelLocalPort, sshTunnelLocalHost, () => {
      log.log(`SOCKS 服务端正在监听 ${sshTunnelLocalHost}:${sshTunnelLocalPort}`)
      resolve(1)
    }).useAuth(socks.auth.None())

    // close socks proxy when ssh connection is closed.
    conn.on('close', () => {
      dproxyServer && dproxyServer.close()
    })
  })
}

exports.dynamicForward = dynamicForward
exports.forwardLocalToRemote = forwardLocalToRemote
exports.forwardRemoteToLocal = forwardRemoteToLocal
