# AI 浮层窗口实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 AI 对话从 RightSidePanel 中剥离，改为独立浮层窗口（position: fixed, z-index: 1000+），支持拖拽、缩放、记住位置。

**Architecture:** 新增 `AIFloatWindow` 组件包裹 `AIChat`，提供浮窗外壳（标题栏 + 拖拽手柄 + 缩放手柄 + 关闭按钮）。AIChat 不再依赖 RightSidePanel，直接在 `main.jsx` 顶层渲染。位置/尺寸存入 localStorage，刷新后恢复。

**Tech Stack:** React, Stylus, manate (状态管理), localStorage

**涉及文件:**
- 新建: `src/client/components/ai/ai-float-window.jsx`
- 修改: `src/client/components/ai/ai-chat.jsx`
- 修改: `src/client/components/ai/ai-chat-entry.jsx`
- 修改: `src/client/components/ai/ai.styl`
- 修改: `src/client/components/main/main.jsx`
- 修改: `src/client/store/init-state.js`
- 修改: `src/client/store/common.js`
- 修改: `src/client/store/store.js`
- 修改: `src/client/components/side-panel-r/side-panel-r.jsx`

---

### Task 1: 添加浮窗状态到 Store

**Files:**
- Modify: `src/client/store/init-state.js`
- Modify: `src/client/store/store.js`
- Modify: `src/client/store/common.js`

- [ ] **Step 1.1: init-state.js — 添加浮窗初始状态**

在 `src/client/store/init-state.js` 的 `showSkillStoreModal` 附近添加：

```js
    // AI float window state
    aiFloatVisible: false,
    aiFloatPositionX: 100,
    aiFloatPositionY: 100,
    aiFloatWidth: 520,
    aiFloatHeight: 600,
```

位置值从 localStorage 读取（如果有保存的话）：

```js
    aiFloatVisible: false,
    aiFloatPositionX: parseInt(ls.getItem('aiFloatPositionX'), 10) || 100,
    aiFloatPositionY: parseInt(ls.getItem('aiFloatPositionY'), 10) || 100,
    aiFloatWidth: parseInt(ls.getItem('aiFloatWidth'), 10) || 520,
    aiFloatHeight: parseInt(ls.getItem('aiFloatHeight'), 10) || 600,
```

需要确认 `ls` 在文件顶部已导入（`import ls from '../../common/safe-local-storage'` 或类似）。如果已经导入了就直接用。

- [ ] **Step 1.2: store.js — 添加浮窗 getter**

在 `src/client/store/store.js` 中，找到 `rightPanelTitle` getter 附近，验证 `rightPanelTitle` 中的 AI 相关逻辑是否还需要（AI 浮窗不再依赖 rightPanelTab，但 RightSidePanel 仍需用于 TerminalInfo，所以保持不变）。

- [ ] **Step 1.3: common.js — 修改 `handleOpenAIPanel`**

将 `handleOpenAIPanel` 改为切换浮窗显隐：

```js
Store.prototype.handleOpenAIPanel = function () {
  const { store } = window
  store.aiFloatVisible = !store.aiFloatVisible
}
```

保留 `explainWithAi` 方法，改为打开浮窗：

```js
Store.prototype.explainWithAi = function (txt) {
  const { store } = window
  store.aiFloatVisible = true
  setTimeout(() => {
    refsStatic.get('AIChat')?.setPrompt(`explain terminal output: ${txt}`)
  }, 500)
  setTimeout(() => {
    refsStatic.get('AIChat')?.handleSubmit()
  }, 1200)
}
```

- [ ] **Step 1.4: common.js — 添加浮窗位置/尺寸持久化方法**

```js
Store.prototype.saveAIFloatPosition = function (x, y) {
  const { store } = window
  store.aiFloatPositionX = x
  store.aiFloatPositionY = y
  ls.setItem('aiFloatPositionX', String(x))
  ls.setItem('aiFloatPositionY', String(y))
}

Store.prototype.saveAIFloatSize = function (w, h) {
  const { store } = window
  store.aiFloatWidth = w
  store.aiFloatHeight = h
  ls.setItem('aiFloatWidth', String(w))
  ls.setItem('aiFloatHeight', String(h))
}
```

---

