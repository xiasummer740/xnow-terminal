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

// 延迟数据模拟（可后续接入真实 ping）
const REGIONS = {
  JP: { name: '日本', flag: '🇯🇵', color: '#f5222d' },
  HK: { name: '香港', flag: '🇭🇰', color: '#fa8c16' },
  US: { name: '美国', flag: '🇺🇸', color: '#1890ff' },
  SG: { name: '新加坡', flag: '🇸🇬', color: '#722ed1' },
  KR: { name: '韩国', flag: '🇰🇷', color: '#eb2f96' },
  DE: { name: '德国', flag: '🇩🇪', color: '#13c2c2' },
  CN: { name: '中国', flag: '🇨🇳', color: '#52c41a' },
  OTHER: { name: '其他', flag: '🌐', color: '#666' }
}

function detectRegion (host) {
  if (!host) return REGIONS.OTHER
  const h = host.toLowerCase()
  if (h.includes('.jp') || h.includes('jp.')) return REGIONS.JP
  if (h.includes('.hk') || h.includes('hk.')) return REGIONS.HK
  if (h.includes('.us') || h.includes('us.')) return REGIONS.US
  if (h.includes('.sg') || h.includes('sg.')) return REGIONS.SG
  if (h.includes('.kr') || h.includes('kr.')) return REGIONS.KR
  if (h.includes('.de') || h.includes('de.')) return REGIONS.DE
  if (h.includes('.cn') || h.includes('cn.')) return REGIONS.CN
  // 根据 IP 段粗略判断
  if (/^(103|124|126|150|160|180|203|210|211|218|219|220|221|222|223)\./.test(h)) return REGIONS.CN
  if (/^(1|3|4|5|8|13|23|24|34|38|45|47|50|52|54|63|64|66|67|69|70|72|74|76|96|98|104|107|108|128|131|135|136|138|139|140|142|144|146|147|148|149|152|155|156|157|158|159|161|162|166|168|170|172|173|174|175|176|180|183|184|192|198|199|207|208|209|212|216)\./.test(h)) return REGIONS.US
  if (/^(27|42|101|103|106|110|111|112|113|114|115|116|117|118|119|120|121|122|123|124|125|126|128|129|130|132|133|150|153|157|160|163|171|175|180|182|183|202|203|210|211|218|219|220|221|222|223)\./.test(h)) return REGIONS.JP
  return REGIONS.OTHER
}

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
        isExpiring: expiryDays !== null && expiryDays > 0 && expiryDays <= 30,
        region: detectRegion(b.host)
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
      {/* 顶部状态条 */}
      <div className='vps-stats-strip'>
        <div className='stat-item total'>
          <span className='stat-num'>{stats.total}</span>
          <span className='stat-label'>总计</span>
        </div>
        <div className='stat-item healthy'>
          <span className='stat-num'>{stats.healthy}</span>
          <span className='stat-label'>正常</span>
        </div>
        {stats.expiring > 0 && (
          <div className='stat-item warning'>
            <span className='stat-num'>{stats.expiring}</span>
            <span className='stat-label'>即将到期</span>
          </div>
        )}
        {stats.expired > 0 && (
          <div className='stat-item danger'>
            <span className='stat-num'>{stats.expired}</span>
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
              {/* 卡片头部：地区 + 名称 */}
              <div className='vps-card-header'>
                <span className='vps-region' style={{ color: vps.region.color }}>
                  {vps.region.flag} {vps.region.name}
                </span>
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
