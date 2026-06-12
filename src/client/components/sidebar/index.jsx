import {
  BookOutlined,
  CloudSyncOutlined,
  InfoCircleOutlined,
  PictureOutlined,
  PlusCircleOutlined,
  SettingOutlined,
  UpCircleOutlined,
  AppstoreOutlined,
  ThunderboltOutlined,
  DashboardOutlined,
  BulbOutlined,
} from '@ant-design/icons'
import { Tooltip, Popover } from 'antd'
import { useState, useEffect } from 'react'
import SideBarPanel from './sidebar-panel'
import TransferList from './transfer-list'
import MenuBtn from '../sys-menu/menu-btn'
import QuickConnect from '../tabs/quick-connect'
import { sidebarWidth, settingMap, modals } from '../../common/constants'
import SideIcon from './side-icon'
import SidePanel from './side-panel'
import hasActiveInput from '../../common/has-active-input'
import VpsDashboard from '../vps-dashboard/vps-dashboard'
import './sidebar.styl'

const e = window.translate

export default function Sidebar(props) {
  const {
    height,
    upgradeInfo,
    settingTab,
    settingItem,
    isSyncingSetting,
    leftSidebarWidth,
    pinned,
    fileTransfers,
    openedSideBar,
    transferHistory,
    transferTab,
    showModal,
    showInfoModal,
    sidebarPanelTab,
    openWidgetsModal,
  } = props

  const { store } = window
  const [vpsDashboardOpen, setVpsDashboardOpen] = useState(false)
  const [lightTheme, setLightTheme] = useState(
    () => localStorage.getItem('xnow_light_theme') === '1',
  )

  const toggleTheme = () => {
    const next = !lightTheme
    setLightTheme(next)
    localStorage.setItem('xnow_light_theme', next ? '1' : '0')
    // 通过 store 切换主题配置，CSS 变量会自动响应
    store.updateConfig({
      theme: next ? 'defaultLight' : 'defaultDark',
    })
  }

  // 初始化主题
  useEffect(() => {
    if (lightTheme) {
      store.updateConfig({ theme: 'defaultLight' })
    }
  }, [])

  const handleClickOutside = (event) => {
    // Don't close if pinned or has active input
    if (store.pinned || hasActiveInput()) {
      return
    }

    // Check if click is outside the sidebar panel
    const sidebarPanel = document.querySelector('.sidebar-panel')
    if (sidebarPanel && !sidebarPanel.contains(event.target)) {
      store.setOpenedSideBar('')
      document.removeEventListener('click', handleClickOutside)
    }
  }

  const handleClickBookmark = () => {
    if (showModal) {
      store.showModal = 0
    }
    if (pinned) {
      return
    }
    if (openedSideBar === 'bookmarks') {
      // Remove listener when closing
      document.removeEventListener('click', handleClickOutside)
      store.setOpenedSideBar('')
    } else {
      // Add listener when opening, with slight delay to avoid conflict with this click
      setTimeout(() => {
        document.addEventListener('click', handleClickOutside)
      }, 0)
      store.setOpenedSideBar('bookmarks')
    }
  }

  const handleShowUpgrade = () => {
    window.store.upgradeInfo.showUpgradeModal = true
  }

  const {
    onNewSsh,
    openSetting,
    openAbout,
    openSettingSync,
    openTerminalThemes,
    setLeftSidePanelWidth,
  } = store
  const { showUpgradeModal, upgradePercent, checkingRemoteVersion, shouldUpgrade } = upgradeInfo
  const showSetting = showModal === modals.setting
  const settingActive =
    showSetting && settingTab === settingMap.setting && settingItem.id === 'setting-common'
  const syncActive =
    showSetting && settingTab === settingMap.setting && settingItem.id === 'setting-sync'
  const themeActive = showSetting && settingTab === settingMap.terminalThemes
  const bookmarksActive = showSetting && settingTab === settingMap.bookmarks
  const widgetsActive = showSetting && settingTab === settingMap.widgets
  const sideProps = openedSideBar
    ? {
        className: 'sidebar-list',
        style: {
          width: `${leftSidebarWidth}px`,
        },
      }
    : {
        className: 'sidebar-list',
      }
  const sidebarProps = {
    className: `sidebar type-${openedSideBar}`,
    style: {
      width: sidebarWidth,
      height,
    },
  }
  const transferProps = {
    fileTransfers,
    transferTab,
    transferHistory,
  }
  return (
    <div {...sidebarProps}>
      <div className="sidebar-bar btns">
        <div className="control-icon-wrap">
          <MenuBtn store={store} config={store.config} />
        </div>
        <SideIcon title={e('newBookmark')} onClick={onNewSsh}>
          <PlusCircleOutlined className="font22 iblock control-icon" />
        </SideIcon>
        <Popover content={<QuickConnect inputOnly />} trigger="click" placement="right">
          <div className="control-icon-wrap" title={e('quickConnect')}>
            <ThunderboltOutlined className="font20 iblock control-icon" />
            <div className="control-icon-label">{e('quickConnect')}</div>
          </div>
        </Popover>
        <SideIcon title={e(settingMap.bookmarks)} active={bookmarksActive} onClick={handleClickBookmark}>
          <BookOutlined className="font20 iblock control-icon" />
        </SideIcon>
        <TransferList {...transferProps} />
        <SideIcon title="VPS看板" active={vpsDashboardOpen} onClick={() => setVpsDashboardOpen(true)}>
          <DashboardOutlined className="font18 iblock pointer control-icon" />
        </SideIcon>
        <SideIcon title={e(settingMap.terminalThemes)} active={themeActive} onClick={openTerminalThemes}>
          <PictureOutlined className="font20 iblock pointer control-icon" />
        </SideIcon>
        <SideIcon title={e(settingMap.setting)} active={settingActive} onClick={openSetting}>
          <SettingOutlined className="iblock font20 control-icon" />
        </SideIcon>
        <SideIcon title={e('settingSync')} active={syncActive} onClick={openSettingSync}>
          <CloudSyncOutlined
            className="iblock font20 control-icon"
            spin={isSyncingSetting}
          />
        </SideIcon>
        <SideIcon title="小组件" active={widgetsActive} onClick={openWidgetsModal}>
          <AppstoreOutlined className="iblock font20 control-icon" />
        </SideIcon>

        <SideIcon title={e('about')} active={showInfoModal} onClick={openAbout}>
          <InfoCircleOutlined
            className="iblock font16 control-icon open-about-icon"
          />
        </SideIcon>
        {!checkingRemoteVersion && !showUpgradeModal && shouldUpgrade ? (
          <Tooltip title={`${e('upgrading')} ${upgradePercent || 0}%`} placement="right">
            <div className="control-icon-wrap" onClick={handleShowUpgrade}>
              <UpCircleOutlined className="iblock font18 control-icon upgrade-icon" />
            </div>
          </Tooltip>
        ) : null}
        <div className="control-icon-wrap" title={lightTheme ? '切换暗色主题' : '切换浅色主题'} onClick={toggleTheme}>
          <BulbOutlined
            className="font18 iblock control-icon"
            style={{ color: lightTheme ? '#faad14' : undefined }}
          />
          <div className="control-icon-label">{lightTheme ? '暗色' : '浅色'}</div>
        </div>
      </div>
      <SidePanel
        sideProps={sideProps}
        setLeftSidePanelWidth={setLeftSidePanelWidth}
        leftSidebarWidth={leftSidebarWidth}
      >
        <SideBarPanel pinned={pinned} sidebarPanelTab={sidebarPanelTab} />
      </SidePanel>
      <VpsDashboard
        store={store}
        visible={vpsDashboardOpen}
        onClose={() => setVpsDashboardOpen(false)}
      />
    </div>
  )
}
