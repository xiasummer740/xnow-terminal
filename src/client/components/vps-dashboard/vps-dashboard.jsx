/**
 * VPS 看板 — 订阅信息
 */
import { Modal } from 'antd'
import {
  ThunderboltOutlined
} from '@ant-design/icons'
import VpsDashboardSubscription from './vps-dashboard-subscription'

export default function VpsDashboard ({ visible, onClose }) {
  return (
    <Modal
      title={
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          <ThunderboltOutlined style={{ color: '#1890ff', marginRight: 8 }} />
          VPS 看板
        </span>
      }
      open={visible} onCancel={onClose} footer={null}
      width={960} className='vps-dashboard-modal' destroyOnHidden
    >
      <VpsDashboardSubscription onClose={onClose} />
    </Modal>
  )
}
