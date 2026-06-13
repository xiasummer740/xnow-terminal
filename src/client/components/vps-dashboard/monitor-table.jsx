/**
 * 实时监控 — 表格视图
 * 显示所有服务器的状态列表
 */
import { useState, useEffect, useRef } from 'react'
import { Table, Tag, Tooltip, Input } from 'antd'
import { SearchOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { getServerList, connectServerWs } from '../../common/nezha-api'

function fmtSpeed(bytesPerSec) {
  if (!bytesPerSec && bytesPerSec !== 0) return '--'
  const bps = parseInt(bytesPerSec)
  if (bps >= 1e9) return (bps / 1e9).toFixed(2) + ' GB/s'
  if (bps >= 1e6) return (bps / 1e6).toFixed(1) + ' MB/s'
  if (bps >= 1e3) return (bps / 1e3).toFixed(0) + ' KB/s'
  return bps + ' B/s'
}

export default function MonitorTable({ onSshConnect }) {
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
          const payload = JSON.parse(e.data)
          if (Array.isArray(payload?.servers)) {
            setServers(payload.servers)
          }
        } catch {
          /* ignore malformed messages */
        }
      }
      ws.onerror = () => {}
      wsRef.current = ws
    }
    return () => {
      if (wsRef.current) wsRef.current.close()
    }
  }, [])

  const loadServers = async () => {
    setLoading(true)
    const list = await getServerList()
    setServers(list || [])
    setLoading(false)
  }

  const filtered = servers.filter((s) => {
    if (!keyword) return true
    const k = keyword.toLowerCase()
    return (
      (s.name || '').toLowerCase().includes(k) ||
      (s.host || '').toLowerCase().includes(k) ||
      (s.ipv4 || '').toLowerCase().includes(k)
    )
  })

  const columns = [
    {
      title: '',
      dataIndex: 'online',
      width: 50,
      render: (online) => (
        <span
          style={{
            display: 'inline-block',
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: online ? '#52c41a' : '#ff4d4f',
            boxShadow: online ? '0 0 6px #52c41a' : '0 0 6px #ff4d4f',
          }}
        />
      ),
    },
    {
      title: '服务器',
      dataIndex: 'name',
      width: 140,
      render: (name) => <span style={{ color: '#e0e0e0', fontWeight: 500 }}>{name || '--'}</span>,
    },
    {
      title: 'IP',
      key: 'ip',
      width: 130,
      render: (_, r) => (
        <code style={{ color: '#999', fontSize: 11 }}>{r.ipv4 || r.host || '--'}</code>
      ),
    },
    {
      title: 'CPU',
      width: 80,
      render: (_, r) => {
        const v = r.state?.cpu
        if (v == null) return '--'
        const pct = typeof v === 'number' ? v : parseFloat(v)
        return <Tag color={pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'}>{pct.toFixed(1)}%</Tag>
      },
    },
    {
      title: '内存',
      width: 100,
      render: (_, r) => {
        const used = r.state?.mem_used
        const total = r.host?.mem_total
        if (used == null || !total) return '--'
        const pct = (used / total) * 100
        return <Tag color={pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'}>{pct.toFixed(0)}%</Tag>
      },
    },
    {
      title: '磁盘',
      width: 100,
      render: (_, r) => {
        const used = r.state?.disk_used
        const total = r.host?.disk_total
        if (used == null || !total) return '--'
        const pct = (used / total) * 100
        return <Tag color={pct > 80 ? 'red' : pct > 50 ? 'orange' : 'green'}>{pct.toFixed(0)}%</Tag>
      },
    },
    {
      title: '上行',
      width: 90,
      render: (_, r) => fmtSpeed(r.state?.net_out_speed),
    },
    {
      title: '下行',
      width: 90,
      render: (_, r) => fmtSpeed(r.state?.net_in_speed),
    },
    {
      title: '运行时间',
      width: 90,
      render: (_, r) => {
        const up = r.state?.uptime
        if (!up) return '--'
        const d = Math.floor(up / 86400)
        const h = Math.floor((up % 86400) / 3600)
        return d > 0 ? `${d}d${h}h` : `${h}h`
      },
    },
    {
      title: '操作',
      width: 60,
      render: (_, r) => (
        <Tooltip title="SSH 连接">
          <ThunderboltOutlined
            style={{ color: '#888', cursor: 'pointer', fontSize: 14 }}
            onClick={(e) => {
              e.stopPropagation()
              onSshConnect?.(r)
            }}
          />
        </Tooltip>
      ),
    },
  ]

  return (
    <div>
      <div style={{ marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#888' }} />}
          placeholder="搜索服务器名称或 IP..."
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          allowClear
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>
      <Table
        dataSource={filtered}
        columns={columns}
        rowKey="id"
        loading={loading}
        size="small"
        pagination={{ pageSize: 20, size: 'small' }}
        style={{ background: 'transparent' }}
        locale={{ emptyText: '暂无监控数据\n请确保已部署 Agent 且配置正确' }}
      />
    </div>
  )
}
