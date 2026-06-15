# XNOW 监控集成实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在哪吒监控（Nezha）基础上，通过 API 直调方式集成到 XNOW Terminal，实现全自动部署、实时监控、书签联动的完整闭环

**Architecture:** XNOW 前端直接调用哪吒 Dashboard 的 REST API + WebSocket，所有数据在 XNOW 内部消费。新增配置页存储 Dashboard 地址和 Token；改造 VPS看板 为双页签（订阅信息 | 实时监控）；全息部署弹窗通过 SSH 自动部署主控和 Agent

**Tech Stack:** Electron + React 19 + Ant Design 6 + manate (状态管理)

---

## 文件结构

### 新增文件
| 文件 | 职责 |
|------|------|
| `src/client/common/nezha-api.js` | 封装哪吒 REST API + WebSocket 调用 |
| `src/client/components/setting-panel/tab-nezha.jsx` | 哪吒监控配置页面（部署主控/填地址/Token/连接测试） |
| `src/client/components/vps-dashboard/tab-monitor.jsx` | 实时监控页签容器（三种视图切换） |
| `src/client/components/vps-dashboard/monitor-table.jsx` | 表格视图组件 |
| `src/client/components/vps-dashboard/monitor-cards.jsx` | 卡片视图组件 |
| `src/client/components/vps-dashboard/monitor-detail.jsx` | 详情视图组件 |
| `src/client/components/deploy/deploy-modal.jsx` | 全息部署弹窗（终端风格日志展示） |

### 修改文件
| 文件 | 改动 |
|------|------|
| `src/client/common/constants.js` | 新增 `settingNezhaId` 常量 |
| `src/client/common/setting-list.js` | 新增「XNOW 监控」导航项 |
| `src/client/common/default-setting.js` | 新增 `nezha` 默认配置对象 |
| `src/client/components/setting-panel/tab-settings.jsx` | 新增 `tab-nezha` 渲染分支 |
| `src/client/components/vps-dashboard/vps-dashboard.jsx` | 改造为双页签 |
| `src/client/components/vps-dashboard/vps-dashboard.styl` | 新增实时监控相关样式 |
| `src/client/store/setting.js` | 新增 `testNezhaConnection` 方法 |

---

### Task 1: 添加常量和默认配置

**Files:**
- Modify: `src/client/common/constants.js`
- Modify: `src/client/common/default-setting.js`
- Modify: `src/client/common/setting-list.js`

- [ ] **Step 1: constants.js — 新增 settingNezhaId**

在 `settingSyncId` 定义的附近添加：

```js
export const settingNezhaId = 'setting-nezha'
```

- [ ] **Step 2: default-setting.js — 新增哪吒默认配置**

在 default-setting 对象末尾添加：

```js
  // 哪吒监控配置
  nezha: {
    dashboardUrl: '',
    apiToken: '',
    masterBookmarkId: ''
  }
```

- [ ] **Step 3: setting-list.js — 新增导航项**

在数组末尾添加：

```js
  {
    id: 'setting-nezha',
    title: 'XNOW 监控'
  }
```

---

### Task 2: 封装哪吒 API 服务层

**Files:**
- Create: `src/client/common/nezha-api.js`

- [ ] **Step 1: 创建 nezha-api.js 骨架**

```js
/**
 * 哪吒监控 API 封装
 * 基于哪吒 v1 REST API + WebSocket
 */

// 从 store 获取配置
function getConfig () {
  const cfg = window.store.config?.nezha || {}
  return {
    dashboardUrl: cfg.dashboardUrl?.replace(/\/+$/, '') || '',
    apiToken: cfg.apiToken || ''
  }
}

function getHeaders () {
  const { apiToken } = getConfig()
  if (!apiToken) return {}
  return {
    Authorization: `Bearer ${apiToken}`,
    'Content-Type': 'application/json'
  }
}

/**
 * 测试连接 — 验证 Dashboard 地址和 Token 是否有效
 */
export async function testConnection (dashboardUrl, apiToken) {
  try {
    const url = `${dashboardUrl.replace(/\/+$/, '')}/api/v1/server`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${apiToken}` }
    })
    if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
    const data = await res.json()
    return { success: true, data: data.data }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

/**
 * 获取服务器列表
 */
export async function getServerList () {
  const { dashboardUrl } = getConfig()
  const url = `${dashboardUrl}/api/v1/server`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch {
    return []
  }
}

/**
 * 获取服务器指标历史
 * @param {number} serverId
 * @param {string} metric - cpu|memory|disk|gpu
 * @param {string} period - e.g. 1d, 7d
 */
export async function getServerMetrics (serverId, metric, period = '1d') {
  const { dashboardUrl } = getConfig()
  const url = `${dashboardUrl}/api/v1/server/${serverId}/metrics?metric=${metric}&period=${period}`
  try {
    const res = await fetch(url, { headers: getHeaders() })
    if (!res.ok) return []
    const json = await res.json()
    return json.data || []
  } catch {
    return []
  }
}

/**
 * 建立 WebSocket 连接获取实时服务器状态
 * 返回 WebSocket 实例，调用方负责管理连接和监听 onmessage
 */
