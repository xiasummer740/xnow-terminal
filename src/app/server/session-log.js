/**
 * log ssh output to file
 */

const { resolve } = require('path')
const { existsSync, mkdirSync, createWriteStream } = require('fs')

function mkLogDir(logDir) {
  try {
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true })
    }
  } catch (e) {
    console.debug('创建会话日志目录失败:', e.message)
  }
}

class SessionLog {
  constructor(options) {
    this.options = options
    const { logDir } = options
    const logPath = resolve(logDir, options.fileName)
    mkLogDir(logDir)
    this.stream = createWriteStream(logPath, { flags: 'a' })
  }

  write(text) {
    this.stream.write(text)
  }

  destroy() {
    this.stream.destroy()
  }
}

module.exports = SessionLog
