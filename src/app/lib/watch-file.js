const log = require("../common/log")
const fs = require('original-fs')
const globalState = require('./glob-state')
const _ = require('./lodash.js')

const onWatch = _.debounce(
  () => {
    try {
      const filePath = globalState.get('watchFilePath')
      if (fs.existsSync(filePath)) {
        const text = fs.readFileSync(filePath, 'utf8')
        globalState.get('win').webContents.send('file-change', text)
      } else {
        log.info('Watched file no longer exists')
        globalState.get('win').webContents.send('file-deleted')
      }
    } catch (e) {
      log.error('Error reading file:', e)
      globalState.get('win').webContents.send('file-read-error', e.message)
    }
  },
  300,
  { leading: false, trailing: true },
)

exports.watchFile = (path) => {
  globalState.set('watchFilePath', path)
  fs.watchFile(path, onWatch)
}

exports.unwatchFile = (path) => {
  globalState.set('watchFilePath', '')
  fs.unwatchFile(path, onWatch)
}

exports.cleanWatchFile = () => {
  const filePath = globalState.get('watchFilePath')
  globalState.set('watchFilePath', '')
  if (!filePath) {
    return
  }
  fs.unwatchFile(filePath, onWatch)
}

process.on('exit', exports.cleanWatchFile)
