/**
 * ping latency info - 始终显示
 */

import { ApiOutlined } from '@ant-design/icons'
import { useEffect, useState } from 'react'
import { runCmd } from '../terminal/terminal-apis'

export default function TerminalInfoPing (props) {
  const { isRemote, pid } = props
  const [ping, setPing] = useState('--')
  const [color, setColor] = useState('#1890ff')

  useEffect(() => {
    // 只有远程连接才启动延迟监控
    if (!isRemote || !pid) {
      return
    }

    let timer
    const measurePing = async () => {
      const start = Date.now()
      try {
        // 发送一个简单的 echo 命令来测量响应时间
        await runCmd(pid, 'echo')
        const latency = Date.now() - start
        setPing(latency + 'ms')

        // 根据延迟设置颜色
        if (latency > 200) {
          setColor('#ff4d4f') // 红色
        } else if (latency > 100) {
          setColor('#faad14') // 黄色
        } else {
          setColor('#52c41a') // 绿色
        }
      } catch (e) {
        setPing('--')
        setColor('#999')
      }
      timer = setTimeout(measurePing, 1000) // 每1秒更新一次
    }

    // 延迟1秒后开始测量
    const initTimer = setTimeout(measurePing, 1000)

    return () => {
      clearTimeout(timer)
      clearTimeout(initTimer)
    }
  }, [pid, isRemote])

  // 只有远程连接才显示
  if (!isRemote) {
    return null
  }

  return (
    <div className='terminal-info-section terminal-info-ping' style={{ padding: '8px 0', borderBottom: '1px solid #333' }}>
      <b><ApiOutlined /> 延迟</b>: <span style={{ color, fontSize: '18px', fontWeight: 'bold', marginLeft: '10px' }}>{ping}</span>
    </div>
  )
}
