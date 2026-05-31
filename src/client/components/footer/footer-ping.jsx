/**
 * 底部状态栏延迟数字（柱状图在右侧面板）
 */
import { useEffect, useState, useRef } from 'react'
import { tcpPing } from '../terminal/terminal-apis'

function SignalIcon ({ level }) {
  const bars = [0, 1, 2, 3].map(i => {
    const h = 4 + i * 3.5
    const y = 14 - h
    const active = i <= level
    return <rect key={i} x={i * 4.5 + 1} y={y} width='3.5' height={h} rx='0.5'
      fill={active ? 'currentColor' : 'none'}
      stroke='currentColor' strokeWidth='0.8' />
  })
  return (
    <svg width='18' height='14' viewBox='0 0 18 14' style={{ verticalAlign: 'middle' }}>
      {bars}
    </svg>
  )
}

export default function FooterPing ({ store }) {
  const [ping, setPing] = useState('')
  const [color, setColor] = useState('#666')
  const [level, setLevel] = useState(-1)

  useEffect(() => {
    const measure = async () => {
      const tab = store.currentTab
      if (!tab || !tab.host || !tab.id) {
        setPing('')
        return
      }
      try {
        const latency = await tcpPing(tab.id)
        if (latency > 0) {
          setPing(latency + 'ms')
          if (latency < 60) { setColor('#52c41a'); setLevel(3) }
          else if (latency < 120) { setColor('#52c41a'); setLevel(2) }
          else if (latency < 200) { setColor('#faad14'); setLevel(1) }
          else { setColor('#ff4d4f'); setLevel(0) }
        }
      } catch (e) {}
    }
    measure()
    const timer = setInterval(measure, 1000)
    return () => clearInterval(timer)
  }, [store.currentTab?.id, store.currentTab?.host])

  if (!store.currentTab?.host || !ping) return null

  return (
    <div className='terminal-footer-unit terminal-footer-ping'
      style={{
        color, fontSize: 12, fontWeight: 'bold',
        display: 'flex', alignItems: 'center', gap: 4, paddingRight: 8,
        transition: 'color 0.3s ease',
        filter: `drop-shadow(0 0 ${level >= 2 ? 4 : 0}px ${color})`
      }}>
      <SignalIcon level={level} />
      <span style={{ fontVariantNumeric: 'tabular-nums', transition: 'all 0.3s ease' }}>{ping}</span>
    </div>
  )
}
