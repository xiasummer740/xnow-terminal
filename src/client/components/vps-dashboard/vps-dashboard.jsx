/**
 * VPS 监控看板 — 双页签：订阅信息 | 实时监控
 */
import { useState } from 'react'
import { Modal, Tabs } from 'antd'
import {
  ThunderboltOutlined,
  DashboardOutlined
} from '@ant-design/icons'
import VpsDashboardSubscription from './vps-dashboard-subscription'
import TabMonitor from './tab-monitor'

export default function VpsDashboard ({ visible, onClose }) {
  const [activeTab, setActiveTab] = useState('subscription')

  return (
    <Modal
      title={
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          <ThunderboltOutlined style={{ color: '#1890ff', marginRight: 8 }} />
          VPS 看板
        </span>
      }
      open={visible} onCancel={onClose} footer={null}
      width={1024} className='vps-dashboard-modal' destroyOnClose
    >
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        items={[
          {
            key: 'subscription',
            label: <span><ThunderboltOutlined /> 订阅信息</span>,
            children: <VpsDashboardSubscription onClose={onClose} />
          },
          {
            key: 'monitor',
            label: <span><DashboardOutlined /> 实时监控</span>,
            children: <TabMonitor onClose={onClose} />
          }
        ]}
      />
    </Modal>
  )
}
