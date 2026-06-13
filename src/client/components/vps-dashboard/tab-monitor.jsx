/**
 * 实时监控页签 — 占位组件
 * 后续将集成三种视图（表格/卡片/详情）
 */
import { Empty, Button } from 'antd'
import { SettingOutlined } from '@ant-design/icons'

export default function TabMonitor ({ onClose }) {
  const { store } = window
  const nezhaCfg = store.config?.nezha || {}

  if (!nezhaCfg.dashboardUrl || !nezhaCfg.apiToken) {
    return (
      <Empty
        style={{ padding: 60 }}
        description={
          <span>
            尚未配置 XNOW 监控，请先在
            <a onClick={() => store.openSetting()} style={{ cursor: 'pointer', color: '#1890ff' }}> 设置 → XNOW 监控 </a>
            中配置 Dashboard 地址
          </span>
        }
      >
        <Button type='primary' icon={<SettingOutlined />} onClick={() => store.openSetting()}>
          去配置
        </Button>
      </Empty>
    )
  }

  return (
    <Empty
      style={{ padding: 60 }}
      description='暂无监控数据，请部署 Agent 后刷新'
    />
  )
}
