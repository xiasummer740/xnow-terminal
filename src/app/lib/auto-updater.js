/**
 * electron-updater 驱动
 * 通过 app-update.yml / latest.yml 检测更新，下载后触发安装
 */

const { autoUpdater } = require('electron-updater')

autoUpdater.autoDownload = false
// 下载完成的更新在用户退出应用时静默装上，下次启动就是新版（ISSUES #24）。
// 这不等于"强制重启"：用户点了退出才生效，不会打断正在做的事，
// 只是省掉"必须记得点一次立即重启"这一步 —— 即「像微信一样静默」的既定偏好。
autoUpdater.autoInstallOnAppQuit = true

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

/**
 * 用户点了「立即安装并重启」→ 静默安装，不要再弹安装向导（ISSUES #24）
 *
 * electron-updater 的签名是 quitAndInstall(isSilent = false, isForceRunAfter = false)，
 * 而 NsisUpdater.doInstall 里 `if (isSilent) args.push('/S')` ——
 * 不给参数就**不会**追加 `/S`，用户会看到 NSIS 向导，得自己一路点下去。
 * 两个参数都给 true：静默安装 + 装完自动把应用拉起来，与按钮文案一致。
 */
function quitAndInstall () {
  autoUpdater.quitAndInstall(true, true)
}

module.exports = { checkForUpdates, downloadUpdate, quitAndInstall }