### Task 2: 创建 AIFloatWindow 浮层组件

**Files:**
- Create: `src/client/components/ai/ai-float-window.jsx`

- [ ] **Step 2.1: 编写 AIFloatWindow.jsx**

```jsx
import { useState, useCallback, useEffect, useRef } from 'react'
import { CloseOutlined, MinusOutlined } from '@ant-design/icons'
import AIChat from './ai-chat'

const MIN_WIDTH = 380
const MIN_HEIGHT = 400
const DEFAULT_WIDTH = 520
const DEFAULT_HEIGHT = 600

export default function AIFloatWindow (props) {
  const { store } = props
  const windowRef = useRef(null)
  const [position, setPosition] = useState({
    x: store.aiFloatPositionX,
    y: store.aiFloatPositionY
  })
  const [size, setSize] = useState({
    width: store.aiFloatWidth || DEFAULT_WIDTH,
    height: store.aiFloatHeight || DEFAULT_HEIGHT
  })
  const [dragging, setDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const dragStart = useRef({ x: 0, y: 0, posX: 0, posY: 0 })
  const resizeStart = useRef({ x: 0, y: 0, w: 0, h: 0 })

  // ── 拖拽 ──
  const handleDragStart = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
    dragStart.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y
    }
  }, [position])

  const handleDragMove = useCallback((e) => {
    if (!dragging) return
    const dx = e.clientX - dragStart.current.x
    const dy = e.clientY - dragStart.current.y
    const newX = Math.max(0, dragStart.current.posX + dx)
    const newY = Math.max(0, dragStart.current.posY + dy)
    setPosition({ x: newX, y: newY })
  }, [dragging])

  const handleDragEnd = useCallback(() => {
    if (dragging) {
      setDragging(false)
      store.saveAIFloatPosition(position.x, position.y)
    }
  }, [dragging, position, store])

  // ── 缩放 ──
  const handleResizeStart = useCallback((e) => {
    e.preventDefault()
    e.stopPropagation()
    setResizing(true)
    resizeStart.current = {
      x: e.clientX,
      y: e.clientY,
      w: size.width,
      h: size.height
    }
  }, [size])

  const handleResizeMove = useCallback((e) => {
    if (!resizing) return
    const dw = e.clientX - resizeStart.current.x
    const dh = e.clientY - resizeStart.current.y
    const newW = Math.max(MIN_WIDTH, resizeStart.current.w + dw)
    const newH = Math.max(MIN_HEIGHT, resizeStart.current.h + dh)
    setSize({ width: newW, height: newH })
  }, [resizing])

  const handleResizeEnd = useCallback(() => {
    if (resizing) {
      setResizing(false)
      store.saveAIFloatSize(size.width, size.height)
    }
  }, [resizing, size, store])

  // ── 全局事件监听 ──
  useEffect(() => {
    if (dragging) {
      window.addEventListener('mousemove', handleDragMove)
      window.addEventListener('mouseup', handleDragEnd)
      return () => {
        window.removeEventListener('mousemove', handleDragMove)
        window.removeEventListener('mouseup', handleDragEnd)
      }
    }
  }, [dragging, handleDragMove, handleDragEnd])

  useEffect(() => {
    if (resizing) {
      window.addEventListener('mousemove', handleResizeMove)
      window.addEventListener('mouseup', handleResizeEnd)
      return () => {
        window.removeEventListener('mousemove', handleResizeMove)
        window.removeEventListener('mouseup', handleResizeEnd)
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
    // 浮窗模式标记：让 AIChat 知道它在浮窗中
    isFloatWindow: true
  }

  return (
    <div
      className='ai-float-window'
      ref={windowRef}
      style={{
        left: position.x + 'px',
        top: position.y + 'px',
        width: size.width + 'px',
        height: size.height + 'px'
      }}
    >
      {/* 标题栏（拖拽手柄） */}
      <div
        className='ai-float-titlebar'
        onMouseDown={handleDragStart}
      >
        <span className='ai-float-title'>AI Assistant</span>
        <div className='ai-float-controls'>
          <CloseOutlined
            className='ai-float-close-btn'
            onClick={handleClose}
            title='Close'
          />
        </div>
      </div>

      {/* 内容区域 */}
      <div className='ai-float-content'>
        <AIChat {...aiChatProps} />
      </div>

      {/* 缩放手柄 */}
      <div
        className='ai-float-resize-handle'
        onMouseDown={handleResizeStart}
      />
    </div>
  )
}
```

