# 系统资源仪表盘 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将终端信息面板的进度条改为 4 个圆形仪表盘 + CPU 历史折线图

**Architecture:** 纯 SVG 实现，不引入额外依赖。Gauge 子组件渲染单个仪表盘，CpuHistoryChart 子组件渲染折线图，resource.jsx 作为容器组件管理数据流

**Tech Stack:** React + SVG + Stylus（已有 Ant Design 仅用于 icons）

---

### Task 1: resource.jsx — Complete rewrite with SVG gauges

**Files:**
- Rewrite: `src/client/components/terminal-info/resource.jsx`

- [ ] **Step 1: Replace imports**

```jsx
import { useRef, useState, useEffect, useMemo } from 'react'
import { isEmpty } from 'lodash-es'
import { LineChartOutlined, ReloadOutlined } from '@ant-design/icons'
```

Remove: `import { Progress } from 'antd'` and `import parseInt10 from '../../common/parse-int10'`

- [ ] **Step 2: Create Gauge sub-component**

```jsx
function Gauge ({ percent = 0, size = 120, strokeWidth = 8, label, detail }) {
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (Math.min(percent, 100) / 100) * circumference

  function getColor (p) {
    if (p >= 90) return '#ff4d4f'
    if (p >= 70) return '#faad14'
    if (p >= 50) return '#1890ff'
    return '#52c41a'
  }

  const color = getColor(percent)
  const displayPercent = Number.isFinite(percent) ? percent.toFixed(2) : '0.00'

  return (
    <div className="resource-gauge">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* 背景圆弧 */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke="var(--border-color, #333)"
          strokeWidth={strokeWidth}
        />
        {/* 前景进度弧 */}
        <circle
          cx={size / 2} cy={size / 2} r={radius}
          fill="none" stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: 'stroke-dashoffset 0.5s ease' }}
        />
        {/* 中心百分比文本 */}
        <text
          x={size / 2} y={size / 2 - 4}
          textAnchor="middle"
          fill="var(--text, #fff)"
          fontSize={size * 0.18}
          fontWeight="bold"
          fontFamily="inherit"
        >
          {displayPercent}%
        </text>
      </svg>
      <div className="resource-gauge-label">{label}</div>
      <div className="resource-gauge-detail">{detail}</div>
    </div>
  )
}
```

- [ ] **Step 3: Create CpuHistoryChart sub-component**

```jsx
function CpuHistoryChart ({ history }) {
  if (!history || history.length < 2) {
    return (
      <div className="resource-cpu-history">
        <div className="resource-cpu-history-header">
          <LineChartOutlined /> CPU History
        </div>
        <div className="resource-cpu-history-empty">等待数据...</div>
      </div>
    )
  }

  const width = 400
  const height = 120
  const padding = { top: 10, right: 10, bottom: 25, left: 40 }
  const chartW = width - padding.left - padding.right
  const chartH = height - padding.top - padding.bottom

  const values = history.map(h => h.value)
  const times = history.map(h => h.time)
  const maxVal = 100
  const minVal = 0

  const points = values.map((v, i) => {
    const x = padding.left + (i / Math.max(values.length - 1, 1)) * chartW
    const y = padding.top + chartH - ((v - minVal) / (maxVal - minVal)) * chartH
    return `${x},${y}`
  }).join(' ')

  // 时间轴刻度标签 - 取首尾和中间
  const timeLabels = [
    times[0],
    times[Math.floor(times.length / 2)],
    times[times.length - 1]
  ].map((t, i) => {
    const x = padding.left + (i / 2) * chartW
    return { x, label: t }
  })

  const yTicks = [0, 25, 50, 75, 100]

  return (
    <div className="resource-cpu-history">
      <div className="resource-cpu-history-header">
        <LineChartOutlined /> CPU History
      </div>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {/* Y轴网格线 */}
        {yTicks.map(tick => {
          const y = padding.top + chartH - ((tick - minVal) / (maxVal - minVal)) * chartH
          return (
            <g key={tick}>
              <line x1={padding.left} y1={y} x2={width - padding.right} y2={y}
                stroke="var(--border-color, #444)" strokeWidth="0.5" strokeDasharray="3,3" />
              <text x={padding.left - 5} y={y + 3} textAnchor="end" fill="var(--text-dark, #888)"
                fontSize="10" fontFamily="inherit">{tick}%</text>
            </g>
          )
        })}
        {/* 折线 */}
        <polyline
          fill="none" stroke="#1890ff" strokeWidth="1.5"
          points={points}
        />
        {/* 填充区域 */}
        <polygon
          fill="rgba(24,144,255,0.1)"
          points={`${padding.left},${height - padding.bottom} ${points} ${padding.left + chartW},${height - padding.bottom}`}
        />
        {/* X轴时间标签 */}
        {timeLabels.map((tl, i) => (
          <text key={i} x={tl.x} y={height - 5} textAnchor="middle"
            fill="var(--text-dark, #888)" fontSize="9" fontFamily="inherit">
            {tl.label}
          </text>
        ))}
      </svg>
    </div>
  )
}
```

- [ ] **Step 4: Write main component**

