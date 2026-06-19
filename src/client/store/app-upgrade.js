/**
 * app upgrade
 */

import { refsStatic } from '../components/common/ref'

export default Store => {
  Store.prototype.onCheckUpdate = (isManual = false) => {
    refsStatic.get('upgrade')?.handleCheckUpdate(isManual)
  }

  // electron-updater 状态更新
  Store.prototype.onAutoUpdateStatus = function (data) {
    const info = window.store.upgradeInfo
    const { status, version, percent, message, releaseNotes } = data
    switch (status) {
      case 'checking':
        info.checking = true
        break
      case 'available':
        info.checking = false
        info.shouldUpgrade = true
        info.showUpgradeModal = true
        info.latestVersion = version
        info.releaseNotes = releaseNotes
        break
      case 'not-available':
        info.checking = false
        info.noUpdateMessage = '已是最新版本'
        info.noUpdateMessageExpires = Date.now() + 3000
        break
      case 'downloading':
        info.downloading = true
        info.percent = percent || 0
        break
      case 'downloaded':
        info.downloading = false
        info.percent = 100
        info.readyToInstall = true
        break
      case 'error':
        info.checking = false
        info.downloading = false
        info.error = message || '更新失败'
        break
    }
  }
  Store.prototype.getProxySetting = function () {
    const {
      proxy,
      enableGlobalProxy
    } = window.store.config
    if (!enableGlobalProxy) {
      return ''
    }
    return typeof proxy !== 'string' ? '' : proxy
  }
}