---

### Task 3: 改造 AIChat 组件适配浮窗

**Files:**
- Modify: `src/client/components/ai/ai-chat.jsx`
- Modify: `src/client/components/ai/ai-chat-entry.jsx`

- [ ] **Step 3.1: ai-chat.jsx — 移除对 rightPanelTab 的依赖**

当前 `ai-chat.jsx:134`：
```jsx
if (props.rightPanelTab !== 'ai') {
  return null
}
```

改为：
```jsx
// 在浮窗模式下始终显示；在旧版 RightSidePanel 模式下检查 tab
if (!props.isFloatWindow && props.rightPanelTab !== 'ai') {
  return null
}
```

同时移除 useEffect 中对 `props.rightPanelTab === 'ai'` 的判断（或者加 `props.isFloatWindow` 条件），避免在浮窗中首次挂载时弹出 AI 配置弹窗：

```jsx
useEffect(() => {
  refsStatic.add('AIChat', {
    setPrompt,
    handleSubmit
  })
  // 只在非浮窗模式下检查 AI 配置
  if (!props.isFloatWindow && props.rightPanelTab === 'ai' && window.store.aiConfigMissing()) {
    window.store.toggleAIConfig()
  }
  return () => {
    refsStatic.remove('AIChat')
  }
}, [handleSubmit])
```

- [ ] **Step 3.2: ai-chat-entry.jsx — 透传 isFloatWindow prop**

```jsx
import { lazy, Suspense } from 'react'

const AIChat = lazy(() => import('./ai-chat'))

export default function AIChatEntry (props) {
  return (
    <Suspense fallback={null}>
      <AIChat {...props} />
    </Suspense>
  )
}
```

不需要修改，prop 会自动透传。

---

### Task 4: 更新 main.jsx 布局

**Files:**
- Modify: `src/client/components/main/main.jsx`

- [ ] **Step 4.1: main.jsx — 将 AIChat 移出 RightSidePanel**

改动前：
```jsx
import AIChat from '../ai/ai-chat-entry'
// ...
<RightSidePanel {...rightPanelProps}>
  <AIChat {...aiChatProps} />
  <TerminalInfo key={store.activeTabId} {...terminalInfoProps} />
</RightSidePanel>
```

改动后：
```jsx
import AIChat from '../ai/ai-chat-entry'
import AIFloatWindow from '../ai/ai-float-window'
// ...
{/* AI 浮层窗口 — 独立渲染，不在任何容器内 */}
<AIFloatWindow store={store} />

<RightSidePanel {...rightPanelProps}>
  <TerminalInfo key={store.activeTabId} {...terminalInfoProps} />
</RightSidePanel>
```

同时更新 `aiChatProps`——如果 AIChat 不再在 RightSidePanel 内渲染，`aiChatProps` 传给 `AIFloatWindow`（由它传给内部 AIChat）。但上面的设计中，AIFloatWindow 直接从 store 取数据，所以 `aiChatProps` 变量可以移除或简化。

实际上为了让改动最小，让 AIFloatWindow 内部组合 AIChat 时自己构建 props。这样 main.jsx 改动最小。

移除原来的 `aiChatProps` 变量声明（第238-246行）。

---

### Task 5: 更新 RightSidePanel

**Files:**
- Modify: `src/client/components/side-panel-r/side-panel-r.jsx`

- [ ] **Step 5.1: side-panel-r.jsx — 移除 AIChat 相关内容**

当前 `side-panel-r.jsx:30-32`：
```jsx
const tag = rightPanelTab === 'ai'
  ? <Tag className='mg1r'>AI</Tag>
  : <InfoCircleOutlined className='mg1r' />
```

去掉 AI tag，统一使用 Info icon：
```jsx
const tag = <InfoCircleOutlined className='mg1r' />
```

这样 RightSidePanel 不再是 AI 聊天的容器，仅用于 TerminalInfo。

---

### Task 6: 浮层窗口样式

