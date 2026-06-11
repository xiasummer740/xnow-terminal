import { useState, useEffect } from 'react'
import Modal from '../common/modal'
import SkillStore from './skill-store'

export default function SkillStoreModal () {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    // 轮询检测 store 状态变化
    const check = () => {
      setVisible(!!window.store?.showSkillStoreModal)
    }
    const timer = setInterval(check, 200)
    check()
    return () => clearInterval(timer)
  }, [])

  function handleClose () {
    window.store.showSkillStoreModal = false
  }

  return (
    <Modal
      open={visible}
      onCancel={handleClose}
      footer={null}
      title='📦 技能商店'
      width='80%'
      className='skill-store-modal'
    >
      <SkillStore />
    </Modal>
  )
}
