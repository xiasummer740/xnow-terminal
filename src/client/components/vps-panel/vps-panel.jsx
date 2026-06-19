/**
 * VPS Info Panel - 右侧停靠面板，显示当前连接的服务器信息
 * （延迟、ping、CPU、内存、磁盘、路由检测等）
 */
import { useCallback, Suspense, lazy } from 'react'
import { auto } from 'manate/react'
import { CloseOutlined } from '@ant-design/icons'
import message from '../common/message'
import './vps-panel.styl'

const TerminalInfo = lazy(() => import('../terminal-info/terminal-info'))

export default auto(function VpsPanel (props) {
  const { store } = props

  const handleClose = useCallback(() => {
    store._vpsForceClosed = true
    store.innerWidth = window.innerWidth - store.rightPanelVPSWidth
    window.pre.runGlobalAsync('resizeWindow', {
      width: window.outerWidth - store.rightPanelVPSWidth,
      height: window.outerHeight
    })
  }, [store])

  const tab = store.currentTab
  const host = tab?.host || store.config.host

  const handleCopyIp = useCallback(() => {
    if (!host) return
    navigator.clipboard.writeText(host).then(() => {
      message.success(`已复制 IP：${host}`)
    }).catch(() => {
      message.error('复制失败')
    })
  }, [host])

  const terminalInfoProps = {
    rightPanelTab: 'info', // 让 TerminalInfo 正常渲染（不走 'ai' 分支）
    ...store.terminalInfoProps, // pid, isRemote, id, logName 来自 terminal handleShowInfo
    host,
    port: tab?.port || store.config.port,
    saveTerminalLogToFile: store.config.saveTerminalLogToFile,
    terminalInfos: store.config.terminalInfos,
    sessionLogPath: store.config.sessionLogPath
  }

  return (
    <div className='right-panel right-panel-vps'>
      <div className='right-panel-titlebar app-drag' style={{ WebkitAppRegion: 'drag' }}>
        <span className='right-panel-title'>VPS 信息{host ? <span className='vps-host-badge no-drag' onClick={handleCopyIp} title='点击复制 IP'>{host}</span> : null}</span>
        <div className='right-panel-controls'>
          <CloseOutlined className='right-panel-close-btn' onClick={handleClose} title='关闭' />
        </div>
      </div>
      <div className='right-panel-content'>
        <Suspense fallback={null}>
          <TerminalInfo {...terminalInfoProps} />
        </Suspense>
      </div>
    </div>
  )
})
