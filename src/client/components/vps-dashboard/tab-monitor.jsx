/**
 * 实时监控页签 — 三种视图切换
 */
import { useState, useCallback } from 'react'
import { Segmented, Empty, Button } from 'antd'
import { TableOutlined, AppstoreOutlined, SettingOutlined } from '@ant-design/icons'
import MonitorTable from './monitor-table'
import MonitorCards from './monitor-cards'
import MonitorDetail from './monitor-detail'

const viewOptions = [
  {
    label: (
      <>
        <TableOutlined /> 表格
      </>
    ),
    value: 'table',
  },
  {
    label: (
      <>
        <AppstoreOutlined /> 卡片
      </>
    ),
    value: 'card',
  },
]

export default function TabMonitor({ onClose }) {
  const [view, setView] = useState('table')
  const [selectedServer, setSelectedServer] = useState(null)
  const { store } = window
  const nezhaCfg = store.config?.nezha || {}

  const handleSshConnect = useCallback(
    (server) => {
      if (!server) return
      // 尝试用 IP 匹配书签
      const bm = (store.bookmarks || []).find(
        (b) => b.host === (server.ipv4 || server.host) || b.nezhaServerId === server.id,
      )
      if (bm) {
        store.onSelectBookmark(bm.id)
      } else {
        store.addTab({
          host: server.ipv4 || server.host || '',
          title: server.name || server.host || '快速连接',
          type: 'ssh',
        })
      }
      onClose?.()
    },
    [store, onClose],
  )

  const handleSelectDetail = useCallback((server) => {
    setSelectedServer(server)
  }, [])

  // 未配置
  if (!nezhaCfg.dashboardUrl || !nezhaCfg.apiToken) {
    return (
      <Empty style={{ padding: 60 }} description="尚未配置 XNOW 监控">
        <Button type="primary" icon={<SettingOutlined />} onClick={() => store.openSetting()}>
          去配置
        </Button>
      </Empty>
    )
  }

  // 详情视图（选中单台服务器时）
  if (selectedServer) {
    return (
      <MonitorDetail
        server={selectedServer}
        onBack={() => setSelectedServer(null)}
        onSshConnect={handleSshConnect}
      />
    )
  }

  // 列表视图（表格/卡片）
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Segmented
          value={view}
          onChange={(v) => setView(v)}
          options={viewOptions}
          style={{ background: '#1a1a1a' }}
        />
      </div>
      {view === 'table' ? (
        <MonitorTable onSshConnect={handleSshConnect} />
      ) : (
        <MonitorCards onSshConnect={handleSshConnect} onSelectDetail={handleSelectDetail} />
      )}
    </div>
  )
}
