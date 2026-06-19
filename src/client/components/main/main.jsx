import { auto } from 'manate/react'
import { useEffect } from 'react'
import Layout from '../layout/layout'
import FileInfoModal from '../sftp/file-info-modal'
import UpdateCheck from './upgrade'
import SettingModal from '../setting-panel/setting-modal'
import TextEditor from '../text-editor/text-editor-entry'
import Sidebar from '../sidebar'
import CssOverwrite from '../bg/css-overwrite'
import UiTheme from './ui-theme'
import CustomCss from '../bg/custom-css.jsx'
import Resolutions from '../rdp/resolution-edit'
import TerminalInteractive from '../terminal/terminal-interactive'
import ConfirmModalStore from '../file-transfer/conflict-resolve.jsx'
import TransferQueue from '../file-transfer/transfer-queue'
import Remote2RemoteHandlers from '../file-transfer/remote2remote-handlers.jsx'
import TerminalCmdSuggestions from '../terminal/terminal-command-dropdown'
import TransportsActionStore from '../file-transfer/transports-action-store.jsx'
import classnames from 'classnames'
import ShortcutControl from '../shortcuts/shortcut-control.jsx'
import { isMac, isWin, textTerminalBgValue } from '../../common/constants'
import { ConfigProvider } from 'antd'
import { NotificationContainer } from '../common/notification'
import InfoModal from '../sidebar/info-modal.jsx'
import RightPanelContainer from '../right-panel/right-panel-container'
import WindowControl from '../tabs/window-control'
import ConnectionHoppingWarning from './connection-hopping-warnning'
import QuickSearch from '../quick-search/quick-search'
import SshConfigLoadNotify from '../ssh-config/ssh-config-load-notify'
import LoadSshConfigs from '../ssh-config/load-ssh-configs'
import AIConfigModal from '../ai/ai-config-modal'
import Opacity from '../common/opacity'
import MoveItemModal from '../tree-list/move-item-modal'
import InputContextMenu from '../common/input-context-menu'
import WorkspaceSaveModal from '../tabs/workspace-save-modal'
import BookmarkFromHistoryModal from '../bookmark-form/bookmark-from-history-modal'
import AutoSync from '../setting-sync/auto-sync'
import BatchOpRunner from '../batch-op/batch-op-runner'
import UnixTimestampTooltip from '../terminal/unix-timestamp-tooltip'
import { pick } from 'lodash-es'
import deepCopy from 'json-deep-copy'
import tl from '../../common/timeline'
import './wrapper.styl'
import './term-fullscreen.styl'

// 简易文件日志（排查用）：window.pre.runGlobalAsync('writeLog', '消息')
// 日志路径：os.tmpdir() + '/xnow-debug.log'
// 不需要时才删除下面这组 IPC 注册

