/**
 * terminal/sftp/serial class
 */

const { resolve: pathResolve } = require('path')
const { TerminalBase } = require('./session-base')
const globalState = require('./global-state')
// const { MockBinding } = require('@serialport/binding-mock')
// MockBinding.createPort('/dev/ROBOT', { echo: true, record: true })

class TerminalLocal extends TerminalBase {
  init () {
    // 本地终端功能已禁用（node-pty 模块未编译）
    return Promise.reject(new Error('本地终端功能暂不可用，请使用 SSH 连接远程服务器'))
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

exports.session = function (initOptions, ws) {
  return (new TerminalLocal(initOptions, ws)).init()
}

/**
 * test ssh connection
 * @param {object} options
 */
exports.test = (initOptions) => {
  return Promise.resolve(true)
}