**Files:**
- Modify: `src/client/components/ai/ai.styl`

- [ ] **Step 6.1: ai.styl — 添加浮层窗口样式**

在文件末尾添加：

```styl
// ── AI Float Window ──
.ai-float-window
  position fixed
  z-index 1000
  background var(--main)
  border 1px solid var(--main-darker)
  border-radius 8px
  box-shadow 0 8px 32px rgba(0, 0, 0, 0.3)
  display flex
  flex-direction column
  overflow hidden
  min-width 380px
  min-height 400px

.ai-float-titlebar
  display flex
  align-items center
  justify-content space-between
  padding 0 12px
  height 36px
  background var(--main-dark)
  border-bottom 1px solid var(--main-darker)
  cursor move
  user-select none
  flex-shrink 0

.ai-float-title
  font-size 13px
  font-weight 500
  color var(--text)

.ai-float-controls
  display flex
  gap 8px

.ai-float-close-btn
  font-size 14px
  color var(--text)
  cursor pointer
  padding 4px
  border-radius 4px
  &:hover
    background var(--main-darker)
    color #ff4d4f

.ai-float-content
  flex 1
  overflow hidden
  display flex
  flex-direction column
  .ai-chat-container
    height 100%

.ai-float-resize-handle
  position absolute
  right 0
  bottom 0
  width 16px
  height 16px
  cursor nwse-resize
  background linear-gradient(135deg, transparent 50%, var(--text-color-2) 50%)
  border-radius 0 0 8px 0
  opacity 0.5
  &:hover
    opacity 1
```

---

### Task 7: 更新 footer-entry.jsx 中的 AI 按钮

**Files:**
- Read: `src/client/components/footer/footer-entry.jsx`

- [ ] **Step 7.1: 确认 footer-entry.jsx 无需修改**

检查 `footer-entry.jsx:83` 的 `onClick={window.store.handleOpenAIPanel}`——不需要改，因为 `handleOpenAIPanel` 已经在 Task 1.3 中改为切换 `aiFloatVisible`。

---

### Task 8: 处理快捷键

**Files:**
- Read: `src/client/components/shortcuts/shortcut-control.jsx`

- [ ] **Step 8.1: 确认快捷键兼容**

`shortcut-control.jsx:49-66` 中的 `handleAiChat` 只处理 Ctrl+Enter 提交消息，不涉及打开面板逻辑，无需修改。

---

### Task 9: end-to-end 验证

- [ ] **Step 9.1: 确保构建通过**

```bash
cd F:/summer/vs-code/xnow-terminal && npm run build
```

预期输出：无报错，build 成功。

- [ ] **Step 9.2: 启动应用验证**

```bash
cd F:/summer/vs-code/xnow-terminal && npm run dev
```

验证清单：
1. 点击底部 AI 图标 → 浮窗出现（不是右侧面板）
2. 浮窗在终端窗口之上，不被遮挡
3. 拖拽标题栏 → 浮窗跟随移动，释放后位置固定
4. 拖拽右下角缩放手柄 → 浮窗尺寸变化
5. 点击关闭按钮 → 浮窗消失
6. 再次点击 AI 图标 → 浮窗重现，位置/尺寸与关闭前一致
7. 拖动浮窗到边缘 → 不会移出屏幕
8. RightSidePanel 仍然正常工作（TerminalInfo 选项卡正常）
9. 刷新页面 → 浮窗位置/尺寸恢复上次保存值
10. 发送 AI 消息正常

- [ ] **Step 9.3: Commit**

```bash
git add src/client/components/ai/ai-float-window.jsx \
        src/client/components/ai/ai-chat.jsx \
        src/client/components/ai/ai.styl \
        src/client/components/main/main.jsx \
        src/client/store/init-state.js \
        src/client/store/common.js \
        src/client/components/side-panel-r/side-panel-r.jsx
git commit -m "feat: AI 对话改为独立浮层窗口

- 新增 AIFloatWindow 浮层组件 (position:fixed, z-index:1000)
- AIChat 从 RightSidePanel 剥离，独立渲染
- 支持拖拽移动、缩放尺寸
- 位置/尺寸持久化到 localStorage
- 不影响现有 RightSidePanel 的 TerminalInfo"

```
