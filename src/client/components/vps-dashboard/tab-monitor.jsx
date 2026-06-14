/**
 * 实时监控页签 — 三种视图切换 + 批量部署 Agent
 */
import { useState, useCallback } from 'react'
import { Segmented, Empty, Button, Modal, Checkbox, message, Space, Tag } from 'antd'
import { TableOutlined, AppstoreOutlined, SettingOutlined, CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons'
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
  const [refreshKey, setRefreshKey] = useState(0)
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

    // 先读 Dashboard 的 agent_secret_key（通过主控机 SSH）
    const masterBm = (store.bookmarks || []).find(b => b.id === nezhaCfg.masterBookmarkId)
    let agentSecretKey = ''
    if (masterBm) {
      const keyResp = await window.pre.runGlobalAsync('execSshCommand', {
        host: masterBm.host, port: masterBm.port || 22,
        username: masterBm.username || 'root',
        password: masterBm.password, privateKey: masterBm.privateKey,
        command: `grep 'agent_secret_key:' /opt/nezha/dashboard/data/config.yaml | cut -d' ' -f2`,
        timeout: 10000
      })
      if (keyResp && keyResp.length > 10) agentSecretKey = keyResp.trim()
    }

    // 逐台部署
    let successCount = 0
    let failCount = 0
    const errors = []
    for (let i = 0; i < selected.length; i++) {
      const bm = selected[i]
      const name = bm.title || bm.host
      setDeployTitle(`部署 Agent (${i + 1}/${selected.length}) — ${name}`)
      setDeploySteps(getAgentSteps(name))
      setDeployOpen(true)

      const result = await deployAgent(copy(bm), nezhaCfg.dashboardUrl, setDeploySteps, agentSecretKey)
      if (result.success) {
        successCount++
      } else {
        failCount++
        errors.push(`${name}: ${result.error || '未知错误'}`)
      }
    }

    setDeployOpen(false)
    const msg = `部署完成：${successCount} 台成功${failCount ? `，${failCount} 台失败` : ''}`
    message.success(msg, 5)
    if (errors.length) {
      console.error('[deploy-agent] 失败详情:', errors.join('\n'))
      message.error(`失败详情:\n${errors.join('\n')}`, 8)
    }
    setRefreshKey(k => k + 1)
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
        <Space>
          <Button icon={<CloudUploadOutlined />} onClick={handleOpenSelect}>
            部署 Agent
          </Button>
          <Button icon={<ReloadOutlined />} onClick={() => { setRefreshKey(k => k + 1); message.info('已刷新') }} size="small">
            刷新
          </Button>
        </Space>
        <Segmented value={view} onChange={(v) => setView(v)} options={viewOptions} style={{ background: '#1a1a1a' }} />
      </div>

      {view === 'table' ? (
        <MonitorTable key={`t-${refreshKey}`} onSshConnect={handleSshConnect} />
      ) : (
        <MonitorCards key={`c-${refreshKey}`} onSshConnect={handleSshConnect} onSelectDetail={handleSelectDetail} />
      )}

      {/* 选择服务器弹窗 */}
      <Modal
        title="选择要部署 Agent 的服务器"
        open={selectOpen}
        onOk={handleStartDeploy}
        onCancel={() => setSelectOpen(false)}
        okText="开始部署"
        width={520}
        styles={{ content: { background: '#1a1a1a', borderRadius: 8 }, header: { background: 'transparent', borderBottom: '1px solid #222' } }}
      >
        {deployableBookmarks.length === 0 ? (
          <div style={{ color: '#666', padding: 40, textAlign: 'center' }}>没有可用的服务器书签，请先在书签中添加 SSH 信息</div>
        ) : (
          <Checkbox.Group value={checkedIds} onChange={setCheckedIds} style={{ width: '100%' }}>
            <div style={{ display: 'grid', gap: 6 }}>
              {deployableBookmarks.map(b => (
                <div
                  key={b.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    padding: '10px 12px',
                    background: '#1f1f1f',
                    border: '1px solid #333',
                    borderRadius: 6,
                    cursor: 'pointer',
                    transition: 'border-color 0.2s'
                  }}
                  onClick={() => {
                    setCheckedIds(prev =>
                      prev.includes(b.id) ? prev.filter(id => id !== b.id) : [...prev, b.id]
                    )
                  }}
                >
                  <Checkbox value={b.id} checked={checkedIds.includes(b.id)} style={{ marginRight: 12 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ color: '#e0e0e0', fontWeight: 500, fontSize: 14 }}>{b.title || '未命名'}</div>
                    <div style={{ color: '#888', fontSize: 12, fontFamily: 'monospace' }}>{b.host}</div>
                  </div>
                  <Tag color={b.host?.includes(':') ? 'purple' : 'blue'} style={{ marginRight: 0, fontSize: 11 }}>
                    {b.host?.includes(':') ? 'IPv6' : b.host?.split('.').length === 4 ? 'IPv4' : '域名'}
                  </Tag>
                </div>
              ))}
            </div>
          </Checkbox.Group>
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
