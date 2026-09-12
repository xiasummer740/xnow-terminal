/**
 * common functions
 */

import handleError from '../common/error-handler'
import Modal from '../components/common/modal'
import { debounce, some, get, pickBy } from 'lodash-es'
import tl from '../common/timeline'
import {
  leftSidebarWidthKey,
  rightSidebarWidthKey,
  addPanelWidthLsKey,
  dismissDelKeyTipLsKey,
  connectionMap,
  rightPanelAIWidthLsKey,
  rightPanelVPSWidthLsKey
} from '../common/constants'
import * as ls from '../common/safe-local-storage'
import { refs, refsStatic } from '../components/common/ref'
import { action } from 'manate'
import uid from '../common/uid'
import deepCopy from 'json-deep-copy'
import { aiConfigsArr } from '../components/ai/ai-config-props'

const e = window.translate
const { assign } = Object

export default Store => {
  Store.prototype.storeAssign = function (updates) {
    assign(window.store, updates)
  }

  Store.prototype.onError = function (e) {
    handleError(e)
  }

  Store.prototype.updateConfig = function (ext) {
    window.store.setConfig(ext)
  }

  Store.prototype.openInfoPanel = action(function () {
    const { store } = window
    const hasHost = !!(store.currentTab && store.currentTab.host)
    if (!hasHost) return // 无 host 时 VPS 面板不会渲染，不做任何操作
    const currentlyVisible = !store._vpsForceClosed
    if (currentlyVisible) {
      // 当前可见 → 关闭：先隐藏面板，再缩回窗口
      tl('VPS面板', '关闭')
      store._vpsForceOpen = false
      store._vpsForceClosed = true
      store.innerWidth = window.innerWidth - store.rightPanelVPSWidth
      window.pre.runGlobalAsync('resizeWindow', {
        width: window.outerWidth - store.rightPanelVPSWidth,
        height: window.outerHeight
      })
    } else {
      // 当前隐藏 → 打开：先扩展窗口，下一帧再显示面板
      tl('VPS面板', '打开')
      window.pre.runGlobalAsync('resizeWindow', {
        width: window.outerWidth + store.rightPanelVPSWidth,
        height: window.outerHeight
      })
      requestAnimationFrame(() => {
        store._vpsForceOpen = true
        store._vpsForceClosed = false
        store.innerWidth = window.innerWidth
        store.openInfoPanelAction()
      })
    }
  })

  Store.prototype.openInfoPanelAction = function () {
    const { store } = window
    setTimeout(() => {
      const term = refs.get('term-' + store.activeTabId)
      term && term.handleShowInfo()
    }, 300)
  }

  Store.prototype.toggleAIConfig = function () {
    window.store.showAIConfigModal = true
  }

  Store.prototype.toggleSkillStore = function () {
    this.showSkillStoreModal = !this.showSkillStoreModal
  }

  Store.prototype.toggleSkillDiscovery = function () {
    this.showSkillDiscovery = !this.showSkillDiscovery
  }

  Store.prototype.clearPendingDraft = function () {
    this.pendingSkillDraft = null
    this.showSkillDiscovery = false
  }

  Store.prototype.onResize = debounce(async function () {
    const { width, height } = await window.pre.runGlobalAsync('getScreenSize')
    const isMaximized = window.pre.runSync('isMaximized')
    const update = {
      height: window.innerHeight,
      innerWidth: window.innerWidth,
      screenWidth: width,
      screenHeight: height,
      isMaximized
    }
    window.store.storeAssign(update)
    window.pre.runGlobalAsync('setWindowSize', {
      ...update,
      height: window.outerHeight
    })
  }, 100, {
    leading: true
  })

  Store.prototype.toggleTerminalSearch = function () {
    const now = Date.now()
    if (window.lastToggleTerminalSearch && now - window.lastToggleTerminalSearch < 300) {
      return
    }
    window.lastToggleTerminalSearch = now
    window.store.termSearchOpen = !window.store.termSearchOpen
  }

  Store.prototype.setState = function (name, value) {
    window.store['_' + name] = JSON.stringify(value)
  }

  Store.prototype.setSettingItem = function (v) {
    window.store.settingItem = v
  }

  Store.prototype.setTermSearchOption = function (update) {
    Object.assign(window.store._termSearchOptions, update)
  }

  Store.prototype.setLeftSidePanelWidth = function (v) {
    ls.setItem(leftSidebarWidthKey, v)
    window.store.leftSidebarWidth = v
  }

  Store.prototype.setAddPanelWidth = function (v) {
    ls.setItem(addPanelWidthLsKey, v)
    window.store.addPanelWidth = v
  }

  Store.prototype.setRightSidePanelWidth = function (v) {
    ls.setItem(rightSidebarWidthKey, v)
    window.store.rightPanelWidth = v
  }
  Store.prototype.dismissDelKeyTip = function (v) {
    ls.setItem(dismissDelKeyTipLsKey, 'y')
    window.store.hideDelKeyTip = true
  }
  /**
   * 退出前把待写的配置立刻落盘（ISSUES #49）
   *
   * 配置保存走的是 100ms debounce（watch.js:86-91），而 `beforeExit` /
   * `beforeExitApp` 原来只弹确认框、**不 flush** —— 于是「刚改完设置就关窗」
   * （尤其是没开 confirmBeforeExit 时）那 100ms 窗口里的改动就丢了。
   *
   * 这里不依赖 debounce 定时器，而是把当前配置**再发一次** saveUserConfig：
   * 消息一旦派发给主进程，写盘是在主进程里完成的，**渲染进程随后被销毁也不影响**，
   * 所以这比「等 debounce 到点」可靠。用户若在确认框上点了取消也无妨 ——
   * 保存当前配置本来就是幂等的。
   */
  function flushConfigSave () {
    const config = window.store.config
    if (config && Object.keys(config).length > 0) {
      window.pre.runGlobalAsync('saveUserConfig', config)
    }
  }

  Store.prototype.beforeExit = function (evt) {
    flushConfigSave()
    const { confirmBeforeExit } = window.store.config
    const activeTransfers = window.store.fileTransfers?.filter(t => t.status === 'transferring') || []
    if (
      (confirmBeforeExit &&
      !window.confirmExit) ||
      window.store.isTransporting
    ) {
      evt.returnValue = false
      let mod = null
      const transferWarn = activeTransfers.length > 0
        ? `有 ${activeTransfers.length} 个文件正在传输，关闭将中断传输。`
        : ''
      mod = Modal.confirm({
        onCancel: () => {
          window.confirmExit = false
          mod.destroy()
        },
        onOk: () => {
          window.confirmExit = true
          window.store[window.exitFunction]()
        },
        title: e('quit'),
        okText: transferWarn ? '强制关闭' : e('ok'),
        cancelText: e('cancel'),
        content: transferWarn
      })
    }
  }
  Store.prototype.beforeExitApp = function (evt, name) {
    flushConfigSave()
    const activeTransfers = window.store.fileTransfers?.filter(t => t.status === 'transferring') || []
    const transferWarn = activeTransfers.length > 0
      ? `有 ${activeTransfers.length} 个文件正在传输，关闭将中断传输。`
      : ''
    let mod = null
    mod = Modal.confirm({
      onCancel: () => {
        window.pre.runGlobalAsync('setCloseAction', 'closeApp')
        mod.destroy()
      },
      onOk: () => {
        window.pre.runGlobalAsync(name)
      },
      title: e('quit'),
      okText: transferWarn ? '强制关闭' : e('ok'),
      cancelText: e('cancel'),
      content: transferWarn
    })
  }

  Store.prototype.toggleResolutionEdit = function () {
    window.store.openResolutionEdit = !window.store.openResolutionEdit
  }

  Store.prototype.setTerminalInfos = function (arr) {
    window.store.setConfig({
      terminalInfos: arr
    })
  }

  Store.prototype.applyProfile = function (tab) {
    const {
      profile,
      type,
      authType
    } = tab
    if (!profile || authType !== 'profiles') {
      return tab
    }
    let p = window.store.profiles.find(x => x.id === profile)
    if (!p) {
      return tab
    }
    p = deepCopy(p)
    // delete tab.password
    // delete tab.privateKey
    // delete tab.passphrase
    delete p.name
    delete p.id
    if (type === connectionMap.rdp) {
      const filtered = pickBy(p.rdp, (value) => value !== undefined && value !== '')
      return {
        ...tab,
        ...filtered
      }
    } else if (type === connectionMap.vnc) {
      const filtered = pickBy(p.vnc, (value) => value !== undefined && value !== '')
      return {
        ...tab,
        ...filtered
      }
    } else if (type === connectionMap.telnet) {
      const filtered = pickBy(p.telnet, (value) => value !== undefined && value !== '')
      return {
        ...tab,
        ...filtered
      }
    }
    delete p.rdp
    delete p.vnc
    delete p.telnet
    const filtered = pickBy(p, (value) => value !== undefined && value !== '')
    return {
      ...tab,
      ...filtered
    }
  }
  Store.prototype.applyProfileToTabs = function (tab) {
    if (
      tab.connectionHoppings &&
      tab.connectionHoppings.length &&
      some(tab.connectionHoppings, s => s.profile)
    ) {
      tab.connectionHoppings = tab.connectionHoppings.map(s => {
        return window.store.applyProfile(s)
      })
    }
    return window.store.applyProfile(tab)
  }

  Store.prototype.handleOpenAIPanel = function () {
    const { store } = window
    const opening = !store.rightPanelAIVisible
    tl('AI面板', opening ? '打开' : '关闭')
    const delta = opening ? store.rightPanelAIWidth : -store.rightPanelAIWidth
    if (opening) {
      // 打开：先扩展窗口，等浏览器 resize 事件处理完再显示面板
      // （直接设置 visible 会导致 window.innerWidth 还是旧值，终端被压缩）
      window.pre.runGlobalAsync('resizeWindow', {
        width: window.outerWidth + delta,
        height: window.outerHeight
      })
      requestAnimationFrame(() => {
        store.rightPanelAIVisible = true
        store.innerWidth = window.innerWidth
      })
    } else {
      // 关闭：先隐藏面板，再缩回窗口
      store.rightPanelAIVisible = false
      window.pre.runGlobalAsync('resizeWindow', {
        width: window.outerWidth + delta,
        height: window.outerHeight
      })
      store.innerWidth = window.innerWidth + delta
    }
  }

  Store.prototype.explainWithAi = function (txt) {
    const { store } = window
    const wasVisible = store.rightPanelAIVisible
    const delta = store.rightPanelAIWidth
    if (!wasVisible) {
      window.pre.runGlobalAsync('resizeWindow', {
        width: window.outerWidth + delta,
        height: window.outerHeight
      })
      requestAnimationFrame(() => {
        store.rightPanelAIVisible = true
      })
    }
    store.innerWidth = window.innerWidth + delta
    setTimeout(() => {
      refsStatic.get('AIChat')?.setPrompt(`explain terminal output: ${txt}`)
    }, 500)
    setTimeout(() => {
      refsStatic.get('AIChat')?.handleSubmit()
    }, 1200)
  }

  Store.prototype.setRightPanelAIWidth = function (w) {
    const { store } = window
    store.rightPanelAIWidth = w
    ls.setItem(rightPanelAIWidthLsKey, String(w))
  }

  Store.prototype.setRightPanelVPSWidth = function (w) {
    const { store } = window
    store.rightPanelVPSWidth = w
    ls.setItem(rightPanelVPSWidthLsKey, String(w))
  }

  Store.prototype.runCommandInTerminal = function (cmd) {
    window.store.batchInputSelectedTabIds.forEach(id => {
      refs.get('term-' + id)?.runQuickCommand(cmd)
    })
  }

  Store.prototype.removeAiHistory = function (id) {
    const { store } = window
    const index = store.aiChatHistory.findIndex(d => d.id === id)
    if (index === -1) {
      return
    }
    window.store.aiChatHistory.splice(index, 1)
  }

  Store.prototype.getLangName = function (
    lang = window.store?.config.language || 'en_us'
  ) {
    return get(window.langMap, `[${lang}].name`)
  }

  Store.prototype.getLangNames = function () {
    return window.et.langs.map(d => d.name)
  }

  Store.prototype.fixProfiles = function () {
    const { profiles } = window.store
    const len = profiles.length
    let i = len - 1
    for (;i >= 0; i--) {
      const f = profiles[i]
      if (f.name) {
        continue
      }
      let count = 0
      let id = 'PROFILE' + i
      while (profiles.find(d => d.id === id)) {
        count = count + 1
        id = 'PROFILE' + count
      }
      const np = deepCopy(f)
      np.id = id
      np.name = id
      profiles.splice(i, 1, np)
    }
  }

  Store.prototype.makeSureProfileDefault = function (defaultId) {
    const { profiles } = window.store
    for (const p of profiles) {
      if (p.id !== defaultId) {
        delete p.isDefault
      }
    }
  }

  Store.prototype.aiConfigMissing = function () {
    return aiConfigsArr.filter(k => k !== 'apiKeyAI' && k !== 'proxyAI').some(k => !window.store.config[k])
  }

  Store.prototype.clearHistory = function () {
    window.store.history = []
  }

  Store.prototype.addCmdHistory = action(function (cmd) {
    if (!cmd || !cmd.trim()) {
      return
    }
    const { terminalCommandHistory } = window.store
    const existing = terminalCommandHistory.find(item => item.cmd === cmd)
    if (existing) {
      existing.count = existing.count + 1
      existing.lastUseTime = new Date().toISOString()
    } else {
      terminalCommandHistory.push({
        id: uid(),
        cmd,
        count: 1,
        lastUseTime: new Date().toISOString()
      })
    }
    if (terminalCommandHistory.length > 200) {
      // Delete oldest 20 items when history exceeds 100
      terminalCommandHistory.sort((a, b) => new Date(a.lastUseTime).getTime() - new Date(b.lastUseTime).getTime())
      terminalCommandHistory.splice(0, 20)
    }
  })

  Store.prototype.deleteCmdHistory = function (cmd) {
    const { terminalCommandHistory } = window.store
    const idx = terminalCommandHistory.findIndex(item => item.cmd === cmd)
    if (idx !== -1) {
      terminalCommandHistory.splice(idx, 1)
    }
  }

  Store.prototype.clearAllCmdHistory = function () {
    window.store.terminalCommandHistory = []
  }

  Store.prototype.runCmdFromHistory = function (cmd) {
    window.store.runQuickCommand(cmd)
    window.store.addCmdHistory(cmd)
  }
}
