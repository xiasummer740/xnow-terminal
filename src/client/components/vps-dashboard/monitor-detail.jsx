/**
 * 实时监控 — 详情视图
 * 单服务器完整仪表盘
 */
import { useState, useEffect } from 'react'
import { Button, Progress, Table, Card, Row, Col } from 'antd'
import { ArrowLeftOutlined, ThunderboltOutlined, ReloadOutlined } from '@ant-design/icons'
import { getServerMetrics } from '../../common/nezha-api'

function fmtUptime(seconds) {
  if (!seconds) return '--'
  const d = Math.floor(seconds / 86400)
  const h = Math.floor((seconds % 86400) / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  let result = ''
  if (d > 0) result += `${d}天`
  if (h > 0) result += `${h}时`
  result += `${m}分`
  return result
}

function fmtBytes(bytes) {
  if (!bytes) return '--'
  const b = parseInt(bytes)
  if (b >= 1e12) return (b / 1e12).toFixed(2) + ' TB'
  if (b >= 1e9) return (b / 1e9).toFixed(2) + ' GB'
  if (b >= 1e6) return (b / 1e6).toFixed(1) + ' MB'
  if (b >= 1e3) return (b / 1e3).toFixed(0) + ' KB'
  return b + ' B'
}

function GaugeCard({ label, value, percent, color }) {
  if (!color) color = percent > 80 ? '#ff4d4f' : percent > 50 ? '#faad14' : '#1890ff'
  return (
    <Card
      size="small"
      style={{ background: '#1a1a1a', border: '1px solid #333', height: '100%' }}
      styles={{ body: { padding: 16, textAlign: 'center' } }}
    >
      <div style={{ color: '#999', fontSize: 11, marginBottom: 8 }}>{label}</div>
      <div
        style={{
          color: '#e0e0e0',
          fontSize: 22,
          fontWeight: 700,
          fontFamily: "'Maple Mono', monospace",
          marginBottom: 8,
        }}
      >
        {value}
      </div>
      {percent != null && (
        <Progress
          percent={Math.min(100, Math.round(percent))}
          size="small"
          strokeColor={color}
          trailColor="#2a2a2a"
          showInfo={false}
        />
      )}
    </Card>
  )
}

function SimpleLineChart({ data, width = 500, height = 60 }) {
  if (!data || data.length < 2) {
    return (
      <div style={{ color: '#666', fontSize: 11, padding: 20, textAlign: 'center' }}>
        等待数据...
      </div>
    )
  }
  const values = data.map((d) => d.value || 0)
  const maxVal = Math.max(...values, 1)
  const padL = 4
  const padR = 4
  const padT = 4
  const padB = 4
  const chartW = width - padL - padR
  const chartH = height - padT - padB
  const n = values.length

  const linePoints = values
    .map((v, i) => {
      const x = padL + (i / (n - 1)) * chartW
      const y = padT + chartH - (v / maxVal) * chartH
      return `${x},${y}`
    })
    .join(' ')

  const fillPoints = [
    `${padL},${padT + chartH}`,
    ...values.map((v, i) => {
      const x = padL + (i / (n - 1)) * chartW
      const y = padT + chartH - (v / maxVal) * chartH
      return `${x},${y}`
    }),
    `${padL + chartW},${padT + chartH}`,
  ].join(' ')

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      style={{ display: 'block' }}
    >
      <polygon points={fillPoints} fill="rgba(24,144,255,0.08)" />
      <polyline
        points={linePoints}
        fill="none"
        stroke="#1890ff"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  )
}

