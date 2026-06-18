/**
 * RightPanelContainer - 右侧浮层面板容器
 * 同时管理 AI 面板和 VPS 面板，均为浮层覆盖（不压缩终端宽度）
 * 布局： [VPS 面板] [AI 面板] ← 屏幕右边缘
 * 两个面板可独立拖拽宽度、独立开关
 */
import { useCallback, useRef, useEffect } from 'react'
import { auto } from 'manate/react'
import AIPanel from '../ai/ai-panel'
import VpsPanel from '../vps-panel/vps-panel'
import './right-panel-container.styl'

export default auto(function RightPanelContainer (props) {
  const { store } = props
  const containerRef = useRef(null)
  const aiPanelRef = useRef(null)
  const vpsPanelRef = useRef(null)

  // ── AI 面板拖拽调宽 ──
  const aiResizing = useRef(false)
  const aiStartX = useRef(0)
  const aiStartW = useRef(0)

  const handleAIResizeStart = useCallback((e) => {
    e.preventDefault()
    aiResizing.current = true
    aiStartX.current = e.clientX
    aiStartW.current = store.rightPanelAIWidth
  }, [store])

  const handleAIResizeMove = useCallback((e) => {
    if (!aiResizing.current) return
    const dx = e.clientX - aiStartX.current
    const newW = Math.max(300, Math.min(1000, aiStartW.current - dx))
    if (aiPanelRef.current) {
      aiPanelRef.current.style.width = newW + 'px'
    }
  }, [])

  const handleAIResizeEnd = useCallback(() => {
    if (aiResizing.current) {
      aiResizing.current = false
      const w = aiPanelRef.current ? parseInt(aiPanelRef.current.style.width) : store.rightPanelAIWidth
      store.setRightPanelAIWidth(w)
    }
  }, [store])

  // ── VPS 面板拖拽调宽 ──
  const vpsResizing = useRef(false)
  const vpsStartX = useRef(0)
  const vpsStartW = useRef(0)

  const handleVPSResizeStart = useCallback((e) => {
    e.preventDefault()
    vpsResizing.current = true
    vpsStartX.current = e.clientX
    vpsStartW.current = store.rightPanelVPSWidth
  }, [store])

  const handleVPSResizeMove = useCallback((e) => {
    if (!vpsResizing.current) return
    const dx = e.clientX - vpsStartX.current
    const newW = Math.max(280, Math.min(800, vpsStartW.current - dx))
    if (vpsPanelRef.current) {
      vpsPanelRef.current.style.width = newW + 'px'
    }
  }, [])

  const handleVPSResizeEnd = useCallback(() => {
    if (vpsResizing.current) {
      vpsResizing.current = false
      const w = vpsPanelRef.current ? parseInt(vpsPanelRef.current.style.width) : store.rightPanelVPSWidth
      store.setRightPanelVPSWidth(w)
    }
  }, [store])

  // ── 全局拖拽事件 ──
  useEffect(() => {
    const onMove = (e) => {
      handleAIResizeMove(e)
      handleVPSResizeMove(e)
    }
    const onUp = () => {
      handleAIResizeEnd()
      handleVPSResizeEnd()
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [handleAIResizeMove, handleAIResizeEnd, handleVPSResizeMove, handleVPSResizeEnd])

  // ── VPS 可见性：计算属性 ──
  const _activeTab = store.tabs.find(t => t.id === store.activeTabId)
  const _hasHost = !!(_activeTab && _activeTab.host)
  const _vpsVisible = _hasHost && !store._vpsForceClosed
  const _aiVisible = store.rightPanelAIVisible

  // 切换标签重置手动关闭
  const _prevAid = useRef(store.activeTabId)
  useEffect(() => {
    if (_prevAid.current !== store.activeTabId) {
      _prevAid.current = store.activeTabId
      if (_hasHost && store._vpsForceClosed) store._vpsForceClosed = false
    }
  })

  // 窗口大小同步
  const _prevV = useRef(_vpsVisible)
  useEffect(() => {
    if (_vpsVisible !== _prevV.current) {
      _prevV.current = _vpsVisible
      window.pre.runGlobalAsync('resizeWindow', {
        width: window.outerWidth + (_vpsVisible ? store.rightPanelVPSWidth : -store.rightPanelVPSWidth),
        height: window.outerHeight
      })
    }
  }, [_vpsVisible])

  return (
    <div className='right-panel-overlay-container' ref={containerRef}
      style={{ display: (_aiVisible || _vpsVisible) ? 'flex' : 'none' }}>
      {/* VPS 面板 */}
      {_vpsVisible && (
        <>
          <div className='rp-drag-handle' onMouseDown={handleVPSResizeStart} />
          <div className='rp-panel rp-panel-vps' ref={vpsPanelRef} style={{ width: store.rightPanelVPSWidth + 'px' }}>
            <VpsPanel store={store} />
          </div>
        </>
      )}

      {/* AI 面板 */}
      {_aiVisible && (
        <>
          <div className='rp-drag-handle' onMouseDown={handleAIResizeStart} />
          <div className='rp-panel rp-panel-ai' ref={aiPanelRef} style={{ width: store.rightPanelAIWidth + 'px' }}>
            <AIPanel store={store} />
          </div>
        </>
      )}
    </div>
  )
})
