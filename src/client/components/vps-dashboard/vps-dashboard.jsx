/**
 * VPS 监控看板 — 专业表格视图
 */
import { Modal, Tag, Empty, Tooltip, Progress } from 'antd'
import {
  ThunderboltOutlined,
  LinkOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  WarningOutlined,
  DollarOutlined,
  CloudOutlined
} from '@ant-design/icons'
import './vps-dashboard.styl'

function StatusDot ({ expired, expiring }) {
  const color = expired ? '#ff4d4f' : expiring ? '#faad14' : '#52c41a'
  const pulse = expired ? { animation: 'none' } : {}
  return (
    <span style={{
      display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
      background: color, marginRight: 6, boxShadow: `0 0 6px ${color}`, ...pulse
    }} />
  )
}

export default function VpsDashboard ({ visible, onClose }) {
  const all = window.store.bookmarks || []

  // 每次渲染都重新计算（reactive 数组引用不变，useMemo 不会触发）
  const vpsList = (() => {
    return all
      .filter(b => b.vpsExpiry || b.vpsPrice || b.vpsTraffic || b.vpsUrl)
      .map(b => {
        const expiryDate = b.vpsExpiry ? new Date(b.vpsExpiry) : null
        const days = expiryDate && !isNaN(expiryDate.getTime())
          ? Math.ceil((expiryDate - Date.now()) / 86400000)
          : null
        const name = b.title || `${b.username || ''}@${b.host || ''}`
        return {
          id: b.id, name, host: b.host, vpsUrl: b.vpsUrl,
          days, vpsPrice: b.vpsPrice, vpsTraffic: b.vpsTraffic, vpsRecharge: b.vpsRecharge,
          expired: days !== null && days <= 0,
          expiring: days !== null && days > 0 && days <= 30
        }
      })
      .sort((a, b) => {
        if (a.days === null) return 1
        if (b.days === null) return -1
        return a.days - b.days
      })
  })()

  const stats = {
    total: vpsList.length,
    expired: vpsList.filter(v => v.expired).length,
    expiring: vpsList.filter(v => v.expiring).length,
    ok: vpsList.filter(v => !v.expired && !v.expiring).length
  }

  const maxDays = Math.max(...vpsList.map(v => v.days || 0), 365)

  return (
    <Modal
      title={
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          <ThunderboltOutlined style={{ color: '#1890ff', marginRight: 8 }} />
          VPS 监控看板
        </span>
      }
      open={visible} onCancel={onClose} footer={null}
      width={960} className='vps-dashboard-modal' destroyOnClose
    >
      {/* 统计概览 */}
      <div className='vps-overview'>
        <div className='vps-overview-item'>
          <span className='vps-overview-num'>{stats.total}</span>
          <span className='vps-overview-label'>总计</span>
        </div>
        <div className='vps-overview-item green'>
          <span className='vps-overview-num'>{stats.ok}</span>
          <span className='vps-overview-label'>正常</span>
        </div>
        <div className='vps-overview-item orange'>
          <span className='vps-overview-num'>{stats.expiring}</span>
          <span className='vps-overview-label'>即将到期</span>
        </div>
        <div className='vps-overview-item red'>
          <span className='vps-overview-num'>{stats.expired}</span>
          <span className='vps-overview-label'>已过期</span>
        </div>
      </div>

      {vpsList.length === 0 ? (
        <Empty style={{ padding: 40 }} description='暂无 VPS 数据，请在书签编辑中填写 VPS 字段' />
      ) : (
        <div className='vps-table-wrap'>
          <table className='vps-table'>
            <thead>
              <tr>
                <th style={{ width: 30 }}></th>
                <th style={{ width: 160 }}>名称</th>
                <th style={{ width: 130 }}>主机</th>
                <th style={{ width: 130 }}>到期时间</th>
                <th style={{ width: 90 }}>价格</th>
                <th style={{ width: 90 }}>流量</th>
                <th style={{ width: 90 }}>续费</th>
                <th style={{ width: 50 }}></th>
              </tr>
            </thead>
            <tbody>
              {vpsList.map(vps => (
                <tr key={vps.id} className={vps.expired ? 'row-expired' : vps.expiring ? 'row-warning' : ''}>
                  <td><StatusDot expired={vps.expired} expiring={vps.expiring} /></td>
                  <td>
                    <span className='vps-name'>{vps.name}</span>
                  </td>
                  <td>
                    <span className='vps-host'>{vps.host || '--'}</span>
                  </td>
                  <td>
                    {vps.days !== null ? (
                      <div className='vps-expiry-cell'>
                        <Progress
                          percent={Math.min(100, Math.round((1 - vps.days / maxDays) * 100))}
                          size='small'
                          strokeColor={vps.expired ? '#ff4d4f' : vps.expiring ? '#faad14' : '#52c41a'}
                          trailColor='#1f1f1f'
                          showInfo={false}
                          style={{ width: 50, marginRight: 8 }}
                        />
                        {vps.expired
                          ? <Tag color='red'>过期{vps.days === 0 ? '今天' : Math.abs(vps.days) + '天'}</Tag>
                          : vps.expiring
                            ? <Tag color='orange'>{vps.days}天</Tag>
                            : <span style={{ color: '#52c41a', fontSize: 12 }}>{vps.days}天</span>
                        }
                      </div>
                    ) : <span style={{ color: '#555' }}>--</span>}
                  </td>
                  <td>{vps.vpsPrice || '--'}</td>
                  <td>{vps.vpsTraffic || '--'}</td>
                  <td>{vps.vpsRecharge || '--'}</td>
                  <td>
                    {vps.vpsUrl && (
                      <Tooltip title='打开管理面板'>
                        <LinkOutlined
                          style={{ color: '#555', cursor: 'pointer', fontSize: 14 }}
                          onClick={() => window.openLink(vps.vpsUrl, '_blank')}
                        />
                      </Tooltip>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
