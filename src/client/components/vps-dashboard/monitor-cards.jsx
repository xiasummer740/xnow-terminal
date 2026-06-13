/**
 * 实时监控 — 卡片视图
 */
import { useState, useEffect, useRef } from 'react'
import { Card, Tag, Progress, Tooltip } from 'antd'
import { ThunderboltOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { getServerList, connectServerWs } from '../../common/nezha-api'

export default function MonitorCards({ onSshConnect, onSelectDetail }) {
  const [servers, setServers] = useState([])
  const wsRef = useRef(null)

  useEffect(() => {
    getServerList().then((list) => setServers(list || []))
    const ws = connectServerWs()
    if (ws) {
      ws.onmessage = (e) => {
        try {
          const payload = JSON.parse(e.data)
          if (Array.isArray(payload?.servers)) setServers(payload.servers)
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

  if (!servers.length) {
    return <div style={{ textAlign: 'center', color: '#666', padding: 40 }}>暂无监控数据</div>
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
        gap: 12,
      }}
    >
      {servers.map((s) => {
        const cpu = s.state?.cpu ?? 0
        const memPct =
          s.state?.mem_used && s.host?.mem_total ? (s.state.mem_used / s.host.mem_total) * 100 : 0
        const diskPct =
          s.state?.disk_used && s.host?.disk_total
            ? (s.state.disk_used / s.host.disk_total) * 100
            : 0
        return (
          <Card
            key={s.id}
            size="small"
            hoverable
            style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8 }}
            styles={{ body: { padding: 14 } }}
            onClick={() => onSelectDetail?.(s)}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 10,
              }}
            >
              <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 13 }}>
                {s.name || '未命名'}
              </span>
              <Tag color={s.online ? 'green' : 'red'} style={{ marginRight: 0 }}>
                {s.online ? '在线' : '离线'}
              </Tag>
            </div>
            <div style={{ fontSize: 11, color: '#666', marginBottom: 10, fontFamily: 'monospace' }}>
              {s.ipv4 || s.host || '--'}
            </div>
            <div style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#999',
                  marginBottom: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>CPU</span>
                <span>{typeof cpu === 'number' ? cpu.toFixed(1) : '0'}%</span>
              </div>
              <Progress
                percent={Math.min(100, Math.round(cpu))}
                size="small"
                strokeColor={cpu > 80 ? '#ff4d4f' : cpu > 50 ? '#faad14' : '#1890ff'}
                trailColor="#2a2a2a"
                showInfo={false}
              />
            </div>
            <div style={{ marginBottom: 6 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#999',
                  marginBottom: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>内存</span>
                <span>{memPct.toFixed(0)}%</span>
              </div>
              <Progress
                percent={Math.min(100, Math.round(memPct))}
                size="small"
                strokeColor={memPct > 80 ? '#ff4d4f' : memPct > 50 ? '#faad14' : '#52c41a'}
                trailColor="#2a2a2a"
                showInfo={false}
              />
            </div>
            <div style={{ marginBottom: 10 }}>
              <div
                style={{
                  fontSize: 11,
                  color: '#999',
                  marginBottom: 2,
                  display: 'flex',
                  justifyContent: 'space-between',
                }}
              >
                <span>磁盘</span>
                <span>{diskPct.toFixed(0)}%</span>
              </div>
              <Progress
                percent={Math.min(100, Math.round(diskPct))}
                size="small"
                strokeColor={diskPct > 80 ? '#ff4d4f' : diskPct > 50 ? '#faad14' : '#52c41a'}
                trailColor="#2a2a2a"
                showInfo={false}
              />
            </div>
            <div
              style={{
                display: 'flex',
                gap: 12,
                justifyContent: 'flex-end',
                borderTop: '1px solid #2a2a2a',
                paddingTop: 8,
              }}
            >
              <Tooltip title="SSH 连接">
                <ThunderboltOutlined
                  style={{ color: '#888', cursor: 'pointer', fontSize: 14 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSshConnect?.(s)
                  }}
                />
              </Tooltip>
              <Tooltip title="查看详情">
                <InfoCircleOutlined
                  style={{ color: '#888', cursor: 'pointer', fontSize: 14 }}
                  onClick={(e) => {
                    e.stopPropagation()
                    onSelectDetail?.(s)
                  }}
                />
              </Tooltip>
            </div>
          </Card>
        )
      })}
    </div>
  )
}
