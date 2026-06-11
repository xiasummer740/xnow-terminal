import { useState, useEffect } from 'react'
import { Modal, Tag, Button, Space } from 'antd'
import {
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import {
  installSkill,
  rejectDraft
} from '../../common/skill-manager'
import message from '../common/message'

export default function SkillDiscoveryNotification () {
  const [draft, setDraft] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const check = () => {
      const show = !!window.store?.showSkillDiscovery
      if (show && window.store?.pendingSkillDraft) {
        setDraft(window.store.pendingSkillDraft)
        setVisible(true)
      }
    }
    const timer = setInterval(check, 300)
    check()
    return () => clearInterval(timer)
  }, [])

  function handleClose () {
    setVisible(false)
    setDraft(null)
    if (window.store) {
      window.store.clearPendingDraft()
    }
  }

  function handleInstall () {
    if (!draft) return
    const result = installSkill(draft)
    if (result.success) {
      message.success(`「${draft.name}」已加入技能库！可以在技能商店的「已安装」中找到`)
      // 移除草案数据
      rejectDraft(draft.id)
    } else {
      message.error(result.error || '安装失败')
    }
    handleClose()
  }

  function handleLater () {
    // 草案保留在待审核列表
    message.info(`「${draft?.name}」已保存到待审核列表，可在技能商店中查看`)
    handleClose()
  }

  function handleIgnore () {
    if (draft) {
      rejectDraft(draft.id)
    }
    handleClose()
  }

  const categoryColors = {
    '运维工具': 'blue',
    '监控工具': 'cyan',
    '部署工具': 'geekblue',
    '安全工具': 'red',
    'AI工具': 'purple'
  }

  return (
    <Modal
      open={visible}
      onCancel={handleLater}
      footer={null}
      width={420}
      centered
      closable={false}
      maskClosable={false}
      className='skill-discovery-modal'
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <BulbOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 12 }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>
          🧠 AI 学会了一个新技能！
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
          AI 在完成任务时发现了一个可复用的操作模式
        </div>

        {draft && (
          <>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.95)', marginBottom: 8 }}>
              {draft.name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <Tag color={categoryColors[draft.category] || 'default'}>{draft.category}</Tag>
              <Tag color='warning'>⚠️ AI 生成，未经验证</Tag>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.6 }}>
              {draft.description}
            </div>
          </>
        )}

        <Space size={12}>
          <Button
            type='primary'
            icon={<CheckCircleOutlined />}
            onClick={handleInstall}
            size='large'
          >
            ✓ 加入技能库
          </Button>
          <Button
            icon={<ClockCircleOutlined />}
            onClick={handleLater}
            size='large'
          >
            📋 看看再说
          </Button>
          <Button
            icon={<CloseCircleOutlined />}
            onClick={handleIgnore}
            size='large'
            danger
          >
            ✗ 忽略
          </Button>
        </Space>
      </div>
    </Modal>
  )
}
