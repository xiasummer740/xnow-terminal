/**
 * 实时监控页签 — 三种视图切换 + 批量部署 Agent
 */
import { useState, useCallback } from 'react'
import { Segmented, Empty, Button, Modal, Checkbox, message, Space } from 'antd'
import { TableOutlined, AppstoreOutlined, SettingOutlined, CloudUploadOutlined } from '@ant-design/icons'
import MonitorTable from './monitor-table'
import MonitorCards from './monitor-cards'
import MonitorDetail from './monitor-detail'
import DeployModal from '../deploy/deploy-modal'
import { deployAgent, deployAgentsBatch, getAgentSteps } from '../deploy/deploy-agent'
import copy from 'json-deep-copy'

const viewOptions = [
  { label: <><TableOutlined /> 表格</>, value: 'table' },
  { label: <><AppstoreOutlined /> 卡片</>, value: 'card' }
]

export default function TabMonitor({ onClose }) {
  const [view, setView] = useState('table')
  const [selectedServer, setSelectedServer] = useState(null)
  const { store } = window
  const nezhaCfg = store.config?.nezha || {}

  // Agent 部署相关
  const [selectOpen, setSelectOpen] = useState(false)
  const [checkedIds, setCheckedIds] = useState([])
  const [deployOpen, setDeployOpen] = useState(false)
  const [deploySteps, setDeploySteps] = useState([])
  const [deployTitle, setDeployTitle] = useState('')

  const handleSshConnect = useCallback(
    (server) => {
      if (!server) return
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

  // 可选的书签（有 SSH 信息且未关联哪吒的）
  const deployableBookmarks = (store.bookmarks || []).filter(b => b.host && b.username)

  const handleOpenSelect = () => {
    setCheckedIds([])
    setSelectOpen(true)
  }

  const handleStartDeploy = async () => {
    const selected = deployableBookmarks.filter(b => checkedIds.includes(b.id))
    if (!selected.length) { message.warning('请至少选择一台服务器'); return }
    setSelectOpen(false)

    // 逐台部署
    let successCount = 0
    let failCount = 0
    for (let i = 0; i < selected.length; i++) {
      const bm = selected[i]
      const name = bm.title || bm.host
      setDeployTitle(`部署 Agent (${i + 1}/${selected.length}) — ${name}`)
      setDeploySteps(getAgentSteps(name))
      setDeployOpen(true)

      const result = await deployAgent(copy(bm), nezhaCfg.dashboardUrl, setDeploySteps)
      if (result.success) {
        successCount++
      } else {
        failCount++
      }
    }

    setDeployOpen(false)
    message.success(`部署完成：${successCount} 台成功${failCount ? `，${failCount} 台失败` : ''}`)
  }

  // 未配置
  if (!nezhaCfg.dashboardUrl || !nezhaCfg.apiToken) {
    return (
      <Empty style={{ padding: 60 }} description="尚未配置 XNOW 监控">
        <Button type="primary" icon={<SettingOutlined />} onClick={() => { onClose?.(); store.openNezhaSetting() }}>
          去配置
        </Button>
      </Empty>
    )
  }

  // 详情视图
  if (selectedServer) {
    return (
      <MonitorDetail
        server={selectedServer}
        onBack={() => setSelectedServer(null)}
        onSshConnect={handleSshConnect}
      />
    )
  }

  // 列表视图
  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Button icon={<CloudUploadOutlined />} onClick={handleOpenSelect}>
          部署 Agent
        </Button>
        <Segmented value={view} onChange={(v) => setView(v)} options={viewOptions} style={{ background: '#1a1a1a' }} />
      </div>

      {view === 'table' ? (
        <MonitorTable onSshConnect={handleSshConnect} />
      ) : (
        <MonitorCards onSshConnect={handleSshConnect} onSelectDetail={handleSelectDetail} />
      )}

      {/* 选择服务器弹窗 */}
      <Modal
        title="选择要部署 Agent 的服务器"
        open={selectOpen}
        onOk={handleStartDeploy}
        onCancel={() => setSelectOpen(false)}
        okText="开始部署"
        width={500}
        styles={{ content: { background: '#1a1a1a' }, header: { background: '#1a1a1a' } }}
      >
        {deployableBookmarks.length === 0 ? (
          <div style={{ color: '#666', padding: 20, textAlign: 'center' }}>没有可用的服务器书签，请先在书签中添加 SSH 信息</div>
        ) : (
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            <Checkbox.Group value={checkedIds} onChange={setCheckedIds} style={{ width: '100%' }}>
              {deployableBookmarks.map(b => (
                <div key={b.id} style={{ padding: '8px 4px', borderBottom: '1px solid #222' }}>
                  <Checkbox value={b.id} style={{ color: '#ccc', width: '100%' }}>
                    <span style={{ color: '#e0e0e0' }}>{b.title || b.host}</span>
                    <span style={{ color: '#666', marginLeft: 8, fontSize: 12 }}>{b.host}</span>
                  </Checkbox>
                </div>
              ))}
            </Checkbox.Group>
          </div>
        )}
      </Modal>

      {/* 部署进度弹窗 */}
      <DeployModal
        open={deployOpen}
        title={deployTitle || '🚀 部署 Agent'}
        onClose={() => setDeployOpen(false)}
        onCancel={() => setDeployOpen(false)}
        steps={deploySteps}
      />
    </div>
  )
}
