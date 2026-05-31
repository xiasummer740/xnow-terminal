/**
 * 右侧面板 - 网络延迟 + 精细柱状图（类似FinalShell）
 */
import { ApiOutlined } from '@ant-design/icons'
import { useEffect, useState, useRef } from 'react'
import { tcpPing } from '../terminal/terminal-apis'

const MAX_POINTS = 60 // 60个数据点，每1秒1个 = 1分钟历史
const CHART_W = 280
const CHART_H = 50
const BAR_W = 2.5
const BAR_GAP = 1.5

// Canvas 画柱状图
let rafId = null
function scheduleDraw (canvas, data) {
  if (rafId) cancelAnimationFrame(rafId)
  rafId = requestAnimationFrame(() => drawChart(canvas, data))
}

function drawChart (canvas, data) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const dpr = window.devicePixelRatio || 1
  canvas.width = CHART_W * dpr
  canvas.height = CHART_H * dpr
  ctx.scale(dpr, dpr)

  // 背景
  ctx.fillStyle = '#0d0d0d'
  ctx.fillRect(0, 0, CHART_W, CHART_H)

  if (data.length < 2) return

  // 计算Y轴范围
  const vals = data.filter(v => v > 0)
  if (vals.length === 0) return
  const maxVal = Math.max(...vals)
  const minVal = Math.min(...vals)
  const range = Math.max(maxVal - minVal, 20)
  const yMin = Math.max(0, minVal - range * 0.1)
  const yMax = maxVal + range * 0.1

  const scaleY = (v) => CHART_H - 2 - ((v - yMin) / (yMax - yMin)) * (CHART_H - 4)

  // 刻度线
  ctx.strokeStyle = '#222'
  ctx.lineWidth = 0.5
  const steps = 4
  for (let i = 0; i <= steps; i++) {
    const val = yMin + (yMax - yMin) * i / steps
    const y = scaleY(val)
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(CHART_W, y)
    ctx.stroke()
    // 刻度值
    ctx.fillStyle = '#555'
    ctx.font = '9px monospace'
    ctx.fillText(Math.round(val) + '', 2, y - 2)
  }

  // 画柱子
  const barStep = BAR_W + BAR_GAP
  const totalBars = Math.min(data.length, Math.floor(CHART_W / barStep))
  const startIdx = data.length - totalBars

  for (let i = 0; i < totalBars; i++) {
    const v = data[startIdx + i]
    if (v <= 0) continue
    const x = i * barStep
    const h = Math.max(CHART_H - 2 - scaleY(v), 1)
    const y = scaleY(v)
    if (v > 250) ctx.fillStyle = '#ff4d4f'
    else if (v > 150) ctx.fillStyle = '#faad14'
    else ctx.fillStyle = '#52c41a'
    ctx.fillRect(x, y, BAR_W, h)
  }
}

export default function TerminalInfoPing (props) {
  const { isRemote, pid } = props
  const [ping, setPing] = useState('--')
  const [color, setColor] = useState('#999')
  const [avg, setAvg] = useState('--')
  const [max, setMax] = useState('--')
  const dataRef = useRef([])
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!isRemote || !pid) return

    let timer
    const measure = async () => {
      try {
        const latency = await tcpPing(pid)
        if (latency > 0) {
          dataRef.current.push(latency)
          if (dataRef.current.length > MAX_POINTS) dataRef.current.shift()
          setPing(latency + 'ms')
          if (latency < 100) setColor('#52c41a')
          else if (latency < 200) setColor('#faad14')
          else setColor('#ff4d4f')

          // 统计
          const arr = dataRef.current.filter(v => v > 0)
          if (arr.length > 0) {
            setAvg(Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) + 'ms')
            setMax(Math.max(...arr) + 'ms')
          }
        }
      } catch (e) {}
      scheduleDraw(canvasRef.current, dataRef.current)
    }

    timer = setInterval(measure, 1000)
    measure()
    return () => clearInterval(timer)
  }, [pid, isRemote])

  if (!isRemote) return null

  return (
    <div className='terminal-info-section terminal-info-ping' style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
      {/* 当前延迟 + 统计 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
        <b><ApiOutlined /> 网络延迟</b>
        <span style={{ fontSize: 11, color: '#888' }}>
          均{avg} / 最{max}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginBottom: 4 }}>
        <span style={{ color, fontSize: 22, fontWeight: 'bold', fontVariantNumeric: 'tabular-nums' }}>{ping}</span>
        <span style={{ color: '#666', fontSize: 11 }}>RTT</span>
      </div>
      {/* 柱状图 */}
      <canvas
        ref={canvasRef}
        style={{ width: CHART_W, height: CHART_H, display: 'block', borderRadius: 4 }}
      />
    </div>
  )
}
