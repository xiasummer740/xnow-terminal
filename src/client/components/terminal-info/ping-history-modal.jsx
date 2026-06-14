/**
 * 网络延迟历史弹窗 — 含图表 + 丢包率 + 时间选择
 */
import { useState, useEffect, useRef } from 'react'
import { Modal, Segmented, Tag, Space, Switch, message } from 'antd'
import { getAggregatedHistory, addPing } from '../../common/ping-history'

const RANGES = [
  { label: '1小时', value: '1h' },
  { label: '6小时', value: '6h' },
  { label: '24小时', value: '24h' },
  { label: '3天', value: '3d' }
]

const W = 660
const H = 200
const PAD_L = 50
const PAD_R = 10
const PAD_T = 10
const PAD_B = 25
const CHART_W = W - PAD_L - PAD_R
const CHART_H = H - PAD_T - PAD_B

function drawChart (canvas, points) {
  if (!canvas || points.length < 2) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  canvas.width = W * dpr
  canvas.height = H * dpr
  ctx.scale(dpr, dpr)

  ctx.clearRect(0, 0, W, H)

  // 背景
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, W, H)

  const vals = points.map(p => p.v)
  const maxV = Math.max(...vals, 10)
  const minV = Math.max(0, Math.min(...vals) - 20)
  const range = Math.max(maxV - minV, 50)

  const scaleY = (v) => PAD_T + CHART_H - ((v - minV) / range) * CHART_H
  const scaleX = (i) => PAD_L + (i / (points.length - 1)) * CHART_W

  // 网格线
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 0.5
  for (let i = 0; i <= 4; i++) {
    const val = minV + range * i / 4
    const y = scaleY(val)
    ctx.beginPath(); ctx.moveTo(PAD_L, y); ctx.lineTo(PAD_L + CHART_W, y); ctx.stroke()
    ctx.fillStyle = '#555'
    ctx.font = '9px monospace'
    ctx.fillText(Math.round(val) + 'ms', 2, y - 2)
  }

  // 填充区域 + 折线
  ctx.beginPath()
  points.forEach((p, i) => {
    const x = scaleX(i)
    const y = scaleY(p.v)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.lineTo(scaleX(points.length - 1), scaleY(minV))
  ctx.lineTo(scaleX(0), scaleY(minV))
  ctx.closePath()
  ctx.fillStyle = 'rgba(24,144,255,0.08)'
  ctx.fill()

  ctx.beginPath()
  points.forEach((p, i) => {
    const x = scaleX(i)
    const y = scaleY(p.v)
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  })
  ctx.strokeStyle = '#1890ff'
  ctx.lineWidth = 1.5
  ctx.stroke()

  // 时间标签
  ctx.fillStyle = '#555'
  ctx.font = '9px monospace'
  const labelIdx = [0, Math.floor(points.length / 2), points.length - 1]
  labelIdx.forEach(i => {
    const d = new Date(points[i].t)
    const label = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    ctx.fillText(label, scaleX(i) - 15, H - 5)
  })
}

export default function PingHistoryModal ({ open, host, onClose }) {
  const [range, setRange] = useState('1h')
  const [smooth, setSmooth] = useState(true)
  const [bgOn, setBgOn] = useState(false)
  const canvasRef = useRef(null)
  const [stats, setStats] = useState({ points: [], lossRate: 0, total: 0, lost: 0 })

  // 启动/停止后台监控
  useEffect(() => {
    if (!open) return
    window.pre.runGlobalAsync('getBgPingData', host).then(d => {
      if (d?.length > 0) setBgOn(true)
    })
  }, [open, host])

  // 从全局配置读取平滑设置
  const config = window.store?.config || {}
  useEffect(() => { setSmooth(config.historySmooth !== false) }, [config.historySmooth])

  // 从全局配置读取后台监控状态
  useEffect(() => {
    if (!open) return
    const enabled = config.bgMonitor
    setBgOn(!!enabled)
    if (enabled) {
      const hosts = (window.store.bookmarks || []).filter(b => b.host).map(b => b.host)
      if (hosts.length) window.pre.runGlobalAsync('startBgPing', hosts)
    } else {
      window.pre.runGlobalAsync('stopBgPing')
    }
  }, [open, config.bgMonitor])

  useEffect(() => {
    if (!open || !host) return
    let active = true
    ;(async () => {
      const result = await getAggregatedHistory(host, range, smooth)
      if (!active) return
      setStats(result)
      setTimeout(() => drawChart(canvasRef.current, result.points), 50)
    })()
    return () => { active = false }
  }, [open, host, range, smooth])

  return (
    <Modal
      title={<span style={{ fontSize: 14, fontWeight: 600 }}>📊 历史延迟 — {host}</span>}
      open={open} onCancel={onClose} footer={null}
      width={720}
      destroyOnClose
      styles={{ content: { background: '#141414' }, header: { background: '#141414', borderBottom: '1px solid #222' } }}
    >
      {/* 工具条 */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <Segmented value={range} onChange={v => setRange(v)} options={RANGES}
          style={{ background: '#1a1a1a' }} />
        <Space size={16}>
          <span style={{ fontSize: 12, color: '#888' }}>
            {bgOn ? '🟢 后台监控中' : '⚪ 后台监控未开启'}
          </span>
        </Space>
      </div>

      {/* 统计信息 */}
      <div style={{ marginBottom: 10, display: 'flex', gap: 16 }}>
        <span style={{ fontSize: 12, color: '#888' }}>采样: <span style={{ color: '#ccc' }}>{stats.total} 次</span></span>
        <span style={{ fontSize: 12, color: '#888' }}>丢包: <Tag color={stats.lossRate > 5 ? 'red' : 'green'} style={{ fontSize: 11 }}>{stats.lossRate}%</Tag></span>
        {stats.points.length > 0 && (
          <>
            <span style={{ fontSize: 12, color: '#888' }}>最低: <span style={{ color: '#52c41a' }}>{Math.min(...stats.points.map(p => p.v))}ms</span></span>
            <span style={{ fontSize: 12, color: '#888' }}>最高: <span style={{ color: '#ff4d4f' }}>{Math.max(...stats.points.map(p => p.v))}ms</span></span>
          </>
        )}
      </div>

      {/* 图表 */}
      <canvas ref={canvasRef} style={{ width: W, height: H, borderRadius: 4, display: 'block', background: '#0d0d0d' }} />
    </Modal>
  )
}
