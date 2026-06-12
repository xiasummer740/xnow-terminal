/**
 * resource dashboard — SVG gauges replacing Ant Design Progress
 *
 * Components:
 *   Gauge              — circular progress ring
 *   CpuHistoryChart    — SVG line chart with fill area
 *   TerminalInfoResource — main dashboard (gauges + history chart)
 */

import { useRef, useState, useEffect } from 'react'
import { isEmpty } from 'lodash-es'
import { LineChartOutlined } from '@ant-design/icons'

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function percentColor (p) {
  if (p >= 90) return '#ff4d4f'
  if (p >= 70) return '#faad14'
  if (p >= 50) return '#1890ff'
  return '#52c41a'
}

/** Format a Date-ish value to HH:mm:ss. */
function fmtTime (t) {
  if (!t) return ''
  const d = new Date(t)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`
}

/* ─── Gauge ───────────────────────────────────────────────────────────────── */

/**
 * SVG circular progress gauge.
 *
 * Props:
 *   percent      — 0-100 number
 *   size         — SVG side length (default 120)
 *   strokeWidth  — arc thickness (default 8)
 *   label        — line below the gauge (e.g. "CPU")
 *   detail       — second line below the gauge (e.g. "13.55%(3.5%/2.4Gi)")
 */

function Gauge ({ percent = 0, size = 72, strokeWidth = 5, label, detail }) {
  const cx = size / 2
  const cy = size / 2
  const r = (size - strokeWidth) / 2 - 1
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(Math.max(percent, 0), 100) / 100)
  const color = percentColor(percent)
  const fontSize = Math.max(size * 0.24, 14)

  return (
    <div style={{ textAlign: 'center' }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ display: 'block', margin: '0 auto' }}
      >
        {/* background track */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill='none'
          stroke='var(--border-color, #333)'
          strokeWidth={strokeWidth}
        />
        {/* foreground arc */}
        <circle
          cx={cx}
          cy={cy}
          r={r}
          fill='none'
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap='round'
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease, stroke 0.5s ease' }}
        />
        {/* center text */}
        <text
          x={cx}
          y={cy}
          textAnchor='middle'
          dominantBaseline='central'
          fill='var(--text, #e0e0e0)'
          fontSize={fontSize}
          fontWeight='bold'
          fontFamily='monospace'
        >
          {percent.toFixed(2)}%
        </text>
      </svg>
      {label && <div style={{ fontSize: 11, color: 'var(--text)', marginTop: 2, lineHeight: 1.2 }}>{label}</div>}
      {detail && <div style={{ fontSize: 10, color: 'var(--text-dark, #999)', lineHeight: 1.2 }}>{detail}</div>}
    </div>
  )
}

/* ─── CpuHistoryChart ─────────────────────────────────────────────────────── */

/**
 * SVG line chart showing CPU usage history.
 *
 * Props:
 *   history  — array of { value: number, time: string|Date }
 */

function CpuHistoryChart ({ history = [] }) {
  const width = 400
  const height = 70
  const padL = 36
  const padR = 6
  const padT = 4
  const padB = 16
  const chartW = width - padL - padR
  const chartH = height - padT - padB

  if (history.length < 2) {
    return (
      <div style={{ marginTop: 6 }}>
        <div style={{ fontSize: 11, color: 'var(--text-dark, #999)', marginBottom: 4 }}>
          <LineChartOutlined style={{ marginRight: 4 }} />CPU 历史
        </div>
        <svg width='100%' height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
          <text
            x={width / 2}
            y={height / 2}
            textAnchor='middle'
            dominantBaseline='central'
            fill='var(--text-dark, #999)'
            fontSize={11}
          >
            等待数据...
          </text>
        </svg>
      </div>
    )
  }

  const n = history.length
  const values = history.map(h => Math.min(Math.max(h.value, 0), 100))

  // Build polyline points and fill-area points
  const linePoints = values.map((v, i) => {
    const x = padL + (i / (n - 1)) * chartW
    const y = padT + chartH - (v / 100) * chartH
    return `${x},${y}`
  })

  // Fill area: bottom-left → line → bottom-right → close
  const fillPoints = [
    `${padL},${padT + chartH}`,
    ...linePoints,
    `${padL + chartW},${padT + chartH}`
  ].join(' ')

  // Grid lines (horizontal) y positions
  const gridYLabels = ['0%', '25%', '50%', '75%', '100%']
  const gridYPositions = [0, 25, 50, 75, 100].map(p => padT + chartH - (p / 100) * chartH)

  // Time labels (first, middle, last)
  const timeIndices = [0, Math.floor(n / 2), n - 1]

  return (
    <div style={{ marginTop: 6 }}>
      <div style={{ fontSize: 11, color: 'var(--text-dark, #999)', marginBottom: 2 }}>
        <LineChartOutlined style={{ marginRight: 4 }} />CPU 历史
      </div>
      <svg width='100%' height={height} viewBox={`0 0 ${width} ${height}`} style={{ display: 'block' }}>
        {/* dashed grid lines + y labels */}
        {gridYLabels.map((label, i) => (
          <g key={label}>
            <line
              x1={padL}
              y1={gridYPositions[i]}
              x2={padL + chartW}
              y2={gridYPositions[i]}
              stroke='var(--border-color, #333)'
              strokeWidth={0.5}
              strokeDasharray='3,3'
            />
            <text
              x={padL - 4}
              y={gridYPositions[i]}
              textAnchor='end'
              dominantBaseline='central'
              fill='var(--text-dark, #999)'
              fontSize={9}
            >
              {label}
            </text>
          </g>
        ))}

        {/* x-axis time labels */}
        {timeIndices.map(i => (
          <text
            key={i}
            x={padL + (i / (n - 1)) * chartW}
            y={padT + chartH + 12}
            textAnchor='middle'
            fill='var(--text-dark, #999)'
            fontSize={9}
          >
            {fmtTime(history[i].time)}
          </text>
        ))}

        {/* fill area */}
        <polygon
          points={fillPoints}
          fill='rgba(24,144,255,0.1)'
        />

        {/* polyline */}
        <polyline
          points={linePoints.join(' ')}
          fill='none'
          stroke='#1890ff'
          strokeWidth={1.5}
          strokeLinejoin='round'
          strokeLinecap='round'
        />
      </svg>
    </div>
  )
}

/* ─── TerminalInfoResource (main) ─────────────────────────────────────────── */

function toNumber (n = '') {
  let f = 1
  if (n.includes('G')) {
    f = 1024 * 1024
  } else if (n.includes('T')) {
    f = 1024 * 1024 * 1024
  } else if (n.includes('M')) {
    f = 1024
  }
  return f * parseFloat(n)
}

function computePercent (used, total) {
  const u = toNumber(used)
  const t = toNumber(total)
  if (!Number.isFinite(u) || !Number.isFinite(t)) return 0
  return Math.floor(u * 100 / (t || (u + 1)))
}

export default function TerminalInfoResource (props) {
  const { cpu, mem, swap, disks, isRemote, terminalInfos } = props

  // ── guard ───────────────────────────────────────────────────────────
  if (
    !isRemote ||
    (!terminalInfos.includes('cpu') &&
     !terminalInfos.includes('mem') &&
     !terminalInfos.includes('swap') &&
     !terminalInfos.includes('disks'))
  ) {
    return null
  }

  // ── CPU history tracking ────────────────────────────────────────────
  const historyRef = useRef([])
  const [, forceUpdate] = useState(0)
  const cpuRef = useRef('')

  // Poll CPU every 2 s for realtime feedback (PureComponent parent may skip
  // re-render when value stays constant, so we use our own interval)
  cpuRef.current = cpu

  // Poll CPU value every 5 s regardless of prop changes (PureComponent parent
  // may skip re-render when CPU stays constant)
  useEffect(() => {
    if (!terminalInfos.includes('cpu')) {
      historyRef.current = []
      return
    }
    const id = setInterval(() => {
      const arr = historyRef.current
      const cp = parseFloat(cpuRef.current) || 0
      arr.push({ value: cp, time: Date.now() })
      if (arr.length > 60) arr.shift()
      forceUpdate(n => n + 1)
    }, 2000)
    return () => clearInterval(id)
  }, [terminalInfos])

  const cpuPercent = terminalInfos.includes('cpu') ? parseFloat(cpu) || 0 : 0

  // ── derive gauges data ──────────────────────────────────────────────
  const showCpu = terminalInfos.includes('cpu')
  const showMem = terminalInfos.includes('mem')
  const showSwap = terminalInfos.includes('swap')
  const showDisks = terminalInfos.includes('disks')

  // Memory percent
  let memPercent = 0
  let memDetail = ''
  if (showMem && !isEmpty(mem)) {
    if (Number.isFinite(mem.percent)) {
      memPercent = mem.percent
    } else {
      memPercent = computePercent(mem.used, mem.total)
    }
    memDetail = `${mem.used || '?'}/${mem.total || '?'}`
  }

  // Swap percent
  let swapPercent = 0
  let swapDetail = ''
  if (showSwap && !isEmpty(swap)) {
    if (Number.isFinite(swap.percent)) {
      swapPercent = swap.percent
    } else {
      swapPercent = computePercent(swap.used, swap.total)
    }
    swapDetail = `${swap.used || '?'}/${swap.total || '?'}`
  }

  // Disk percent (root partition or first)
  let diskPercent = 0
  let diskDetail = ''
  if (showDisks && !isEmpty(disks)) {
    const rootDisk = disks.find(d => d.mount === '/') || disks[0]
    if (rootDisk.usedPercent != null) {
      diskPercent = parseFloat(rootDisk.usedPercent) || 0
    } else {
      diskPercent = computePercent(rootDisk.used, rootDisk.size)
    }
    const sz = rootDisk.size || '?'
    const us = rootDisk.used || '?'
    diskDetail = `${us}/${sz} (${rootDisk.filesystem || ''})`
  }

  // ── render ──────────────────────────────────────────────────────────
  const gauges = []

  if (showCpu) {
    gauges.push(
      <Gauge
        key='cpu'
        percent={cpuPercent}
        label='CPU'
      />
    )
  }
  if (showMem) {
    gauges.push(
      <Gauge
        key='mem'
        percent={memPercent}
        label='内存'
        detail={memDetail}
      />
    )
  }
  if (showSwap) {
    gauges.push(
      <Gauge
        key='swap'
        percent={swapPercent}
        label='交换分区'
        detail={swapDetail}
      />
    )
  }
  if (showDisks) {
    gauges.push(
      <Gauge
        key='disk'
        percent={diskPercent}
        label='存储'
        detail={diskDetail}
      />
    )
  }

  return (
    <div className='terminal-info-section terminal-info-resource'>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px', padding: '2px 0', justifyItems: 'center' }}>
        {gauges}
      </div>
      {showCpu && <CpuHistoryChart history={historyRef.current} />}
    </div>
  )
}
