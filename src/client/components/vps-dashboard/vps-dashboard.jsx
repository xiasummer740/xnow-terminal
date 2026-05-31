/**
 * VPS 到期汇总看板 — 一览所有 VPS 信息
 */
import { useState, useMemo } from 'react'
import { Modal, Table, Tag, Empty } from 'antd'
import {
  ClockCircleOutlined,
  WarningOutlined,
  CheckCircleOutlined,
  DollarOutlined,
  CloudOutlined
} from '@ant-design/icons'
import './vps-dashboard.styl'

export default function VpsDashboard ({ store, visible, onClose }) {
  const [sortKey, setSortKey] = useState('expiryDays')

  // 从书签中提取 VPS 信息（每次渲染都重新计算）
  const all = window.store.bookmarks || []
  const vpsList = all
    .filter(b => b.vpsExpiry || b.vpsPrice || b.vpsTraffic || b.vpsUrl)
    .map(b => {
      const expiryDate = b.vpsExpiry ? new Date(b.vpsExpiry) : null
      const expiryDays = expiryDate && !isNaN(expiryDate.getTime())
        ? Math.ceil((expiryDate - Date.now()) / 86400000)
        : null
      const title = b.title || `${b.username || ''}@${b.host || ''}:${b.port || ''}`
      return {
        id: b.id,
        title,
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
      if (sortKey === 'expiryDays') {
        if (a.expiryDays === null) return 1
        if (b.expiryDays === null) return -1
        return a.expiryDays - b.expiryDays
      }
      return 0
    })

  const columns = [
    {
      title: '名称',
      dataIndex: 'title',
      key: 'title',
      width: 180,
      ellipsis: true,
      render: (text, record) => (
        <span>
          {record.vpsUrl
            ? <a onClick={() => { onClose(); window.openLink(record.vpsUrl, '_blank') }}>{text}</a>
            : text}
        </span>
      )
    },
    {
      title: '到期时间',
      dataIndex: 'vpsExpiry',
      key: 'expiry',
      width: 110,
      sorter: true,
      render: (text, record) => {
        if (!text) return <span style={{ color: '#666' }}>--</span>
        if (record.isExpired) return <Tag color='red'>已过期 {Math.abs(record.expiryDays)} 天</Tag>
        if (record.isExpiring) return <Tag color='orange'>{record.expiryDays} 天后</Tag>
        if (record.expiryDays <= 90) return <Tag color='blue'>{record.expiryDays} 天</Tag>
        return <Tag color='green'>{record.expiryDays} 天</Tag>
      }
    },
    {
      title: '价格',
      dataIndex: 'vpsPrice',
      key: 'price',
      width: 110,
      render: text => text || '--'
    },
    {
      title: '流量/带宽',
      dataIndex: 'vpsTraffic',
      key: 'traffic',
      width: 120,
      render: text => text || '--'
    },
    {
      title: '续费/充值',
      dataIndex: 'vpsRecharge',
      key: 'recharge',
      width: 120,
      render: text => text || '--'
    }
  ]

  // 统计
  const stats = useMemo(() => {
    const total = vpsList.length
    const expired = vpsList.filter(v => v.isExpired).length
    const expiring = vpsList.filter(v => v.isExpiring).length
    return { total, expired, expiring }
  }, [vpsList])

  return (
    <Modal
      title={
        <span>
          <CloudOutlined className='mg1r' />VPS 汇总看板
        </span>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={800}
      className='vps-dashboard-modal'
      destroyOnClose
    >
      {/* 统计条 */}
      <div className='vps-stats-bar'>
        <span className='mg2r'>共 <b>{stats.total}</b> 台</span>
        {stats.expired > 0 && (
          <Tag color='red' icon={<WarningOutlined />}>{stats.expired} 台已过期</Tag>
        )}
        {stats.expiring > 0 && (
          <Tag color='orange' icon={<ClockCircleOutlined />}>{stats.expiring} 台即将到期</Tag>
        )}
        {stats.expired === 0 && stats.expiring === 0 && stats.total > 0 && (
          <Tag color='green' icon={<CheckCircleOutlined />}>全部正常</Tag>
        )}
        {stats.total === 0 && (
          <Empty description='暂无 VPS 信息，请在书签中填写 VPS 详情' />
        )}
      </div>

      {vpsList.length > 0 && (
        <Table
          columns={columns}
          dataSource={vpsList}
          rowKey='id'
          size='small'
          pagination={false}
          onChange={(_, __, sorter) => {
            if (sorter.key === 'expiry') setSortKey('expiryDays')
          }}
          rowClassName={(record) => {
            if (record.isExpired) return 'vps-row-expired'
            if (record.isExpiring) return 'vps-row-expiring'
            return ''
          }}
          scroll={{ y: 400 }}
        />
      )}
    </Modal>
  )
}