```jsx
export default function TerminalInfoResource (props) {
  const { cpu, mem, swap, disks, isRemote, terminalInfos } = props

  if (
    !isRemote ||
    (!terminalInfos.includes('cpu') &&
    !terminalInfos.includes('mem') &&
    !terminalInfos.includes('swap'))
  ) {
    return null
  }

  // CPU 历史数据追踪
  const cpuHistoryRef = useRef([])
  const [, forceUpdate] = useState(0)

  function formatTime (d) {
    const h = d.getHours().toString().padStart(2, '0')
    const m = d.getMinutes().toString().padStart(2, '0')
    const s = d.getSeconds().toString().padStart(2, '0')
    return `${h}:${m}:${s}`
  }

  // 解析 CPU 百分比
  const cpuPercent = (() => {
    if (!cpu) return null
    const n = parseFloat(cpu)
    return Number.isFinite(n) ? n : null
  })()

  useEffect(() => {
    if (cpuPercent !== null) {
      const now = new Date()
      cpuHistoryRef.current.push({ value: cpuPercent, time: formatTime(now) })
      if (cpuHistoryRef.current.length > 60) {
        cpuHistoryRef.current.shift()
      }
      forceUpdate(n => n + 1)
    }
  }, [cpuPercent])

  // 计算内存百分比
  function calcPercent (used, total) {
    if (!used || !total) return 0
    const u = parseFloat(used)
    const t = parseFloat(total)
    if (!t) return 0
    return (u / t) * 100
  }

  // 提取存储（根分区）
  const storageDisk = useMemo(() => {
    if (!disks || disks.length === 0) return null
    return disks.find(d => d.mount === '/') || disks[0]
  }, [disks])

  const memPercent = mem?.used && mem?.total ? calcPercent(mem.used, mem.total) : null
  const swapPercent = swap?.used && swap?.total ? calcPercent(swap.used, swap.total) : null
  const diskPercent = storageDisk ? calcPercent(storageDisk.used, storageDisk.size) : null

  const memDetail = mem?.used && mem?.total ? `${mem.used} / ${mem.total}` : ''
  const swapDetail = swap?.used && swap?.total ? `${swap.used} / ${swap.total}` : ''
  const diskDetail = storageDisk ? `${storageDisk.used} / ${storageDisk.size}` : ''

  return (
    <div className="terminal-info-section terminal-info-resource">
      <div className="resource-gauges-row">
        {terminalInfos.includes('cpu') && (
          <Gauge
            percent={cpuPercent ?? 0}
            label="CPU"
            detail={cpu ? `CPU: ${cpu}` : ''}
          />
        )}
        {terminalInfos.includes('mem') && (
          <Gauge
            percent={memPercent ?? 0}
            label="内存"
            detail={memDetail}
          />
        )}
        {terminalInfos.includes('swap') && (
          <Gauge
            percent={swapPercent ?? 0}
            label="交换分区"
            detail={swapDetail}
          />
        )}
        {storageDisk && (
          <Gauge
            percent={diskPercent ?? 0}
            label="存储"
            detail={diskDetail}
          />
        )}
      </div>
      {terminalInfos.includes('cpu') && (
        <CpuHistoryChart history={cpuHistoryRef.current} />
      )}
    </div>
  )
}
```

- [ ] **Step 5: Verify logic flow**
  - 条件渲染：仅 `isRemote && terminalInfos` 包含对应项时显示
  - CPU 历史：用 useRef 存储，forceUpdate 触发重渲染
  - 存储数据：从 disks 数组取根分区 `/`，无则取第一个

### Task 2: terminal-info.jsx — Pass disks data to Resource

**Files:**
- Modify: `src/client/components/terminal-info/terminal-info.jsx`

- [ ] **Step 1: Add disks to Resource props**

```jsx
<TerminalInfoResource
  {...props} {...state}
/>
```

Current code at line 50-52 already passes `{...state}`, which includes `disks`. No change needed — `state` already has `disks` from line 25.

✅ No actual code change needed for this task.

### Task 3: run-cmd.jsx — Keep decimal precision in CPU

**Files:**
- Modify: `src/client/components/terminal-info/run-cmd.jsx`

- [ ] **Step 1: Modify formatCpu to preserve decimals**

Current code (line 66-67):
```jsx
return {
  cpu: str.split(' ')[1]
}
```

This already returns the raw string like "13.55%". No change needed — the precision is preserved.

✅ No actual code change needed for this task.

### Task 4: terminal-info.styl — Add gauge styles

**Files:**
- Modify: `src/client/components/terminal-info/terminal-info.styl`

- [ ] **Step 1: Append gauge styles**

```stylus
.resource-gauges-row
  display grid
  grid-template-columns 1fr 1fr
  gap 16px
  padding 8px

.resource-gauge
  display flex
  flex-direction column
  align-items center
  text-align center
  padding 8px

  svg
    margin-bottom 6px

.resource-gauge-label
  font-size 12px
  color var(--text-dark)
  margin-bottom 2px

.resource-gauge-detail
  font-size 11px
  color var(--text-dark)
  opacity 0.8

.resource-cpu-history
  padding 12px 16px
  border-top 1px solid var(--border-color)
  margin-top 8px

  .resource-cpu-history-header
    font-size 12px
    color var(--text-dark)
    margin-bottom 8px

    .anticon
      margin-right 4px

  .resource-cpu-history-empty
    font-size 11px
    color var(--text-dark)
    opacity 0.6
    text-align center
    padding 40px 0

  svg
    width 100%
    height auto
</stylus>
```

- [ ] **Step 2: Verify `var()` variables match existing theme**
  - `--text`, `--text-dark`, `--border-color` — check if `--border-color` exists or use fallback

### Task 5: Verification

- [ ] **Step 1: Compile Stylus**

Run: `npx stylus src/client/components/terminal-info/terminal-info.styl`
Expected: No errors

- [ ] **Step 2: Run app dev mode**

Run: `npm start` or `node build/bin/start.js`
Expected: App starts without errors

- [ ] **Step 3: Verify gauge display**
  - Open terminal info panel for a remote session
  - Check 4 gauges render with correct data
  - Check CPU History chart displays and updates

- [ ] **Step 4: Commit**

```bash
git add src/client/components/terminal-info/resource.jsx src/client/components/terminal-info/terminal-info.styl
git commit -m "feat: 用SVG仪表盘替换系统资源进度条"
```
