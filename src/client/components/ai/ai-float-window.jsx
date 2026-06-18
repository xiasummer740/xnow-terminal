import { useState, useCallback, useEffect, useRef } from 'react'
import { CloseOutlined } from '@ant-design/icons'
import AIChat from './ai-chat'

const MIN_WIDTH = 380
const MIN_HEIGHT = 400
const DEFAULT_WIDTH = 520
const DEFAULT_HEIGHT = 600

export default function AIFloatWindow(props) {
  const { store } = props
  const windowRef = useRef(null)
  const [position, setPosition] = useState({
    x: store.aiFloatPositionX || DEFAULT_WIDTH,
    y: store.aiFloatPositionY || 100,
  })
  const [size, setSize] = useState({
    width: store.aiFloatWidth || DEFAULT_WIDTH,
    height: store.aiFloatHeight || DEFAULT_HEIGHT,
  })
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

  // ── 拖拽 ──
  const handleDragStart = useCallback(
    (e) => {
      e.preventDefault()
      setDragging(true)
      dragStart.current = {
        x: e.clientX,
        y: e.clientY,
        posX: position.x,
        posY: position.y,
      }
    },
    [position],
  )

  const handleDragMove = useCallback(
    (e) => {
      if (!dragging) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      const newX = Math.max(0, dragStart.current.posX + dx)
      const newY = Math.max(0, dragStart.current.posY + dy)
      setPosition({ x: newX, y: newY })
    },
    [dragging],
  )

  const handleDragEnd = useCallback(() => {
    if (dragging) {
      setDragging(false)
      store.saveAIFloatPosition(position.x, position.y)
    }
  }, [dragging, position, store])

  // ── 缩放 ──
  const handleResizeStart = useCallback(
    (e) => {
      e.preventDefault()
      e.stopPropagation()
      setResizing(true)
      resizeStart.current = {
        x: e.clientX,
        y: e.clientY,
        w: size.width,
        h: size.height,
      }
    },
    [size],
  )

  const handleResizeMove = useCallback(
    (e) => {
      if (!resizing) return
      const dw = e.clientX - resizeStart.current.x
      const dh = e.clientY - resizeStart.current.y
      const newW = Math.max(MIN_WIDTH, resizeStart.current.w + dw)
      const newH = Math.max(MIN_HEIGHT, resizeStart.current.h + dh)
      setSize({ width: newW, height: newH })
    },
    [resizing],
  )

  const handleResizeEnd = useCallback(() => {
    if (resizing) {
      setResizing(false)
      store.saveAIFloatSize(size.width, size.height)
    }
  }, [resizing, size, store])

  // ── 全局事件监听 ──
  useEffect(() => {
    if (dragging) {
      const onMove = (e) => handleDragMove(e)
      const onUp = () => handleDragEnd()
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
    }
  }, [dragging, handleDragMove, handleDragEnd])

  useEffect(() => {
    if (resizing) {
      const onMove = (e) => handleResizeMove(e)
      const onUp = () => handleResizeEnd()
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
      return () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
    }
  }, [resizing, handleResizeMove, handleResizeEnd])

  // ── 关闭 ──
  const handleClose = useCallback(() => {
    store.aiFloatVisible = false
  }, [store])

  // ── 如果不可见，不渲染 ──
  if (!store.aiFloatVisible) {
    return null
  }

  const aiChatProps = {
    aiChatHistory: store.aiChatHistory,
    config: store.config,
    selectedTabIds: store.batchInputSelectedTabIds,
    tabs: store.getTabs(),
    activeTabId: store.activeTabId,
    showAIConfig: store.showAIConfig,
    isFloatWindow: true, // 标记让 AIChat 知道在浮窗中
  }

  return (
    <div
      className="ai-float-window"
      ref={windowRef}
      style={{
        left: position.x + 'px',
        top: position.y + 'px',
        width: size.width + 'px',
        height: size.height + 'px',
      }}
    >
      {/* 标题栏（拖拽手柄） */}
      <div className="ai-float-titlebar" onMouseDown={handleDragStart}>
        <span className="ai-float-title">AI Assistant</span>
        <div className="ai-float-controls">
          <CloseOutlined className="ai-float-close-btn" onClick={handleClose} title="关闭" />
        </div>
      </div>

      {/* 内容区域 */}
      <div className="ai-float-content">
        <AIChat {...aiChatProps} />
      </div>

      {/* 缩放手柄 */}
      <div className="ai-float-resize-handle" onMouseDown={handleResizeStart} />
    </div>
  )
}
