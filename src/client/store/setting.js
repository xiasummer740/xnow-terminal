/**
 * setting modal
 */

import message from '../components/common/message'
import copy from 'json-deep-copy'
import {
  settingMap,
  settingCommonId,
  settingSyncId,
  settingNezhaId,
  modals
} from '../common/constants'
import { buildNewTheme } from '../common/terminal-theme'
import getInitItem from '../common/init-setting-item'
import newTerm from '../common/new-terminal'
import settingList from '../common/setting-list'

const e = window.translate

export default Store => {
  Store.prototype.setConfig = function (conf) {
    const { store } = window
    Object.assign(
      store._config,
      copy(conf)
    )
  }
  Store.prototype.setSftpSortSetting = function (conf) {
    Object.assign(
      window.store.sftpSortSetting,
      conf
    )
  }

  Store.prototype.openBookmarkEdit = function (item) {
    const { store } = window
    store.storeAssign({
      settingTab: settingMap.bookmarks
    })
    store.setSettingItem(item)
    store.openSettingModal()
  }

  Store.prototype.handleOpenQuickCommandsSetting = function () {
    const { store } = window
    store.storeAssign({
      settingTab: settingMap.quickCommands
    })
    store.setSettingItem(getInitItem([], settingMap.quickCommands))
    store.openSettingModal()
  }

  Store.prototype.onSelectHistory = function (tab) {
    const { store } = window
    store.addTab({
      ...copy(tab),
      ...newTerm(true, true),
      batch: window.openTabBatch ?? store.currentLayoutBatch
    })
    delete window.openTabBatch
  }

  Store.prototype.onSelectBookmark = function (id) {
    const { store } = window
    const bookmarks = store.bookmarks
    const item = copy(
      bookmarks.find(it => it.id === id)
    )
    if (!item) {
      return
    }
    store.addTab({
      ...item,
      from: 'bookmarks',
      srcId: item.id,
      ...newTerm(true, true),
      batch: window.openTabBatch ?? store.currentLayoutBatch
    })

    delete window.openTabBatch
  }

  Store.prototype.openSetting = function () {
    const { store } = window
    if (
      store.settingTab === settingMap.setting &&
      store.settingItem.id === settingCommonId &&
      store.showModal === modals.setting
    ) {
      return store.hideSettingModal()
    }
    store.settingTab = settingMap.setting
    store.setSettingItem(getInitItem([], settingMap.setting))
    store.openSettingModal()
  }

  Store.prototype.openNezhaSetting = function () {
    const { store } = window
    store.settingTab = settingMap.setting
    store.setSettingItem({ id: settingNezhaId, title: 'XNOW 监控' })
    store.openSettingModal()
  }

  Store.prototype.openSettingSync = function () {
    const { store } = window
    if (
      store.settingTab === settingMap.setting &&
      store.settingItem.id === settingList()[0].id &&
      store.showModal === modals.setting
    ) {
      return store.hideSettingModal()
    }
    store.storeAssign({
      settingTab: settingMap.setting
    })
    store.setSettingItem(settingList().find(d => d.id === settingSyncId))
    store.openSettingModal()
  }

  Store.prototype.openTerminalThemes = function () {
    const { store } = window
    if (
      store.settingTab === settingMap.terminalThemes &&
      store.settingItem.id === ''
    ) {
      return store.hideSettingModal()
    }
    store.storeAssign({
      settingTab: settingMap.terminalThemes
    })
    store.setSettingItem(buildNewTheme())
    store.openSettingModal()
  }

  Store.prototype.openSettingModal = function () {
    const { store } = window
    if (store.isSecondInstance) {
      return message.warning(
        e('sencondInstanceTip')
      )
    }
    store.showModal = modals.setting
  }

  Store.prototype.hideSettingModal = function () {
    const { store } = window
    store.showModal = modals.hide
    store.setSettingItem({})
  }

  Store.prototype.loadFontList = async function () {
    const fonts = await window.pre.runGlobalAsync('loadFontList')
      .catch(err => {
        console.log('loadFontList error', err)
        return []
      })
    window.et.fonts = fonts
  }

  Store.prototype.handleChangeSettingTab = function (settingTab) {
    const { store } = window
    const arr = store.getItems(settingTab)
    const item = getInitItem(arr, settingTab)
    store.storeAssign({
      settingTab
    })
    store.setSettingItem(item)
  }

  Store.prototype.testNezhaConnection = async function () {
    const { nezha } = window.store.config
    if (!nezha?.dashboardUrl || !nezha?.apiToken) {
      return { success: false, error: '未配置 Dashboard 地址或 API Token' }
    }
    const url = `${nezha.dashboardUrl.replace(/\/+$/, '')}/api/v1/server`
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${nezha.apiToken}` }
      })
      if (!res.ok) {
        return { success: false, error: `HTTP ${res.status}` }
      }
      const json = await res.json()
      const servers = json?.data || json || []
      const count = Array.isArray(servers) ? servers.length : 0
      return { success: true, count }
    } catch (e) {
      return { success: false, error: e.message || '连接异常' }
    }
  }
}
