/**
 * VPS 作战看板 — 科技感卡片仪表盘
 */
import { useState, useMemo } from 'react'
import { Modal, Tag, Empty, Tooltip } from 'antd'
import {
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  ThunderboltOutlined,
  GlobalOutlined,
  DollarOutlined,
  CloudOutlined,
  LinkOutlined
} from '@ant-design/icons'
import './vps-dashboard.styl'

function ExpiryBadge ({ days, isExpired }) {
  if (isExpired) return <Tag color='red' icon={<WarningOutlined />}>已过期 {Math.abs(days)}天</Tag>
  if (days <= 7) return <Tag color='red'>{days}天</Tag>
  if (days <= 30) return <Tag color='orange' icon={<ClockCircleOutlined />}>{days}天</Tag>
  if (days <= 90) return <Tag color='blue'>{days}天</Tag>
  return <Tag color='green' icon={<CheckCircleOutlined />}>{days}天</Tag>
}

export default function VpsDashboard ({ visible, onClose }) {
  const all = window.store.bookmarks || []

  const vpsList = all
    .filter(b => b.vpsExpiry || b.vpsPrice || b.vpsTraffic || b.vpsUrl)
    .map(b => {
      const expiryDate = b.vpsExpiry ? new Date(b.vpsExpiry) : null
      const expiryDays = expiryDate && !isNaN(expiryDate.getTime())
        ? Math.ceil((expiryDate - Date.now()) / 86400000)
        : null
      const name = b.title || `${b.username || ''}@${b.host || ''}:${b.port || ''}`
      return {
        id: b.id,
        name,
        host: b.host,
        vpsUrl: b.vpsUrl,
        vpsExpiry: b.vpsExpiry,
        expiryDays,
        vpsPrice: b.vpsPrice,
        vpsTraffic: b.vpsTraffic,
        vpsRecharge: b.vpsRecharge,
        isExpired: expiryDays !== null && expiryDays <= 0,
        isExpiring: expiryDays !== null && expiryDays > 0 && expiryDays <= 30
      }
    })
    .sort((a, b) => {
      if (a.expiryDays === null) return 1
      if (b.expiryDays === null) return -1
      return a.expiryDays - b.expiryDays
    })

  const stats = {
    total: vpsList.length,
    expired: vpsList.filter(v => v.isExpired).length,
    expiring: vpsList.filter(v => v.isExpiring).length,
    healthy: vpsList.filter(v => !v.isExpired && !v.isExpiring).length
  }

  return (
    <Modal
      title={
        <span className='vps-dash-title'>
          <ThunderboltOutlined style={{ color: '#00f5ff' }} className='mg1r' />
          <span style={{ letterSpacing: 2 }}>VPS 作战看板</span>
        </span>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
      className='vps-dashboard-modal'
      destroyOnClose
    >
      {/* 顶部统计条 */}
      <div className='vps-stats-strip'>
        <div className='stat-item'>
          <span className='stat-num c-total'>{stats.total}</span>
          <span className='stat-label'>总台数</span>
        </div>
        <div className='stat-item'>
          <span className='stat-num c-good'>{stats.healthy}</span>
          <span className='stat-label'>正常</span>
        </div>
        {stats.expiring > 0 && (
          <div className='stat-item'>
            <span className='stat-num c-warn'>{stats.expiring}</span>
            <span className='stat-label'>即将到期</span>
          </div>
        )}
        {stats.expired > 0 && (
          <div className='stat-item'>
            <span className='stat-num c-bad'>{stats.expired}</span>
            <span className='stat-label'>已过期</span>
          </div>
        )}
      </div>

      {vpsList.length === 0 ? (
        <div className='vps-empty'>
          <Empty description='暂无 VPS 数据，请在书签编辑中填写 VPS 详情字段' />
        </div>
      ) : (
        <div className='vps-card-grid'>
          {vpsList.map(vps => (
            <div
              key={vps.id}
              className={`vps-card ${vps.isExpired ? 'expired' : vps.isExpiring ? 'expiring' : 'normal'}`}
            >
              {/* 卡片头部：主机 + 管理面板链接 */}
              <div className='vps-card-header'>
                <span className='vps-host'>{vps.host || '未设主机'}</span>
                {vps.vpsUrl && (
                  <Tooltip title='打开管理面板'>
                    <LinkOutlined
                      className='vps-card-link'
                      onClick={() => window.openLink(vps.vpsUrl, '_blank')}
                    />
                  </Tooltip>
                )}
              </div>
              <div className='vps-card-name' title={vps.name}>{vps.name}</div>

              {/* 到期倒计时 */}
              <div className='vps-card-expiry'>
                {vps.expiryDays !== null ? (
                  <ExpiryBadge days={vps.expiryDays} isExpired={vps.isExpired} />
                ) : (
                  <span className='vps-no-expiry'>未设到期</span>
                )}
              </div>

              {/* 信息行 */}
              <div className='vps-card-info'>
                {vps.vpsPrice && (
                  <span className='vps-info-item'><DollarOutlined /> {vps.vpsPrice}</span>
                )}
                {vps.vpsTraffic && (
                  <span className='vps-info-item'><CloudOutlined /> {vps.vpsTraffic}</span>
                )}
              </div>
              {vps.vpsRecharge && (
                <div className='vps-card-recharge'>
                  <ClockCircleOutlined /> {vps.vpsRecharge}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
