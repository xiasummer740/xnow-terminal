/**
 * up time info
 */

import { ClockCircleOutlined } from '@ant-design/icons'

const unitMap = {
  'years': '年', 'year': '年',
  'weeks': '周', 'week': '周',
  'days': '天', 'day': '天',
  'hours': '小时', 'hour': '小时',
  'minutes': '分钟', 'minute': '分钟'
}

function translateUptime (str) {
  if (!str) return ''
  // "up 3 days, 13 hours, 43 minutes" → "已运行 3 天 13 小时 43 分钟"
  let s = str.replace(/^up\s*/i, '已运行 ')
  for (const [en, zh] of Object.entries(unitMap)) {
    s = s.replace(new RegExp(`\\b${en}\\b`, 'g'), zh)
  }
  s = s.replace(/,/g, '')
  return s.replace(/\s+/g, ' ').trim()
}

export default function TerminalInfoUp (props) {
  const { uptime, isRemote, terminalInfos } = props
  if (!isRemote || !terminalInfos.includes('uptime')) {
    return null
  }
  return (
    <div className='terminal-info-section terminal-info-up'>
      <b><ClockCircleOutlined /> 运行时间</b>: {translateUptime(uptime)}
    </div>
  )
}