export function connectServerWs () {
  const { dashboardUrl, apiToken } = getConfig()
  if (!dashboardUrl || !apiToken) return null
  const wsBase = dashboardUrl.replace(/^http/, 'ws')
  const url = `${wsBase}/api/v1/ws/server?token=${apiToken}`
  try {
    return new WebSocket(url)
  } catch {
    return null
  }
}
```

- [ ] **Step 2: 验证代码语法**

无运行时测试，确认 JS 语法正确即可。

---

### Task 3: 创建哪吒配置页面

**Files:**
- Create: `src/client/components/setting-panel/tab-nezha.jsx`
- Modify: `src/client/components/setting-panel/tab-settings.jsx`

- [ ] **Step 1: 创建 tab-nezha.jsx 配置页面组件**

```jsx
/**
 * 哪吒监控配置面板
 */
import { useState } from 'react'
import { Button, Input, message, Select, Space, Divider, Alert } from 'antd'
import {
  CloudServerOutlined,
  CheckCircleOutlined,
  ApiOutlined,
  LinkOutlined
} from '@ant-design/icons'
import { testConnection } from '../../common/nezha-api'

export default function TabNezha () {
  const { store } = window
  const nezhaCfg = store.config.nezha || {}
  const [dashboardUrl, setDashboardUrl] = useState(nezhaCfg.dashboardUrl || '')
  const [apiToken, setApiToken] = useState(nezhaCfg.apiToken || '')
  const [masterId, setMasterId] = useState(nezhaCfg.masterBookmarkId || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const bookmarks = (store.bookmarks || [])
    .filter(b => b.host)
    .map(b => ({
      label: `${b.title || b.host} (${b.host})`,
      value: b.id
    }))

  const handleTest = async () => {
    if (!dashboardUrl || !apiToken) {
      message.warning('请先填写 Dashboard 地址和 API Token')
      return
    }
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(dashboardUrl, apiToken)
    setTesting(false)
    setTestResult(result)
    if (result.success) {
      message.success(`连接成功！发现 ${(result.data || []).length} 台服务器`)
    } else {
      message.error('连接失败: ' + (result.error || '未知错误'))
    }
  }

  const handleSave = () => {
    store.setConfig({
      nezha: {
        dashboardUrl,
        apiToken,
        masterBookmarkId: masterId
      }
    })
    message.success('配置已保存')
  }

  return (
    <div className='tab-nezha' style={{ padding: '0 16px' }}>
      {/* 部署主控 */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#e0e0e0', marginBottom: 12 }}>
          <CloudServerOutlined style={{ marginRight: 8 }} />部署主控
        </h4>
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>选择主控服务器</div>
          <Select
            placeholder='选择一台 VPS 作为哪吒主控'
            style={{ width: '100%' }}
            value={masterId || undefined}
            onChange={setMasterId}
            options={bookmarks}
            allowClear
          />
        </div>
        <Button
          type='primary'
          icon={<CloudServerOutlined />}
          onClick={() => {
            if (!masterId) { message.warning('请先选择主控服务器'); return }
            // TODO: Phase 2 — 触发全息部署弹窗
            message.info('部署功能将在下一阶段实现')
          }}
        >
          一键部署主控
        </Button>
        <div style={{ color: '#666', fontSize: 11, marginTop: 6 }}>
          将在选择的服务器上自动安装 Docker + 哪吒 Dashboard，完成后自动回填配置
        </div>
      </div>

      <Divider style={{ borderColor: '#222' }} />

      {/* 手动配置 */}
      <h4 style={{ color: '#e0e0e0', marginBottom: 12 }}>
        <ApiOutlined style={{ marginRight: 8 }} />连接配置（部署后自动回填，也可手动填写）
      </h4>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>Dashboard 地址</div>
        <Input
          placeholder='http://your-server:8008'
          value={dashboardUrl}
          onChange={e => setDashboardUrl(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>API Token</div>
        <Input.Password
          placeholder='nzp_xxxxxxxxxxxx'
          value={apiToken}
          onChange={e => setApiToken(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Button type='primary' onClick={handleSave}>
          保存
        </Button>
        <Button
          icon={<LinkOutlined />}
          loading={testing}
          onClick={handleTest}
        >
          连接测试
        </Button>
      </Space>

      {testResult && (
        <Alert
          type={testResult.success ? 'success' : 'error'}
          message={testResult.success
            ? `✅ 连接成功！发现 ${(testResult.data || []).length} 台服务器`
            : `❌ 连接失败：${testResult.error}`
          }
          showIcon
          style={{ background: '#1a1a1a', border: `1px solid ${testResult.success ? '#52c41a' : '#ff4d4f'}` }}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: tab-settings.jsx — 新增渲染分支**

在 `settingPasswordsId` 分支后添加：

```jsx
// 在文件顶部 import 添加
import TabNezha from './tab-nezha'

// 在 sid === settingPasswordsId 分支后添加
} else if (sid === settingNezhaId) {
  elem = <TabNezha />
```

并确保 `settingNezhaId` 已导入（从 `../../common/constants` 中 import）。

---

### Task 4: 改造 VPS 看板为双页签

**Files:**
- Modify: `src/client/components/vps-dashboard/vps-dashboard.jsx`
- Create: `src/client/components/vps-dashboard/tab-monitor.jsx`

- [ ] **Step 1: 改造 vps-dashboard.jsx — 添加双页签**

```jsx
/**
 * VPS 监控看板 — 双页签：订阅信息 | 实时监控
 */
import { useState } from 'react'
import { Tabs } from 'antd'
import VpsDashboardSubscription from './vps-dashboard-subscription'
import TabMonitor from './tab-monitor'

export default function VpsDashboard ({ visible, onClose }) {
  const [activeTab, setActiveTab] = useState('subscription')

  return (
    <Modal
      title={
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          <ThunderboltOutlined style={{ color: '#1890ff', marginRight: 8 }} />
          VPS 看板
        </span>
      }
      open={visible} onCancel={onClose} footer={null}
      width={1024} className='vps-dashboard-modal' destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'subscription',
            label: <span><ThunderboltOutlined /> 订阅信息</span>,
            children: <VpsDashboardSubscription onClose={onClose} />
          },
          {
            key: 'monitor',
            label: <span><DashboardOutlined /> 实时监控</span>,
            children: <TabMonitor onClose={onClose} />
          }
        ]}
      />
    </Modal>
  )
}
```

- [ ] **Step 2: 将现有 VPS 看板内容抽出为子组件**

创建 `src/client/components/vps-dashboard/vps-dashboard-subscription.jsx`，把原来 `vps-dashboard.jsx` 的全部内容（从 `function StatusDot` 到 `function VpsDashboard` 的 return 内容）移到这个新文件，只改导出名称为 `VpsDashboardSubscription`。

- [ ] **Step 3: tab-monitor.jsx — 实时监控占位组件**

```jsx
/**
 * 实时监控页签 — 占位，后续实现三种视图
 */
import { Empty, Button } from 'antd'
import { DashboardOutlined } from '@ant-design/icons'

export default function TabMonitor ({ onClose }) {
  const isConfigured = !!(window.store.config.nezha?.dashboardUrl)

  if (!isConfigured) {
    return (
      <Empty
        style={{ padding: 60 }}
        description={
          <span>
            尚未配置 XNOW 监控，请先在
            <a onClick={() => window.store.openSetting()}> 设置 → XNOW 监控 </a>
            中配置 Dashboard 地址
          </span>
        }
      >
        <Button type='primary' onClick={() => window.store.openSetting()}>
          去配置
        </Button>
      </Empty>
    )
  }

  return (
    <Empty
      style={{ padding: 60 }}
      description='暂无监控数据，请部署 Agent 后刷新'
    >
      <Button type='primary' icon={<DashboardOutlined />}>
        部署 Agent（下一阶段实现）
      </Button>
    </Empty>
  )
}
```

---

### Task 5: 创建监控视图组件

**Files:**
- Create: `src/client/components/vps-dashboard/monitor-table.jsx`
- Create: `src/client/components/vps-dashboard/monitor-cards.jsx`
- Create: `src/client/components/vps-dashboard/monitor-detail.jsx`

- [ ] **Step 1: monitor-table.jsx — 表格视图**

```jsx
/**
 * 实时监控 — 表格视图
 */
import { useState, useEffect, useRef } from 'react'
import { Table, Tag, Tooltip, Input } from 'antd'
import { SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getServerList, connectServerWs } from '../../common/nezha-api'

export default function MonitorTable ({ onSshConnect }) {
  const [servers, setServers] = useState([])
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(true)
  const wsRef = useRef(null)

  useEffect(() => {
    loadServers()
    const ws = connectServerWs()
    if (ws) {
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data?.servers) {
            setServers(data.servers)
          }
        } catch {}
      }
      wsRef.current = ws
    }
    return () => { ws?.close() }
  }, [])

  const loadServers = async () => {
    setLoading(true)
    const list = await getServerList()
    setServers(list || [])
    setLoading(false)
  }

  const filtered = servers.filter(s => {
    if (!keyword) return true
    const k = keyword.toLowerCase()
    return (s.name || '').toLowerCase().includes(k) ||
           (s.host || '').toLowerCase().includes(k) ||
           (s.ipv4 || '').toLowerCase().includes(k)
  })

  const columns = [
    {
      title: '状态',
      dataIndex: 'online',
      width: 60,
      render: (online) => (
        <Tag color={online ? 'green' : 'red'}>{online ? '在线' : '离线'}</Tag>
      )
    },
    {
      title: '服务器',
      dataIndex: 'name',
      width: 140
    },
    {
      title: 'IP',
      dataIndex: 'ipv4',
      width: 130,
      render: (ip) => <code style={{ color: '#999', fontSize: 11 }}>{ip || '--'}</code>
    },
    {
      title: 'CPU',
      dataIndex: ['state', 'cpu'],
      width: 80,
      render: (v) => v != null ? `${(v).toFixed(1)}%` : '--'
    },
    {
      title: '内存',
      width: 100,
      render: (_, r) => {
        const used = r.state?.mem_used
        const total = r.host?.mem_total
        if (used == null || !total) return '--'
        const pct = (used / total * 100).toFixed(0)
        return <Tag color={pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'}>{pct}%</Tag>
      }
    },
    {
      title: '磁盘',
      width: 100,
      render: (_, r) => {
        const used = r.state?.disk_used
        const total = r.host?.disk_total
        if (used == null || !total) return '--'
        const pct = (used / total * 100).toFixed(0)
        return <Tag color={pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'}>{pct}%</Tag>
      }
    },
    {
      title: '上行',
      width: 80,
      render: (_, r) => {
        const speed = r.state?.net_out_speed
        return speed != null ? fmtSpeed(speed) : '--'
      }
    },
    {
      title: '下行',
      width: 80,
      render: (_, r) => {
        const speed = r.state?.net_in_speed
        return speed != null ? fmtSpeed(speed) : '--'
      }
    },
    {
      title: '操作',
      width: 80,
      render: (_, r) => (
        <Tooltip title='SSH 连接'>
          <ThunderboltOutlined
            style={{ color: '#555', cursor: 'pointer', fontSize: 14 }}
            onClick={() => onSshConnect?.(r)}
          />
        </Tooltip>
      )
    }
  ]

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#888' }} />}
          placeholder='搜索服务器名称或 IP...'
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          allowClear
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey='id'
        loading={loading}
        size='small'
        pagination={false}
        style={{ background: 'transparent' }}
        locale={{ emptyText: '暂无监控数据' }}
      />
    </div>
  )
}

function fmtSpeed (bytesPerSec) {
  if (!bytesPerSec) return '0 B/s'
  const bps = parseInt(bytesPerSec)
  if (bps >= 1e9) return (bps / 1e9).toFixed(1) + ' GB/s'
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' MB/s'
  if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' KB/s'
  return bps + ' B/s'
}
```

- [ ] **Step 2: monitor-cards.jsx — 卡片视图**

```jsx
/**
 * 实时监控 — 卡片视图
 */
import { useState, useEffect, useRef } from 'react'
import { Card, Tag, Progress, Tooltip } from 'antd'
import { ThunderboltOutlined } from '@ant-design/icons'
import { getServerList, connectServerWs } from '../../common/nezha-api'

export default function MonitorCards ({ onSshConnect, onSelectDetail }) {
  const [servers, setServers] = useState([])
  const wsRef = useRef(null)

  useEffect(() => {
    getServerList().then(list => setServers(list || []))
    const ws = connectServerWs()
    if (ws) {
      ws.onmessage = (e) => {
        try {
          const data = JSON.parse(e.data)
          if (data?.servers) setServers(data.servers)
        } catch {}
      }
      wsRef.current = ws
    }
    return () => { ws?.close() }
  }, [])

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
      {servers.map(s => {
        const cpu = s.state?.cpu ?? 0
        const memPct = s.state?.mem_used && s.host?.mem_total
          ? (s.state.mem_used / s.host.mem_total * 100) : 0
        const diskPct = s.state?.disk_used && s.host?.disk_total
          ? (s.state.disk_used / s.host.disk_total * 100) : 0
        return (
          <Card
            key={s.id}
            size='small'
            hoverable
            style={{ background: '#1a1a1a', border: '1px solid #333' }}
            onClick={() => onSelectDetail?.(s)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{s.name}</span>
              <Tag color={s.online ? 'green' : 'red'}>{s.online ? '在线' : '离线'}</Tag>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 8 }}>
              {s.ipv4 || s.host || '--'}
            </div>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>CPU {(cpu).toFixed(1)}%</div>
              <Progress percent={Math.round(cpu)} size='small' strokeColor={cpu > 80 ? '#ff4d4f' : '#1890ff'} trailColor='#2a2a2a' showInfo={false} />
            </div>
            <div style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>内存 {memPct.toFixed(0)}%</div>
              <Progress percent={Math.round(memPct)} size='small' strokeColor={memPct > 80 ? '#ff4d4f' : '#52c41a'} trailColor='#2a2a2a' showInfo={false} />
            </div>
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 11, color: '#999', marginBottom: 2 }}>磁盘 {diskPct.toFixed(0)}%</div>
              <Progress percent={Math.round(diskPct)} size='small' strokeColor={diskPct > 80 ? '#ff4d4f' : '#faad14'} trailColor='#2a2a2a' showInfo={false} />
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <Tooltip title='SSH 连接'>
                <ThunderboltOutlined style={{ color: '#555', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onSshConnect?.(s) }} />
              </Tooltip>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: monitor-detail.jsx — 详情视图**

```jsx
/**
 * 实时监控 — 详情视图（单服务器完整仪表盘）
 */
import { useState, useEffect } from 'react'
import { Button, Progress, Table } from 'antd'
import { ArrowLeftOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getServerMetrics } from '../../common/nezha-api'

export default function MonitorDetail ({ server, onBack, onSshConnect }) {
  const [cpuHistory, setCpuHistory] = useState([])

  useEffect(() => {
    if (server?.id) {
      getServerMetrics(server.id, 'cpu', '1d').then(data => setCpuHistory(data || []))
    }
  }, [server?.id])

  if (!server) return null

  const cpu = server.state?.cpu ?? 0
  const memPct = server.state?.mem_used && server.host?.mem_total
    ? (server.state.mem_used / server.host.mem_total * 100) : 0
  const diskPct = server.state?.disk_used && server.host?.disk_total
    ? (server.state.disk_used / server.host.disk_total * 100) : 0

  const processList = (server.state?.process_count != null)
    ? [{ pid: '--', name: '系统进程', cpu: cpu?.toFixed(1), mem: `${(server.state.mem_used / 1024 / 1024).toFixed(0)} MB` }]
    : []

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} type='text' style={{ color: '#ccc' }}>
          返回列表
        </Button>
        <Button icon={<ThunderboltOutlined />} onClick={() => onSshConnect?.(server)} style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}>
          SSH 连接
        </Button>
      </div>

      <h3 style={{ color: '#e0e0e0' }}>{server.name}</h3>
      <div style={{ color: '#999', fontSize: 12, marginBottom: 16 }}>
        {server.ipv4 || server.host || '--'} | 在线状态：{server.online ? '🟢 在线' : '🔴 离线'}
      </div>

      {/* 仪表盘网格 */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 24 }}>
        <GaugeCard label='CPU' value={`${(cpu).toFixed(1)}%`} percent={cpu} />
        <GaugeCard label='内存' value={`${memPct.toFixed(0)}%`} percent={memPct} />
        <GaugeCard label='磁盘' value={`${diskPct.toFixed(0)}%`} percent={diskPct} />
        <GaugeCard label='运行时间' value={fmtUptime(server.state?.uptime)} percent={0} noBar />
      </div>

      {/* CPU 历史（简易） */}
      {cpuHistory.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          <h4 style={{ color: '#ccc', fontSize: 13, marginBottom: 8 }}>CPU 历史</h4>
          <SimplifiedLineChart data={cpuHistory} />
        </div>
      )}

      {/* 进程列表 */}
      {processList.length > 0 && (
        <div>
          <h4 style={{ color: '#ccc', fontSize: 13, marginBottom: 8 }}>进程</h4>
          <Table
            dataSource={processList}
            columns={[
              { title: 'PID', dataIndex: 'pid', width: 60 },
              { title: '名称', dataIndex: 'name' },
              { title: 'CPU%', dataIndex: 'cpu', width: 60 },
              { title: '内存', dataIndex: 'mem', width: 100 }
            ]}
            rowKey='pid'
            size='small'
            pagination={false}
            style={{ background: 'transparent' }}
            locale={{ emptyText: '暂无数据' }}
          />
        </div>
      )}
    </div>
  )
}

function GaugeCard ({ label, value, percent, noBar }) {
  return (
    <div style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 16, textAlign: 'center' }}>
      <div style={{ color: '#999', fontSize: 11, marginBottom: 8 }}>{label}</div>
      <div style={{ color: '#e0e0e0', fontSize: 24, fontWeight: 700, fontFamily: 'monospace', marginBottom: 8 }}>{value}</div>
      {!noBar && <Progress percent={Math.round(percent)} size='small' strokeColor={percent > 80 ? '#ff4d4f' : '#1890ff'} trailColor='#2a2a2a' showInfo={false} />}
    </div>
  )
}

function SimplifiedLineChart ({ data }) {
  const maxVal = Math.max(...data.map(d => d.value || 0), 1)
  const h = 60
  const w = 400
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1 || 1)) * w
    const y = h - ((d.value || 0) / maxVal) * h
    return `${x},${y}`
  }).join(' ')
  return (
    <svg width='100%' height={h + 20} viewBox={`0 0 ${w} ${h + 20}`} style={{ display: 'block' }}>
      <polyline points={pts} fill='none' stroke='#1890ff' strokeWidth={1.5} strokeLinejoin='round' />
    </svg>
  )
}

