/**
 * terminal/sftp/serial class
 */

const log = require('../common/log')
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

      log.debug('[local-term] spawning:', shell, cols + 'x' + rows)

      const defaultCwd = process.env.USERPROFILE || process.env.HOME || os.homedir()
      const targetCwd = this.initOptions.cwd || defaultCwd
      // 确保 cwd 有效，否则回退到 home
      let finalCwd = defaultCwd
      try {
        require('fs').statSync(targetCwd)
        finalCwd = targetCwd
      } catch (_) {
        log.warn('[local-term] cwd not accessible, fallback:', targetCwd)
      }
      this.term = pty.spawn(shell, [], {
        name: 'xterm-color',
        cols,
        rows,
        cwd: finalCwd,
        env: process.env
      })

      this.isLocal = true
      globalState.setSession(this.pid, this)
      log.debug('[local-term] spawned PID:', this.term.pid)

      // Data forwarding via session-server's term.on('data') → this.on()
      const origOn = this.on.bind(this)
      this.on = (event, cb) => {
        log.debug('[local-term] on event:', event)
        if (event === 'close') {
          return this.term.on('exit', cb)
        }
        return origOn(event, cb)
      }

      return Promise.resolve()
    } catch (e) {
      log.error('[local-term] init error:', e.message)
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
    const str = Buffer.isBuffer(data) ? data.toString('utf8') : data
    log.debug('[local-term] → write(' + str.length + '):', str.substring(0, 80))
    this.term.write(str)
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
