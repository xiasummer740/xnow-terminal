/**
 * AI Panel - 右侧停靠面板，取代 AIFloatWindow
 */
import { useCallback } from 'react'
import { auto } from 'manate/react'
import { CloseOutlined } from '@ant-design/icons'
import AIChat from './ai-chat'
import getBrand from './get-brand'

export default auto(function AIPanel (props) {
  const { store } = props

  const handleClose = useCallback(() => {
    store.rightPanelAIVisible = false
    store.innerWidth = window.innerWidth - store.rightPanelAIWidth
    window.pre.runGlobalAsync('resizeWindow', {
      width: window.outerWidth - store.rightPanelAIWidth,
      height: window.outerHeight
    })
  }, [store])

  const modelName = store.config.modelAI
  const brandName = getBrand(store.config.baseURLAI).brand
  const title = modelName || brandName || 'AI Assistant'

  const aiChatProps = {
    aiChatHistory: store.aiChatHistory,
    config: store.config,
    selectedTabIds: store.batchInputSelectedTabIds,
    tabs: store.getTabs(),
    activeTabId: store.activeTabId,
    showAIConfig: store.showAIConfig,
    isFloatWindow: false,
    rightPanelTab: 'ai'
  }

  return (
    <div className='right-panel right-panel-ai'>
      <div className='right-panel-titlebar app-drag'>
        <span className='right-panel-title' title={title}>{title}</span>
        <div className='right-panel-controls'>
          <CloseOutlined className='right-panel-close-btn' onClick={handleClose} title='关闭' />
        </div>
      </div>
      <div className='right-panel-content'>
        <AIChat {...aiChatProps} />
      </div>
    </div>
  )
})
