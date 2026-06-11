import { auto } from 'manate/react'
import Modal from '../common/modal'
import SkillStore from './skill-store'

export default auto(function SkillStoreModal ({ store }) {
  const { showSkillStoreModal } = store

  function handleClose () {
    window.store.showSkillStoreModal = false
  }

  return (
    <Modal
      open={showSkillStoreModal}
      onCancel={handleClose}
      footer={null}
      title='📦 技能商店'
      width='80%'
      destroyOnClose
      className='skill-store-modal'
    >
      <SkillStore />
    </Modal>
  )
})
