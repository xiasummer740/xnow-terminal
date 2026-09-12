# xnow-terminal — 领域语言与架构上下文

> 这份文档帮助代理（Claude）和开发者（祥哥）用同一套语言沟通，减少歧义和啰嗦的描述。

---

## 核心概念

### 标签 / Tab
一个终端连接的实例。每个 Tab 包含连接信息（host、port、type）、状态（processing/connected/error）、挂载的终端实例等。
_Avoid_: 会话、窗口、页面

### 书签 / Bookmark
预配置的连接凭证，用于快速建立 SSH/RDP/VNC/Telnet/Serial/FTP/Web/Spice 等连接。书签可以分组、归类，包含 VPS 扩展字段（到期时间、价格、流量等）。
_Avoid_: 服务器、连接配置

### 终端 / Terminal
渲染在 Tab 内的 xterm.js 实例，负责处理终端 I/O、渲染、复制粘贴等。
_Avoid_: 控制台、命令行界面

### 布局 / Layout
标签页的排列方式。支持 `c1`（单栏）、`c2`（两列）、`c3`（三列）、`r2`（两行）、`r3`（三行）、`c2x2`（田字格）、`c1r2`（左一右二）、`r1c2`（上一行两列）。

### AI 面板 / AI Panel
右侧停靠面板，提供 AI 聊天功能。标题显示当前 AI 模型名（如 `deepseek-reasoner`）。使用 `store.rightPanelAIVisible` 控制显示。**浮层覆盖，不压缩终端宽度**。

### VPS 面板 / VPS Panel
右侧停靠面板，显示当前连接的服务器信息（延迟、ping、CPU、内存、磁盘、路由检测等）。使用**计算属性**决定显示：当 `activeTabId` 指向一个有 `host` 的标签时自动弹出。使用 `store._vpsForceClosed` 标记手动关闭。
_Avoid_: 信息面板、系统面板

### 右侧面板系统 / Right Panel System
管理 AI 面板和 VPS 面板的容器组件（`RightPanelContainer`）。使用 `position: fixed; right: 0`，**不压缩终端宽度**——面板打开时通过 `resizeWindow` IPC 让 Electron 窗口向右扩展。两个面板可独立拖拽宽度、独立开关。

### 拖拽手柄 / Drag Handle
面板左侧的 4px 宽拖拽条，用于调整面板宽度。使用 `mousedown`/`mousemove`/`mouseup` 事件实现，最小宽度受 `Math.max(300, ...)` 约束。

---

## 架构决策 (ADRs)

### ADR-001: 面板不压缩终端，窗口向右扩展
**日期：** 2026-06-18
**原因：** 用户需要面板打开时保持终端区域不变，而不是让终端变窄。
**决策：** 面板使用 `position: fixed`，不参与布局计算。通过 `resizeWindow` IPC 让 Electron 窗口增加面板宽度，终端宽度不变。
**影响：** `innerWidth` 同步复杂——`onResize` 的 `storeAssign` 可能覆盖手动设置的 `innerWidth`。解决方案：只通过 `resizeWindow` IPC 改变窗口大小，让浏览器的原生 `resize` 事件自然更新 `innerWidth`。

### ADR-002: VPS 可见性使用计算属性而非存储状态
**日期：** 2026-06-18
**原因：** `rightPanelVPSVisible` 标志多次被外部代码意外覆盖，导致 VPS 面板自动关闭。
**决策：** VPS 可见性由 `activeTabId` + `tabs` 实时计算，不依赖可变状态：
  ```
  vpsVisible = hasHost && !_vpsForceClosed
  ```
  `_vpsForceClosed` 只由用户手动操作（关闭按钮、Info 切换）设置。
**影响：** 需要确保所有读 VPS 可见性的地方都使用计算属性而非状态标志。
**教训：** 使用计算属性比用状态标志+防误关补丁更可靠。

### ADR-003: 新组件必须用 `auto()` 包裹
**日期：** 2026-06-18
**原因：** 未包裹 `auto()` 的组件不响应 store 属性变化，导致「黑屏」式 bug。
**规则：** 任何直接读 `store.xxx` 的 React 组件，必须 `export default auto(function Comp(props) { ... })`。
**例外：** 只通过 props 接收数据、不直接读 store 的纯展示组件。

