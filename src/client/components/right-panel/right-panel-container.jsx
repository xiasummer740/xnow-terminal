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
import tl from '../../common/timeline'
import './right-panel-container.styl'

export default auto(function RightPanelContainer (props) {
  const { store } = props
  const containerRef = useRef(null)
  const aiPanelRef = useRef(null)
  const vpsPanelRef = useRef(null)

  // 拖拽中适配终端：用 rAF 确保在 React 提交 DOM 后执行
  const rafQueued = useRef(false)
  const fitTerminals = useCallback(() => {
    for (const [key, termRef] of window.refs) {
      if (key.startsWith('term-') && termRef?.fitAddon) {
        try {
          termRef.fitAddon.fit()
        } catch (_) {}
      }
    }
  }, [])

  const fitTerminalsAfterRender = useCallback(() => {
    if (!rafQueued.current) {
      rafQueued.current = true
      requestAnimationFrame(() => {
        rafQueued.current = false
        fitTerminals()
      })
    }
  }, [fitTerminals])

  // ── AI 面板拖拽调宽 ──
  const aiResizing = useRef(false)
  const aiStartX = useRef(0)
  const aiStartW = useRef(0)

  const handleAIResizeStart = useCallback(
    (e) => {
      e.preventDefault()
      aiResizing.current = true
      aiStartX.current = e.clientX
      aiStartW.current = store.rightPanelAIWidth
    },
    [store]
  )

  const handleAIResizeMove = useCallback(
    (e) => {
      if (!aiResizing.current) return
      const dx = e.clientX - aiStartX.current
      const newW = Math.max(300, Math.min(1000, aiStartW.current - dx))
      if (aiPanelRef.current) {
        aiPanelRef.current.style.width = newW + 'px'
      }
      // 面板变宽 → 终端自动挤窄（布局扣除 rightTotal）
      // 更新 store → auto() 触发 Layout 重渲染 → 终端容器宽度变化
      // 用 rAF 确保 fitTerminals 在 React 提交 DOM 后执行，避免拿到旧尺寸
      store.rightPanelAIWidth = newW
      store.triggerResize()
      fitTerminalsAfterRender()
    },
    [store, fitTerminalsAfterRender]
  )

  const handleAIResizeEnd = useCallback(() => {
    if (aiResizing.current) {
      aiResizing.current = false
      const w = aiPanelRef.current
        ? parseInt(aiPanelRef.current.style.width)
        : store.rightPanelAIWidth
      const delta = w - aiStartW.current
      store.setRightPanelAIWidth(w)
      if (delta !== 0) {
        // 拖拽结束，扩展窗口匹配面板宽度
        window.pre.runGlobalAsync('resizeWindow', {
          width: window.outerWidth + delta,
          height: window.outerHeight
        })
      }
      tl('AI面板', `resize 结束 width=${w} delta=${delta}`)
    }
  }, [store])

  // ── VPS 面板拖拽调宽 ──
  const vpsResizing = useRef(false)
  const vpsStartX = useRef(0)
  const vpsStartW = useRef(0)

  const handleVPSResizeStart = useCallback(
    (e) => {
      e.preventDefault()
      vpsResizing.current = true
      vpsStartX.current = e.clientX
      vpsStartW.current = store.rightPanelVPSWidth
    },
    [store]
  )

  const handleVPSResizeMove = useCallback(
    (e) => {
      if (!vpsResizing.current) return
      const dx = e.clientX - vpsStartX.current
      const newW = Math.max(280, Math.min(800, vpsStartW.current - dx))
      if (vpsPanelRef.current) {
        vpsPanelRef.current.style.width = newW + 'px'
      }
      // 面板变宽 → 终端自动挤窄（布局扣除 rightTotal）
      store.rightPanelVPSWidth = newW
      store.triggerResize()
      fitTerminalsAfterRender()
    },
    [store, fitTerminalsAfterRender]
  )

  const handleVPSResizeEnd = useCallback(() => {
    if (vpsResizing.current) {
      vpsResizing.current = false
      const w = vpsPanelRef.current
        ? parseInt(vpsPanelRef.current.style.width)
        : store.rightPanelVPSWidth
      const delta = w - vpsStartW.current
      store.setRightPanelVPSWidth(w)
      if (delta !== 0) {
        // 拖拽结束，扩展窗口匹配面板宽度
        window.pre.runGlobalAsync('resizeWindow', {
          width: window.outerWidth + delta,
          height: window.outerHeight
        })
      }
      tl('VPS面板', `resize 结束 width=${w} delta=${delta}`)
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

  // ── VPS 可见性：使用 store 计算属性 ──
  const _vpsVisible = store.rightPanelVPSVisible
  const _aiVisible = store.rightPanelAIVisible

  // 窗口大小同步（resizeWindow IPC + innerWidth 预调整）
  const _prevV = useRef(_vpsVisible)
  useEffect(() => {
    if (_vpsVisible !== _prevV.current) {
      _prevV.current = _vpsVisible
      const delta = _vpsVisible ? store.rightPanelVPSWidth : -store.rightPanelVPSWidth
      store.innerWidth = window.innerWidth + delta
      window.pre.runGlobalAsync('resizeWindow', {
        width: window.outerWidth + delta,
        height: window.outerHeight
      })
    }
  }, [_vpsVisible])

  const rightTotalWidth =
    (_vpsVisible ? store.rightPanelVPSWidth : 0) + (_aiVisible ? store.rightPanelAIWidth : 0)
  const topDragStyle =
    _vpsVisible || _aiVisible
      ? {
          position: 'absolute',
          top: -36,
          right: 0,
          width: rightTotalWidth,
          height: 36,
          WebkitAppRegion: 'drag',
          zIndex: 300
        }
      : {}

  return (
    <div
      className='right-panel-overlay-container'
      ref={containerRef}
      style={{ display: _aiVisible || _vpsVisible ? 'flex' : 'none' }}
    >
      {/* 面板上方拖条 */}
      <div style={topDragStyle} />
      {/* VPS 面板 */}
      {_vpsVisible && (
        <>
          <div className='rp-drag-handle' onMouseDown={handleVPSResizeStart} />
          <div
            className='rp-panel rp-panel-vps'
            ref={vpsPanelRef}
            style={{ width: store.rightPanelVPSWidth + 'px' }}
          >
            <VpsPanel store={store} />
          </div>
        </>
      )}

      {/* AI 面板 */}
      {_aiVisible && (
        <>
          <div className='rp-drag-handle' onMouseDown={handleAIResizeStart} />
          <div
            className='rp-panel rp-panel-ai'
            ref={aiPanelRef}
            style={{ width: store.rightPanelAIWidth + 'px' }}
          >
            <AIPanel store={store} />
          </div>
        </>
      )}
    </div>
  )
})