export default auto(function Index (props) {
  useEffect(() => {
    const { store } = props
    window.addEventListener('resize', store.onResize)
    setTimeout(store.triggerResize, 200)
    const { ipcOnEvent } = window.pre
    ipcOnEvent('checkupdate', store.onCheckUpdate)
    // electron-updater 事件：可用/下载进度/完成
    ipcOnEvent('auto-update-status', (e, data) => {
      if (store.onAutoUpdateStatus) store.onAutoUpdateStatus(data)
    })
    // 窗口最大化/还原状态同步（OS 事件 → store）
    ipcOnEvent('window-state-change', (e, { isMaximized }) => {
      tl('窗口状态', isMaximized ? '最大化' : '还原')
      store.isMaximized = isMaximized
      store.resizeTrigger = (store.resizeTrigger || 0) + 1
    })
    // 启动后自动检查更新（延迟5秒，避免启动卡顿）
    setTimeout(() => store.onCheckUpdate(false), 5000)
    ipcOnEvent('open-about', store.openAbout)
    ipcOnEvent('new-ssh', store.onNewSsh)
    ipcOnEvent('add-tab-from-command-line', store.addTabFromCommandLine)
    ipcOnEvent('open-tab', (e, parsed) => store.ipcOpenTab(parsed))
    ipcOnEvent('openSettings', store.openSetting)
    ipcOnEvent('selectall', store.selectall)
    ipcOnEvent('focused', store.focus)
    ipcOnEvent('blur', store.onBlur)
    ipcOnEvent('zoom-reset', store.onZoomReset)
    ipcOnEvent('zoomin', store.onZoomIn)
    ipcOnEvent('zoomout', store.onZoomout)
    ipcOnEvent('confirm-exit', store.beforeExitApp)

    document.addEventListener('drop', function (e) {
      e.preventDefault()
      e.stopPropagation()
    })
    document.addEventListener('dragover', function (e) {
      e.preventDefault()
      e.stopPropagation()
    })
    window.addEventListener('offline', store.setOffline)
    if (window.et.isWebApp) {
      window.onbeforeunload = store.beforeExit
    }
    store.isSecondInstance = window.pre.runSync('isSecondInstance')
    store.initData()
    store.checkForDbUpgrade()
    store.handleGetSerials()
    store.checkPendingDeepLink()

    // 自动启动后台延迟监控（所有书签的 host）
    setTimeout(() => {
      if (store.config?.bgMonitor === false) return
      const hosts = (store.bookmarks || [])
        .filter(b => b.host)
        .map(b => b.host)
      if (hosts.length) {
        window.pre.runGlobalAsync('startBgPing', [...new Set(hosts)])
      }
    }, 3000)
  }, [])

  const { store } = props
  const {
    configLoaded,
    config,
    fullscreen,
    pinned,
    isSecondInstance,
    pinnedQuickCommandBar,
    installSrc,
    fileTransfers,
    uiThemeConfig,
    transferHistory,
    transferToConfirm,
    openResolutionEdit,
  } = store
  const upgradeInfo = deepCopy(store.upgradeInfo)
  const cls = classnames({
    loaded: configLoaded,
    'not-webapp': !window.et.isWebApp,
    'system-ui': store.config.useSystemTitleBar,
    'not-system-ui': !store.config.useSystemTitleBar,
    'is-mac': isMac,
    'not-mac': !isMac,
    'is-win': isWin,
    pinned,
    'not-win': !isWin,
    'qm-pinned': pinnedQuickCommandBar,
    fullscreen,
    'is-main': !isSecondInstance
  })
  const ext1 = {
    className: cls
  }
  // Get active tab IDs
  const activeTabIds = [
    store.activeTabId0,
    store.activeTabId1,
    store.activeTabId2,
    store.activeTabId3
  ].filter(Boolean) // Remove empty strings

  const bgTabs = config.terminalBackgroundImagePath === 'index' ||
                  config.terminalBackgroundImagePath === 'randomShape' ||
                  config.terminalBackgroundImagePath === textTerminalBgValue
    ? store.getTabs().filter(tab => activeTabIds.includes(tab.id))
    : store.getTabs().filter(tab =>
      activeTabIds.includes(tab.id) && tab.terminalBackground?.terminalBackgroundImagePath
    )
  const confsCss = {
    ...Object.keys(config)
      .filter(d => d.startsWith('terminalBackground'))
      .reduce((p, k) => ({
        ...p,
        [k]: config[k]
      }), {}),
    activeTabIds,
    tabs: bgTabs.map(tab => {
      return {
        tabCount: tab.tabCount,
        terminalBackground: tab.terminalBackground,
        id: tab.id
      }
    })
  }
  const themeProps = {
    themeConfig: store.getUiThemeConfig()
  }
  const copiedTransfer = deepCopy(fileTransfers)
  const copiedHistory = deepCopy(transferHistory)
  const sidebarProps = {
    ...pick(store, [
      'activeItemId',
      'history',
      'showModal',
      'showInfoModal',
      'openedSideBar',
      'height',
      'settingTab',
      'settingItem',
      'isSyncingSetting',
      'leftSidebarWidth',
      'transferTab',
      'sidebarPanelTab',
      'openWidgetsModal'
    ]),
    fileTransfers: copiedTransfer,
    transferHistory: copiedHistory,
    upgradeInfo,
    pinned
  }

  const infoModalProps = {
    ...pick(store, [
      'infoModalTab',
      'showInfoModal',
      'commandLineHelp'
    ]),
    installSrc,
    upgradeInfo: store.upgradeInfo
  }
  const conflictStoreProps = {
    fileTransferChanged: JSON.stringify(copiedTransfer),
    fileTransfers: copiedTransfer
  }
  const resProps = {
    resolutions: deepCopy(store.resolutions),
    openResolutionEdit
  }

  const sshConfigProps = {
    ...pick(store, [
      'settingTab',
      'showModal',
      'sshConfigs'
    ])
  }
  const warningProps = {
    hasOldConnectionHoppingBookmark: store.hasOldConnectionHoppingBookmark,
    configLoaded
  }
  const cmdSuggestionsProps = {
    suggestions: store.terminalCommandSuggestions
  }
  return (
    <ConfigProvider
      theme={uiThemeConfig}
    >
      <div {...ext1}>
        <InputContextMenu />
        <ShortcutControl config={config} />
        <CssOverwrite
          {...confsCss}
          configLoaded={configLoaded}
        />
        <Opacity opacity={config.opacity} />
        <TerminalInteractive />
        <UiTheme
          {...themeProps}
        />
        <CustomCss customCss={config.customCss} configLoaded={configLoaded} />
        <TextEditor />
        <UpdateCheck
          skipVersion={config.skipVersion}
          upgradeInfo={upgradeInfo}
          installSrc={installSrc}
        />
        <FileInfoModal />
        <SettingModal store={store} />
        <MoveItemModal store={store} />
        <div
          id='outside-context'
        >
          <Sidebar {...sidebarProps} />
          <Layout
            store={store}
          />
        </div>
        <ConfirmModalStore
          transferToConfirm={transferToConfirm}
        />
        <TransportsActionStore
          {...conflictStoreProps}
          config={config}
        />
        <Remote2RemoteHandlers />
        <Resolutions {...resProps} />
        <InfoModal {...infoModalProps} />
        <RightPanelContainer store={store} />
        <WindowControl store={store} />
        <SshConfigLoadNotify {...sshConfigProps} />
        <LoadSshConfigs
          showSshConfigModal={store.showSshConfigModal}
          sshConfigs={store.sshConfigs}
        />
        <ConnectionHoppingWarning {...warningProps} />
        <TerminalCmdSuggestions {...cmdSuggestionsProps} />
        <TransferQueue />
        <AutoSync config={config} />
        <WorkspaceSaveModal store={store} />
        <BookmarkFromHistoryModal />
        <NotificationContainer />
        <QuickSearch />
        <BatchOpRunner />
        <AIConfigModal store={store} />
        <UnixTimestampTooltip />
      </div>
    </ConfigProvider>
  )
})