### ADR-004: `useEffect` 依赖在 render 体读取
**日期：** 2026-06-18
**原因：** 在 `useEffect` 内部读 `store.xxx` 不会被 `auto()` 追踪到，导致 effect 不按预期触发。
**规则：** 所有 `useEffect` 依赖的 store 值必须在 render 体里读取，再传入 deps 数组。

---

## 关键事件链

### 书签连接流程
```
用户双击书签 → form-renderer handleSubmit
  → store.addTab({...bookmarkData, ...newTerm()})
    → tabs.push(newTab)
    → store.activeTabId = newTab.id
    → [VPS 计算属性检测到 hasHost → 显示 VPS 面板]
    → [watch.js autoRun 检测到 activeTabId 变化]
      → openInfoPanelAction() → handleShowInfo() → 设置 terminalInfoProps
```

### VPS 触发时序
```
addTab → activeTabId 变化
  → RightPanelContainer 重渲染（auto() 追踪）
  → _vpsVisible = (activeTab.host && !_vpsForceClosed)
  → 如果 _vpsVisible 变化 → resizeWindow IPC
  → 如果 _vpsVisible = true → 面板显示 + 窗口扩展
```

---

## 存储状态关键字段

| 字段 | 类型 | 说明 |
|------|------|------|
| `store.activeTabId` | string | 当前激活的标签 ID |
| `store.tabs` | Tab[] | 所有标签数组 |
| `store.rightPanelAIVisible` | boolean | AI 面板可见性 |
| `store.rightPanelAIWidth` | number | AI 面板宽度（默认 480） |
| `store._vpsForceClosed` | boolean | 用户是否手动关闭了 VPS |
| `store._vpsForceOpen` | boolean | 用户是否强制打开了 VPS |
| `store.rightPanelVPSWidth` | number | VPS 面板宽度（默认 380） |
| `store.innerWidth` | number | 浏览器内容区宽度 |
| `store.config.modelAI` | string | AI 模型名（如 `deepseek-reasoner`） |
| `store.terminalInfoProps` | object | 终端信息属性（pid, isRemote, id, logName） |

---

## 代码风格约定

- 使用 `manate` 管理状态，`auto()` 用于 React 组件响应式
- `action(function() { ... })` 包装 store 方法以批量更新
- Stylus 预处理器，全局变量通过 `var(--main)` 等方式使用
- Electron IPC：`window.pre.runGlobalAsync(name, args)` 调用主进程方法
- 新增组件时：确认 `auto()` 包裹、样式文件 import、useEffect 依赖在 render 体读取

---

## 开发踩坑

### `store.currentTab` 有激活时机差
`activeTabId` 改变后立刻读 `currentTab` 可能拿空对象（tab 组件未挂载到 refs），改用 `store.tabs.find(t => t.id === id)` 查询。

### 替换/删除组件要 grep 所有调用方
store 方法、事件处理、快捷键、watch 等可能还引用旧组件逻辑，必须一并更新。

### 文件日志优先，不依赖肉眼排查
遇到不确定的运行时问题，先加 `writeLog` IPC 写文件日志（`os.tmpdir() + '/xnow-debug.log'`），运行后自己读日志定位根因，不要反复问用户看到了什么。

---

## 关键文件索引

| 路径 | 说明 |
|------|------|
| `src/client/components/right-panel/right-panel-container.jsx` | 右侧面板容器 |
| `src/client/components/ai/ai-panel.jsx` | AI 面板 |
| `src/client/components/vps-panel/vps-panel.jsx` | VPS 面板 |
| `src/client/store/common.js` | store 通用方法 |
| `src/client/store/tab.js` | 标签操作方法（addTab, delTab, removeTabs） |
| `src/client/store/watch.js` | autoRun 监听器 |
| `src/client/store/init-state.js` | 初始状态 |
| `src/client/components/layout/layout.jsx` | 布局引擎（计算终端宽度） |
| `src/client/components/main/main.jsx` | 主入口组件 |
| `src/client/components/footer/footer-entry.jsx` | 底部栏（AI 按钮、Info 按钮） |
| `src/client/components/terminal/terminal.jsx` | 终端组件 |
| `src/client/components/terminal-info/terminal-info.jsx` | 系统信息组件 |
| `docs/quality-checklist.md` | 修改代码前的 checklist |
