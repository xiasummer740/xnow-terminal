/**
 * terminal/sftp/serial class
 */

const { resolve: pathResolve } = require('path')
const { TerminalBase } = require('./session-base')
const globalState = require('./global-state')
const os = require('os')
// const { MockBinding } = require('@serialport/binding-mock')
// MockBinding.createPort('/dev/ROBOT', { echo: true, record: true })

class TerminalLocal extends TerminalBase {
  init () {
    try {
      const pty = require('node-pty')
      const shell = process.env.COMSPEC || 'powershell.exe'
      const cols = this.initOptions.cols || 80
      const rows = this.initOptions.rows || 30

      this.term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd: process.env.USERPROFILE || process.env.HOME || os.homedir(),
        env: process.env
      })

      this.isLocal = true

      // 发送初始提示
      this.term.write('\r')

      // Data forwarding happens via session-server's term.on('data') → this.on()
      // Exit handling via session-server's term.on('exit') → this.on()
      // on('close') is not supported by node-pty, map to on('exit')
      const origOn = this.on.bind(this)
      this.on = (event, cb) => {
        if (event === 'close') {
          return this.term.on('exit', cb)
        }
        return origOn(event, cb)
      }

      return Promise.resolve()
    } catch (e) {
      return Promise.reject(new Error('本地终端启动失败: ' + e.message))
    }
  }

  resize (cols, rows) {
    this.term.resize(cols, rows)
  }

  on (event, cb) {
    this.term.on(event, cb)
  }

  write (data) {
    this.term.write(data)
  }

  kill () {
    if (this.sessionLogger) {
      this.sessionLogger.destroy()
    }
    this.term && this.term.kill()
    this.onEndConn()
  }
}

exports.session = async function (initOptions, ws) {
  const inst = new TerminalLocal(initOptions, ws)
  await inst.init()
  return inst
}

/**
 * test ssh connection
 * @param {object} options
 */
exports.test = (initOptions) => {
  return Promise.resolve(true)
}