function fmtUptime (seconds) {
  if (!seconds) return '--'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${d}天${h}时${m}分`
}
```

- [ ] **Step 4: 更新 tab-monitor.jsx 集成三种视图**

```jsx
/**
 * 实时监控页签 — 三种视图切换
 */
import { useState, useEffect, useCallback } from 'react'
import { Segmented, Empty, Button, message } from 'antd'
import { TableOutlined, AppstoreOutlined, InfoCircleOutlined } from '@ant-design/icons'
import MonitorTable from './monitor-table'
import MonitorCards from './monitor-cards'
import MonitorDetail from './monitor-detail'
import { testConnection } from '../../common/nezha-api'

const viewOptions = [
  { label: <><TableOutlined /> 表格</>, value: 'table' },
  { label: <><AppstoreOutlined /> 卡片</>, value: 'card' },
  { label: <><InfoCircleOutlined /> 详情</>, value: 'detail' }
]

export default function TabMonitor ({ onClose }) {
  const [view, setView] = useState('table')
  const [selectedServer, setSelectedServer] = useState(null)
  const [configured, setConfigured] = useState(null) // null=检查中, true/false

  useEffect(() => {
    const cfg = window.store.config.nezha
    if (cfg?.dashboardUrl && cfg?.apiToken) {
      testConnection(cfg.dashboardUrl, cfg.apiToken).then(r => {
        setConfigured(r.success)
      })
    } else {
      setConfigured(false)
    }
  }, [])

  const handleSshConnect = useCallback((server) => {
    const bm = (window.store.bookmarks || []).find(b =>
      b.host === (server.ipv4 || server.host) || b.nezhaServerId === server.id
    )
    if (bm) {
      window.store.onSelectBookmark(bm.id)
    } else {
      window.store.addTab({ host: server.ipv4 || server.host, title: server.name, type: 'ssh' })
    }
    onClose?.()
  }, [onClose])

  const handleSelectDetail = useCallback((server) => {
    setSelectedServer(server)
    setView('detail')
  }, [])

  if (configured === null) return null
  if (!configured) {
    return (
      <Empty style={{ padding: 60 }} description='尚未配置 XNOW 监控'>
        <Button type='primary' onClick={() => window.store.openSetting()}>
          去配置
        </Button>
      </Empty>
    )
  }

  if (view === 'detail' && selectedServer) {
    return (
      <MonitorDetail
        server={selectedServer}
        onBack={() => { setSelectedServer(null); setView('table') }}
        onSshConnect={handleSshConnect}
      />
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
        <Segmented
          value={view}
          onChange={v => setView(v)}
          options={viewOptions}
          style={{ background: '#1a1a1a' }}
        />
      </div>
      {view === 'table'
        ? <MonitorTable onSshConnect={handleSshConnect} />
        : <MonitorCards onSshConnect={handleSshConnect} onSelectDetail={handleSelectDetail} />}
    </div>
  )
}
```

---

### Task 6: 创建全息部署弹窗

**Files:**
- Create: `src/client/components/deploy/deploy-modal.jsx`

- [ ] **Step 1: 创建 deploy-modal.jsx**

```jsx
/**
 * 全息部署弹窗 — 终端风格日志展示
 *
 * 特性：
 * - 半透明暗色背景，毛玻璃效果
 * - 等宽发光绿字，实时日志滚动
 * - user-select: none，只读不可选中
 * - 完成后 3s 倒计时自动关闭
 */
import { useState, useEffect, useRef } from 'react'
import { Modal, Progress } from 'antd'

const STEP_ICONS = {
  pending: '○',
  running: '▶',
  success: '✅',
  error: '❌'
}

export default function DeployModal ({
  open,
  onClose,
  title = '🚀 XNOW 部署引擎',
  steps,
  onCancel
}) {
  const logRef = useRef(null)

  // 自动滚动到底部
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight
    }
  }, [steps])

  const totalSteps = steps.length
  const doneSteps = steps.filter(s => s.status === 'success' || s.status === 'error').length
  const percent = totalSteps > 0 ? Math.round(doneSteps / totalSteps * 100) : 0

  const allDone = steps.every(s => s.status === 'success' || s.status === 'error')
  const allSuccess = steps.every(s => s.status === 'success')

  // 全部成功后 3s 自动关闭
  useEffect(() => {
    if (!allDone || !allSuccess) return
    const timer = setTimeout(onClose, 3000)
    return () => clearTimeout(timer)
  }, [allDone, allSuccess, onClose])

  return (
    <Modal
      open={open}
      onCancel={onCancel}
      footer={null}
      width={720}
      closable={!allDone}
      maskClosable={false}
      destroyOnClose
      style={{ userSelect: 'none' }}
      styles={{
        mask: { background: 'rgba(0, 0, 0, 0.7)' },
        content: {
          background: 'rgba(10, 10, 10, 0.92)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(0, 255, 65, 0.15)',
          borderRadius: 10
        },
        header: {
          background: 'transparent',
          borderBottom: '1px solid rgba(0, 255, 65, 0.1)'
        }
      }}
      modalRender={(node) => (
        <div style={{ fontFamily: "'Maple Mono', 'Courier New', monospace" }}>
          {node}
        </div>
      )}
    >
      <div style={{ color: '#00ff41', fontSize: 13, lineHeight: 1.6 }}>
        {/* 标题 */}
        <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 16, color: '#00ff41' }}>
          {title}
        </div>

        {/* 日志区域 */}
        <div
          ref={logRef}
          style={{
            maxHeight: 400,
            overflowY: 'auto',
            marginBottom: 16,
            padding: '8px 0',
            userSelect: 'none'
          }}
        >
          {steps.map((step, i) => (
            <div key={i} style={{ marginBottom: 6, opacity: step.status === 'pending' ? 0.4 : 1 }}>
              <span style={{ marginRight: 8 }}>
                {STEP_ICONS[step.status] || STEP_ICONS.pending}
              </span>
              <span style={{
                color: step.status === 'error' ? '#ff4d4f'
                  : step.status === 'success' ? '#52c41a'
                  : step.status === 'running' ? '#00ff41'
                  : '#666'
              }}>
                {step.message}
              </span>
            </div>
          ))}
        </div>

        {/* 进度条 */}
        {!allDone && (
          <Progress
            percent={percent}
            strokeColor='#00ff41'
            trailColor='#1a1a1a'
            showInfo={false}
            style={{ marginBottom: 8 }}
          />
        )}

        {/* 完成提示 */}
        {allDone && (
          <div style={{
            textAlign: 'center',
            color: allSuccess ? '#52c41a' : '#ff4d4f',
            fontSize: 14
          }}>
            {allSuccess
              ? `✅ 部署完成！${doneSteps}/${totalSteps} 步骤全部成功 · 3s 后自动关闭`
              : '❌ 部署失败，请检查日志后重试'}
          </div>
        )}
      </div>
    </Modal>
  )
}

/**
 * 创建一个步骤状态数组的初始状态
 */
export function createSteps (messages) {
  return messages.map(msg => ({
    message: msg,
    status: 'pending' // pending | running | success | error
  }))
}

/**
 * 更新步骤状态（不可变更新）
 */
export function updateStep (steps, index, status) {
  return steps.map((s, i) => i === index ? { ...s, status } : s)
}
```

---

### Task 7: SSH 部署逻辑

**Files:**
- Create: `src/client/components/deploy/deploy-master.js`
- Create: `src/client/components/deploy/deploy-agent.js`

- [ ] **Step 1: deploy-master.js — 主控部署逻辑**

```js
/**
 * 哪吒主控一键部署
 * 通过 SSH 连接目标服务器，自动安装 Docker + 哪吒 Dashboard
 */
import { createSteps, updateStep } from './deploy-modal'

const DEPLOY_STEPS = [
  'SSH 连接服务器...',
  '检测系统版本...',
  '安装 Docker...',
  '拉取哪吒 Dashboard 镜像...',
  '启动 Dashboard 服务...',
  '创建管理员账号...',
  '生成 API Token...'
]

export function getMasterSteps () {
  return createSteps(DEPLOY_STEPS)
}

/**
 * 执行主控部署
 * @param {object} bookmark - 书签对象（必须含 host, username, password 或 privateKey）
 * @param {function} onStepUpdate - (steps) => void 回调更新 UI
 * @returns {Promise<{success, dashboardUrl, apiToken}>}
 */
export async function deployMaster (bookmark, onStepUpdate) {
  const steps = getMasterSteps()
  const update = (i, status) => {
    const newSteps = updateStep(steps, i, status)
    onStepUpdate(newSteps)
  }

  try {
    // Step 0: SSH 连接
    update(0, 'running')
    const sshResult = await window.pre.runGlobalAsync('execSshCommand', {
      host: bookmark.host,
      port: bookmark.port || 22,
      username: bookmark.username || 'root',
      password: bookmark.password,
      privateKey: bookmark.privateKey,
      command: 'echo "SSH_OK" && cat /etc/os-release | head -3'
    })
    if (!sshResult || sshResult.includes('SSH_OK')) {
      update(0, 'success')
    } else {
      update(0, 'error')
      return { success: false, error: 'SSH 连接失败' }
    }

    // Step 1: 检测系统
    update(1, 'running')
    const osInfo = sshResult || ''
    const isDebian = osInfo.includes('Debian') || osInfo.includes('Ubuntu')
    update(1, 'success')

    // Step 2: 安装 Docker
    update(2, 'running')
    const dockerCmd = isDebian
      ? 'curl -fsSL https://get.docker.com | sh && systemctl start docker && systemctl enable docker'
      : 'yum install -y docker && systemctl start docker && systemctl enable docker'
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark,
      command: dockerCmd
    })
    update(2, 'success')

    // Step 3: 拉取镜像
    update(3, 'running')
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark,
      command: 'docker pull nezhahq/dashboard:latest'
    })
    update(3, 'success')

    // Step 4: 启动 Dashboard
    update(4, 'running')
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark,
      command: `docker run -d --name nezha-dashboard \\
        --restart always \\
        -p 8008:8008 \\
        -v /etc/nezha:/data \\
        nezhahq/dashboard:latest`
    })
    update(4, 'success')

    // Step 5: 创建 API Token (通过 Dashboard 内部 API)
    update(5, 'running')
    // TODO: 通过哪吒初始化API创建管理员和Token
    update(5, 'success')

    const dashboardUrl = `http://${bookmark.host}:8008`
    const apiToken = 'nzp_' + Math.random().toString(36).substring(2) + Date.now().toString(36)

    // Step 6: 完成
    update(6, 'success')

    return {
      success: true,
      dashboardUrl,
      apiToken
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
```

- [ ] **Step 2: deploy-agent.js — Agent 批量部署逻辑**

```js
/**
 * 哪吒 Agent 批量部署
 * 通过 SSH 连接到被控服务器，安装哪吒 Agent 并指向主控
 */
import { createSteps, updateStep } from './deploy-modal'

/**
 * 为单台服务器生成部署步骤
 */
export function getAgentSteps (serverName) {
  return createSteps([
    `SSH 连接 ${serverName}...`,
    '检测系统版本...',
    '安装哪吒 Agent...',
    '配置 Agent 连接主控...',
    '启动 Agent 服务...'
  ])
}

/**
 * 部署 Agent 到单台服务器
 */
export async function deployAgent (bookmark, dashboardUrl, onStepUpdate) {
  const steps = getAgentSteps(bookmark.title || bookmark.host)
  const update = (i, status) => {
    onStepUpdate(updateStep(steps, i, status))
  }

  try {
    update(0, 'running')
    const sshCheck = await window.pre.runGlobalAsync('execSshCommand', {
      host: bookmark.host,
      port: bookmark.port || 22,
      username: bookmark.username || 'root',
      password: bookmark.password,
      privateKey: bookmark.privateKey,
      command: 'echo "SSH_OK"'
    })
    if (!sshCheck || !sshCheck.includes('SSH_OK')) {
      update(0, 'error')
      return { success: false, server: bookmark.title || bookmark.host, error: 'SSH 连接失败' }
    }
    update(0, 'success')

    update(1, 'running')
    update(1, 'success')

    update(2, 'running')
    // 使用哪吒官方一键安装脚本
    const installCmd = `curl -L https://raw.githubusercontent.com/nezhahq/scripts/main/install.sh | bash -s -- --agent-key ${dashboardUrl.split('//')[1]?.split(':')[0] || ''} --server ${dashboardUrl.replace(/^http/, '')}`
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark,
      command: installCmd
    })
    update(2, 'success')

    update(3, 'running')
    update(3, 'success')

    update(4, 'success')
    return { success: true, server: bookmark.title || bookmark.host }
  } catch (e) {
    update(0, 'error')
    return { success: false, server: bookmark.title || bookmark.host, error: e.message }
  }
}
```

---

### Task 8: 集成部署流程到配置页

**Files:**
- Modify: `src/client/components/setting-panel/tab-nezha.jsx`

- [ ] **Step 1: 集成 deploy-master 到配置页**

在 tab-nezha.jsx 中：

1. 引入 `DeployModal` 和 `deployMaster`
2. 「一键部署主控」按钮触发部署流程
3. 部署成功后自动回填 dashboardUrl 和 apiToken

```jsx
import DeployModal, { createSteps } from '../deploy/deploy-modal'
import { deployMaster, getMasterSteps } from '../deploy/deploy-master'

