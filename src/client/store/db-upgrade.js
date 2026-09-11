/**
 * db upgrade
 */

import Modal from '../components/common/modal'
import delay from '../common/wait'

export default (Store) => {
  Store.prototype.checkForDbUpgrade = async function () {
    const { store } = window
    if (store.isSecondInstance) {
      return false
    }
    const shouldUpgrade = await window.pre.runGlobalAsync('checkDbUpgrade')
    const shouldMigrate = await window.pre.runGlobalAsync('checkMigrate')
    if (!shouldUpgrade && !shouldMigrate) {
      window.migrating = false
      return false
    }
    window.migrating = true
    let mod
    const commonProps = {
      keyboard: false,
      okButtonProps: {
        style: {
          display: 'none'
        }
      }
    }
    if (shouldMigrate) {
      mod = Modal.info({
        title: window.translate('Migrating database'),
        content: window.translate('Migrating database... please wait'),
        ...commonProps
      })
      await window.pre.runGlobalAsync('migrate')
      mod.update({
        title: window.translate('Done'),
        content: window.translate('Database Migrated'),
        okButtonProps: {}
      })
      await delay(2000)
      mod.destroy()
    }
    if (shouldUpgrade) {
      const {
        dbVersion,
        packVersion
      } = shouldUpgrade
      mod = Modal.info({
        title: window.translate('Upgrading database'),
        content: `正在升级数据库…从 v${dbVersion} 升级到 v${packVersion}，请稍候`,
        ...commonProps
      })
      await window.pre.runGlobalAsync('doUpgrade')
      mod.update({
        title: window.translate('Done'),
        content: window.translate('Database Upgraded'),
        okButtonProps: {}
      })
      await delay(2000)
      mod.destroy()
    }
    await store.restart()
    return true
  }
}