export default function MonitorDetail({ server, onBack, onSshConnect }) {
  const [cpuHistory, setCpuHistory] = useState([])
  const [metricsLoading, setMetricsLoading] = useState(false)

  const loadMetrics = async () => {
    if (!server?.id) return
    setMetricsLoading(true)
    const data = await getServerMetrics(server.id, 'cpu', '1d')
    setCpuHistory(data || [])
    setMetricsLoading(false)
  }

  useEffect(() => {
    loadMetrics()
  }, [server?.id])

  if (!server) return null

  const s = server.state || {}
  const h = server.host || {}
  const cpu = typeof s.cpu === 'number' ? s.cpu : 0
  const memPct = s.mem_used && h.mem_total ? (s.mem_used / h.mem_total) * 100 : 0
  const diskPct = s.disk_used && h.disk_total ? (s.disk_used / h.disk_total) * 100 : 0

  const processColumns = [
    { title: '属性', dataIndex: 'label', width: 80 },
    { title: '值', dataIndex: 'value' },
  ]
  const infoData = [
    {
      key: 'platform',
      label: '系统',
      value: `${h.platform || ''} ${h.platform_version || ''}`.trim() || '--',
    },
    { key: 'arch', label: '架构', value: h.arch || '--' },
    { key: 'cpu', label: 'CPU', value: Array.isArray(h.cpu) ? h.cpu[0] || '--' : '--' },
    { key: 'mem', label: '内存总量', value: fmtBytes(h.mem_total) },
    { key: 'disk', label: '磁盘总量', value: fmtBytes(h.disk_total) },
    { key: 'uptime', label: '运行时间', value: fmtUptime(s.uptime) },
    {
      key: 'load',
      label: '负载',
      value: `${s.load1 != null ? s.load1.toFixed(2) : '--'} / ${s.load5 != null ? s.load5.toFixed(2) : '--'} / ${s.load15 != null ? s.load15.toFixed(2) : '--'}`,
    },
    {
      key: 'tcp',
      label: 'TCP 连接',
      value: s.tcp_conn_count != null ? String(s.tcp_conn_count) : '--',
    },
    {
      key: 'process',
      label: '进程数',
      value: s.process_count != null ? String(s.process_count) : '--',
    },
  ]

  return (
    <div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Button icon={<ArrowLeftOutlined />} onClick={onBack} type="text" style={{ color: '#ccc' }}>
          返回列表
        </Button>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button
            icon={<ReloadOutlined />}
            onClick={loadMetrics}
            loading={metricsLoading}
            style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
          >
            刷新
          </Button>
          <Button
            icon={<ThunderboltOutlined />}
            onClick={() => onSshConnect?.(server)}
            style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
          >
            SSH 连接
          </Button>
        </div>
      </div>

      <h3 style={{ color: '#e0e0e0', marginBottom: 4 }}>{server.name || '未命名服务器'}</h3>
      <div style={{ color: '#666', fontSize: 12, marginBottom: 20 }}>
        {server.ipv4 || server.host || '--'} &nbsp;|&nbsp;
        <span style={{ color: server.online ? '#52c41a' : '#ff4d4f' }}>
          {server.online ? '在线' : '离线'}
        </span>
      </div>

      {/* 仪表盘 */}
      <Row gutter={[12, 12]} style={{ marginBottom: 20 }}>
        <Col span={6}>
          <GaugeCard label="CPU" value={`${cpu.toFixed(1)}%`} percent={cpu} />
        </Col>
        <Col span={6}>
          <GaugeCard label="内存" value={`${memPct.toFixed(0)}%`} percent={memPct} />
        </Col>
        <Col span={6}>
          <GaugeCard label="磁盘" value={`${diskPct.toFixed(0)}%`} percent={diskPct} />
        </Col>
        <Col span={6}>
          <GaugeCard label="运行时间" value={fmtUptime(s.uptime)} percent={null} />
        </Col>
      </Row>

      {/* CPU 历史 */}
      <Card
        size="small"
        style={{ background: '#1a1a1a', border: '1px solid #333', marginBottom: 20 }}
        styles={{ body: { padding: 16 } }}
        title={<span style={{ color: '#ccc', fontSize: 13 }}>CPU 历史</span>}
      >
        <SimpleLineChart data={cpuHistory} />
      </Card>

      {/* 服务器信息 */}
      <Card
        size="small"
        style={{ background: '#1a1a1a', border: '1px solid #333' }}
        styles={{ body: { padding: 0 } }}
        title={<span style={{ color: '#ccc', fontSize: 13 }}>服务器信息</span>}
      >
        <Table
          dataSource={infoData}
          columns={processColumns}
          rowKey="key"
          size="small"
          pagination={false}
          style={{ background: 'transparent' }}
          locale={{ emptyText: '暂无信息' }}
        />
      </Card>
    </div>
  )
}
