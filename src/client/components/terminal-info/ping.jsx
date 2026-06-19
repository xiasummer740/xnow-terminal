/**
 * 右侧面板 - 网络延迟 + 精细柱状图 + 历史记录
 */
/* global cancelAnimationFrame, getComputedStyle */
import { ApiOutlined, BarChartOutlined } from '@ant-design/icons'
import { useEffect, useState, useRef } from 'react'
import { Tooltip } from 'antd'
import { tcpPing } from '../terminal/terminal-apis'
import { addPing } from '../../common/ping-history'
import PingHistoryModal from './ping-history-modal'

const MAX_POINTS = 120
const CHART_W = 300
const CHART_H = 80
const BAR_W = 3
const BAR_GAP = 1.5
const BAR_R = 1

function scheduleDraw (canvas, data, rafRef) {
  if (rafRef?.current) cancelAnimationFrame(rafRef.current)
  const id = requestAnimationFrame(() => drawChart(canvas, data))
  if (rafRef) rafRef.current = id
}

function getCssVar (name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function drawChart (canvas, data) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  canvas.width = CHART_W * dpr
  canvas.height = CHART_H * dpr
  ctx.scale(dpr, dpr)

  // 主题兼容背景
  ctx.fillStyle = getCssVar('--main', '#0d0d0d')
  ctx.fillRect(0, 0, CHART_W, CHART_H)

  if (data.length < 2) return

  // Y轴范围：用有效值算，但给丢包柱留空间
  const vals = data.filter(v => v > 0 && v < 500)
  if (vals.length === 0 && !data.some(v => v <= 0)) return
  const maxVal = vals.length > 0 ? Math.max(...vals) : 200
  const yMax = Math.max(maxVal * 1.2, 100)

  const scaleY = (v) => {
    if (v <= 0) return CHART_H - 2 // 丢包→底部红线
    return CHART_H - 2 - (v / yMax) * (CHART_H - 4)
  }

  // 网格线（固定 100/200/300ms）
  const gridColor = getCssVar('--text-dark', '#888')
  const gridLineColor = getCssVar('--main-darker', '#333')
  const gridLines = [100, 200, 300]
  ctx.strokeStyle = gridLineColor
  ctx.lineWidth = 0.5
  ctx.setLineDash([2, 3])
  for (const g of gridLines) {
    const y = scaleY(g)
    if (y < 0 || y > CHART_H) continue
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CHART_W, y)
    ctx.stroke()
    ctx.fillStyle = gridColor
    ctx.font = '8px monospace'
    ctx.fillText(g + 'ms', 2, y - 2)
  }
  ctx.setLineDash([])

  // 画柱子
  const barStep = BAR_W + BAR_GAP
  const totalBars = Math.min(data.length, Math.floor(CHART_W / barStep))
  const startIdx = data.length - totalBars

  for (let i = 0; i < totalBars; i++) {
    const v = data[startIdx + i]
    const x = i * barStep

    if (v <= 0) {
      // 丢包：底部红线
      ctx.fillStyle = '#ff4d4f'
      ctx.fillRect(x, CHART_H - 4, BAR_W, 3)
      continue
    }

    const h = Math.max(CHART_H - 2 - scaleY(v), 1)
    const y = scaleY(v)

    let topColor, bottomColor
    if (v > 250) { topColor = '#ff7875'; bottomColor = '#ff4d4f' } else if (v > 150) { topColor = '#ffc53d'; bottomColor = '#faad14' } else { topColor = '#73d13d'; bottomColor = '#52c41a' }

    const grad = ctx.createLinearGradient(x, y, x, y + h)
    grad.addColorStop(0, topColor)
    grad.addColorStop(1, bottomColor)
    ctx.fillStyle = grad

    ctx.beginPath()
    const r = Math.min(BAR_R, h / 2)
    ctx.moveTo(x, y + r)
    ctx.arcTo(x, y, x + BAR_W, y, r)
    ctx.arcTo(x + BAR_W, y, x + BAR_W, y + h, r)
    ctx.lineTo(x + BAR_W, y + h)
    ctx.lineTo(x, y + h)
    ctx.closePath()
    ctx.fill()
  }
}

