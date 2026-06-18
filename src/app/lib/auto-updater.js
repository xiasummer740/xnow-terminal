/**
 * electron-updater 驱动
 * 通过 app-update.yml / latest.yml 检测更新，下载后触发安装
 */

const { autoUpdater } = require('electron-updater')
const { BrowserWindow } = require('electron')

autoUpdater.autoDownload = false
autoUpdater.autoInstallOnAppQuit = false

autoUpdater.logger = {
  info (msg) { console.log('[autoUpdater]', msg) },
  warn (msg) { console.warn('[autoUpdater]', msg) },
  error (msg) { console.error('[autoUpdater]', msg) }
}

let _mainWin = null
let _checkInProgress = false

function send (channel, data) {
  try {
    if (_mainWin && !_mainWin.isDestroyed()) {
      _mainWin.webContents.send(channel, data)
    }
  } catch {}
}

autoUpdater.on('checking-for-update', () => {
  send('auto-update-status', { status: 'checking' })
})

autoUpdater.on('update-available', (info) => {
  _checkInProgress = false
  send('auto-update-status', {
    status: 'available',
    version: info.version,
    releaseDate: info.releaseDate,
    releaseNotes: info.releaseNotes
  })
})

autoUpdater.on('update-not-available', (info) => {
  _checkInProgress = false
  send('auto-update-status', { status: 'not-available' })
})

autoUpdater.on('download-progress', (progress) => {
  send('auto-update-status', {
    status: 'downloading',
    percent: Math.round(progress.percent),
    bytesPerSecond: progress.bytesPerSecond,
    transferred: progress.transferred,
    total: progress.total
  })
})

autoUpdater.on('update-downloaded', (info) => {
  send('auto-update-status', { status: 'downloaded', version: info.version })
})

autoUpdater.on('error', (err) => {
  _checkInProgress = false
  send('auto-update-status', { status: 'error', message: err ? err.message : '未知错误' })
})

function checkForUpdates (win) {
  if (_checkInProgress) return
  _checkInProgress = true
  _mainWin = win || _mainWin
  autoUpdater.checkForUpdates()
}

function downloadUpdate () {
  _checkInProgress = true
  autoUpdater.downloadUpdate()
}

function quitAndInstall () {
  autoUpdater.quitAndInstall()
}

module.exports = { checkForUpdates, downloadUpdate, quitAndInstall }
