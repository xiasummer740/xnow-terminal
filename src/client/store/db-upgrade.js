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
    // 失败标记：决定弹窗是否自动关闭、以及是否还要重启
    let failed = false
    // 弹窗隐藏了确定按钮，一旦下面的 await reject，弹窗就永远关不掉（ISSUES #28）
    // 所以失败时必须把按钮放出来，并把原因显示给用户；也绝不能谎报"完成"
    const commonProps = {
      keyboard: false,
      okButtonProps: {
        style: {
          display: 'none'
        }
      }
    }
    const fail = (err) => {
      failed = true
      mod.update({
        title: window.translate('Database error'),
        content: `${window.translate('Database operation failed')}：${err?.message || err}`,
        okButtonProps: {}
      })
      console.error('[DB] 数据库迁移/升级失败:', err)
    }
    if (shouldMigrate) {
      mod = Modal.info({
        title: window.translate('Migrating database'),
        content: window.translate('Migrating database... please wait'),
        ...commonProps
      })
      try {
        await window.pre.runGlobalAsync('migrate')
        mod.update({
          title: window.translate('Done'),
          content: window.translate('Database Migrated'),
          okButtonProps: {}
        })
      } catch (err) {
        fail(err)
      }
      if (!failed) {
        await delay(2000)
        mod.destroy()
      }
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
      try {
        await window.pre.runGlobalAsync('doUpgrade')
        mod.update({
          title: window.translate('Done'),
          content: window.translate('Database Upgraded'),
          okButtonProps: {}
        })
      } catch (err) {
        fail(err)
      }
      if (!failed) {
        await delay(2000)
        mod.destroy()
      }
    }
    // 失败时不能重启（数据库可能处于半迁移状态），也不能让 migrating 卡住
    // —— watch.js 里 migrating 为真会跳过所有同步，卡住 = 同步永久停摆
    if (failed) {
      window.migrating = false
      return false
    }
    await store.restart()
    return true
  }
}