export default function TerminalInfoPing (props) {
  const { isRemote, pid, host } = props
  const [ping, setPing] = useState('--')
  const [color, setColor] = useState('#999')
  const [avg, setAvg] = useState('--')
  const [max, setMax] = useState('--')
  const [lost, setLost] = useState(0)
  const [total, setTotal] = useState(0)
  const [historyOpen, setHistoryOpen] = useState(false)
  const dataRef = useRef([])
  const canvasRef = useRef(null)

  const secBufRef = useRef([])
  const lossCount = useRef(0)
  const totalCount = useRef(0)
  const rafIdRef = useRef(null)

  useEffect(() => {
    if (!isRemote || !pid) return

    lossCount.current = 0
    totalCount.current = 0
    dataRef.current = []
    secBufRef.current = []

    const measure = async () => {
      totalCount.current++
      try {
        const latency = await tcpPing(pid)
        const valid = latency > 0
        if (valid) {
          dataRef.current.push(latency)
          if (dataRef.current.length > MAX_POINTS) dataRef.current.shift()
          setPing(latency + 'ms')
          if (latency < 100) setColor('#52c41a')
          else if (latency < 200) setColor('#faad14')
          else setColor('#ff4d4f')

          const arr = dataRef.current.filter(v => v > 0)
          if (arr.length > 0) {
            setAvg(Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) + 'ms')
            setMax(Math.max(...arr) + 'ms')
          }
        } else {
          lossCount.current++
          dataRef.current.push(-1) // 丢包也入 chart，显示为红线
          if (dataRef.current.length > MAX_POINTS) dataRef.current.shift()
        }
        setLost(lossCount.current)
        setTotal(totalCount.current)
        secBufRef.current.push(valid ? latency : -1)
      } catch (e) {
        lossCount.current++
        dataRef.current.push(-1)
        if (dataRef.current.length > MAX_POINTS) dataRef.current.shift()
        setLost(lossCount.current)
        setTotal(totalCount.current)
        secBufRef.current.push(-1)
      }
      if (secBufRef.current.length >= 60 && host) {
        const buf = secBufRef.current.splice(0, 60)
        const vals = buf.filter(v => v > 0)
        if (vals.length > 0) {
          const avg = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
          addPing(host, avg)
        } else {
          addPing(host, -1)
        }
      }
      scheduleDraw(canvasRef.current, dataRef.current, rafIdRef)
    }

    const timer = setInterval(measure, 1000)
    measure()
    return () => clearInterval(timer)
  }, [pid, isRemote])

  if (!isRemote) return null

  const lossRate = total > 0 ? (lost / total * 100).toFixed(1) : '0.0'

  return (
    <div className='terminal-info-section terminal-info-ping' style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <b><ApiOutlined /> 实时延迟</b>
        <Tooltip title='历史延迟'>
          <BarChartOutlined style={{ cursor: 'pointer', color: '#888', fontSize: 14 }} onClick={() => setHistoryOpen(true)} />
        </Tooltip>
      </div>
      <PingHistoryModal open={historyOpen} host={host} onClose={() => setHistoryOpen(false)} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 0 }}>
        <span style={{ color, fontSize: 26, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{ping}</span>
        <span style={{ color: '#666', fontSize: 11 }}>RTT</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: parseInt(lossRate) > 5 ? '#ff4d4f' : '#888' }}>
          丢包 {lossRate}% ({lost}/{total})
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '2px 0 4px' }}>
        <span style={{ fontSize: 11, color: '#888' }}>均{avg}</span>
        <span style={{ fontSize: 11, color: '#888' }}>最{max}</span>
      </div>
      <canvas
        ref={canvasRef}
        style={{ width: CHART_W, height: CHART_H, display: 'block', borderRadius: 4 }}
      />
    </div>
  )
}