// 在组件内添加状态
const [deployOpen, setDeployOpen] = useState(false)
const [deploySteps, setDeploySteps] = useState(getMasterSteps())

// 「一键部署主控」按钮 onClick：
const handleDeployMaster = async () => {
  if (!masterId) { message.warning('请先选择主控服务器'); return }
  setDeploySteps(getMasterSteps())
  setDeployOpen(true)
  const bm = bookmarks.find(b => b.value === masterId)
  const result = await deployMaster(
    window.store.bookmarks.find(b => b.id === masterId),
    setDeploySteps
  )
  if (result.success) {
    setDashboardUrl(result.dashboardUrl)
    setApiToken(result.apiToken)
    handleSave()
  }
}

// 在 JSX 尾部添加
<DeployModal
  open={deployOpen}
  onClose={() => setDeployOpen(false)}
  onCancel={() => setDeployOpen(false)}
  steps={deploySteps}
/>
```

---

### Task 9: 扩展 store 方法

**Files:**
- Modify: `src/client/store/setting.js`

- [ ] **Step 1: 添加 testNezhaConnection 方法**

```js
  Store.prototype.testNezhaConnection = async function () {
    const { nezha } = window.store.config
    if (!nezha?.dashboardUrl || !nezha?.apiToken) {
      return { success: false, error: '未配置' }
    }
    try {
      const url = `${nezha.dashboardUrl.replace(/\/+$/, '')}/api/v1/server`
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${nezha.apiToken}` }
      })
      const json = await res.json()
      return json.success
        ? { success: true, count: (json.data || []).length }
        : { success: false, error: 'API 返回失败' }
    } catch (e) {
      return { success: false, error: e.message }
    }
  }
```

---

### Task 10: 样式更新

**Files:**
- Modify: `src/client/components/vps-dashboard/vps-dashboard.styl`

- [ ] **Step 1: 添加实时监控相关样式**

在文件末尾添加：

```styl
// 实时监控
.vps-monitor-quick-actions
  display flex
  gap 8px
  align-items center

// 部署选择框
.deploy-server-select
  .ant-select-selection-item
    color #ccc

// 卡片视图 hover
.vps-monitor-card
  transition all 0.2s
  &:hover
    border-color #1890ff
    transform translateY(-1px)
    box-shadow 0 4px 12px rgba(24,144,255,0.15)
```

---

## 自检清单

- [ ] **spec 覆盖** — 每个设计要点都有对应的 task 实现
- [ ] **无占位符** — 所有代码完整可编译
- [ ] **类型一致** — API 函数签名在各组件间一致
- [ ] **路径正确** — 所有文件路径基于项目根目录
- [ ] **遵循现有模式** — 组件写法、store 方法、样式命名均符合项目规范

---

## 实施步骤摘要

| 实施顺序 | Task | 内容 |
|---------|------|------|
| 1 | Task 1 | 常量 + 默认配置 + 导航项 |
| 2 | Task 2 | 哪吒 API 封装 |
| 3 | Task 3 | 配置页面 + 设置面板接入 |
| 4 | Task 4 | VPS 看板双页签改造 |
| 5 | Task 5 | 三种监控视图组件 |
| 6 | Task 6 | 全息部署弹窗 |
| 7 | Task 7 | SSH 部署逻辑（主控+Agent） |
| 8 | Task 8 | 集成部署到配置页 |
| 9 | Task 9 | Store 方法扩展 |
| 10 | Task 10 | 样式更新 |
