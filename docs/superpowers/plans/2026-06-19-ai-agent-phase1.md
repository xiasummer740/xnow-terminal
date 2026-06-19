# AI Agent Phase 1 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Steps use `- [ ]` syntax.

**Goal:** 让 AI Agent 知道当前连接的是哪台机器，锁定标签不乱跑，拦跑路级危险命令

**架构：** 三个独立改动，互不依赖：
1. **Tab 上下文** — agent.js `buildAgentSystemPrompt()` 末尾注入当前 tab 信息
2. **高危弹窗** — agent-tools.js `executeToolCall()` 执行命令前检查是否是跑路级命令，是则 Modal.confirm 弹窗
3. **Tab 锁定** — runAgentLoop 开始捕获 `activeTabId`，`send_terminal_command` 未指定 tabId 时自动补上

**Tech Stack:** React (Ant Design Modal.confirm), xterm, manate

**改动文件：**
- Modify: `src/client/components/ai/agent.js`
- Modify: `src/client/components/ai/agent-tools.js`

---
## Phase 1 已通过 ✅

- Spec 已分解为 3 个独立任务，可以按任意顺序执行

---

## 任务列表

### Task 1: Tab 上下文注入

**文件：** Modify: `src/client/components/ai/agent.js:21-88`（`buildAgentSystemPrompt` 函数）

- [ ] **Step 1: 在 system prompt 末尾注入当前 tab 信息**

在 `buildAgentSystemPrompt()` 函数最后 `return basePrompt + memoryText + skillsText` 之前，加入：

```javascript
// 注入当前 tab 上下文
const currentTab = window.store.currentTab
const hostInfo = currentTab ? currentTab.host || '本地终端' : '未知'
const hostType = currentTab ? currentTab.type || 'local' : 'unknown'
const tabTitle = currentTab ? currentTab.title || '' : ''
const tabContext = `
## 当前连接
- 标签名: ${tabTitle}
- 主机: ${hostInfo}
- 类型: ${hostType}
`
const contextPrompt = basePrompt + memoryText + skillsText + tabContext
return contextPrompt
```

将函数结尾从 `return basePrompt + memoryText + skillsText` 改为使用 `contextPrompt`。

- [ ] **Step 2: lint 检查**

Run: `npx eslint --config "~/.claude/quality/eslint.config.js" src/client/components/ai/agent.js`
Expected: 无错误（或仅有与改动无关的已有问题）

- [ ] **Step 3: 验证**

启动 `npm run dev`，打开 AI 对话，发一条消息，确认 AI 回复中知道自己连接的是哪台机器。
验证方式：向 AI 提问"你现在连接的是哪台机器？"

---

### Task 2: 高危命令安全弹窗

**文件：** Modify: `src/client/components/ai/agent-tools.js`

- [ ] **Step 1: 添加导入和危险命令检测函数**

在 `agent-tools.js` 顶部添加 `Modal` 导入：

```javascript
import { Modal } from 'antd'
```

在 `export const agentTools = [...]` 之后、`executeToolCall` 函数之前，添加危险命令检测函数：

```javascript
// 高危命令检测 — 只拦跑路级操作
const DANGEROUS_PATTERNS = [
  /^rm\s+(-rf\s+)?\/$/,
  /^rm\s+(-rf\s+)?\/\*/,
  /^mkfs/,
  /^dd\s+if=.*of=\/dev\//,
  /^>\s*\/dev\//,
  /^\s*reboot\s*$/,
  /^\s*shutdown\s/,
  /^\s*poweroff\s*$/,
  /^\s*halt\s*$/
]

function isDangerousCommand (cmd) {
  const trimmed = cmd.trim().toLowerCase()
  return DANGEROUS_PATTERNS.some(p => p.test(trimmed))
}
```

- [ ] **Step 2: 在 executeToolCall 中添加弹窗确认**

在 `executeToolCall` 函数中 `case 'send_terminal_command'` 的开关分支内，在执行命令前加入弹窗检查：

```javascript
case 'send_terminal_command': {
  // 高危命令弹窗确认
  const cmd = (args.command || '').trim()
  if (isDangerousCommand(cmd)) {
    const confirmed = await new Promise(resolve => {
      Modal.confirm({
        title: '⚠️ 危险操作确认',
        content: `AI 请求执行高危命令：\n\n\`${cmd}\`\n\n确认执行吗？`,
        okText: '确认执行',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: () => resolve(true),
        onCancel: () => resolve(false)
      })
    })
    if (!confirmed) {
      return JSON.stringify({ blocked: true, reason: '用户取消了危险操作', command: cmd })
    }
  }
  store.mcpSendTerminalCommand(args)
  const idleResult = await store.mcpWaitForTerminalIdle({
    tabId: args.tabId || store.activeTabId,
    timeout: 30000,
    lines: 100
  })
  return JSON.stringify(idleResult)
}
```

注意：`case` 分支现在成了 async（因为有 `await new Promise`），但 `executeToolCall` 本身已经返回 Promise（已经是 async 的），所以没问题。检查确认 `send_terminal_command` 的处理已经是 `await store.mcpWaitForTerminalIdle(...)`，所以 async 兼容。

- [ ] **Step 3: lint 检查**

Run: `npx eslint --config "~/.claude/quality/eslint.config.js" src/client/components/ai/agent-tools.js`
Expected: 无错误

- [ ] **Step 4: 验证**

启动 `npm run dev`，在 Agent 模式下，让 AI 执行以下命令验证弹窗：
1. 问 AI "执行 `rm -rf /` 会怎样" — 确认弹窗出现
2. 点"取消" — 返回 blocked 提示
3. 让 AI 执行 `ls /` — 正常执行，不弹窗

---

### Task 3: Tab 锁定

**文件：** Modify: `src/client/components/ai/agent.js`

- [ ] **Step 1: runAgentLoop 开始处捕获 activeTabId，发命令时自动补上**

在 `runAgentLoop` 函数开头（`setIsStreaming(true)` 之后），添加：

```javascript
// 锁定当前 tab：对话期间所有命令默认发到开始时的活跃标签
const lockedTabId = window.store.activeTabId
```

然后在函数末尾（`toolCallsLog.push(toolEntry)` 之前，`executeToolCall` 调用之前），添加自动补 tabId 的逻辑：

在 `for (const toolCall of assistantMessage.tool_calls)` 循环中，`let args` 解构之后、`toolEntry` 创建之前，加入：

```javascript
// 自动补 tabId：AI 未指定时使用锁定时的活跃标签
if (toolCall.function.name === 'send_terminal_command' && !args.tabId) {
  if (lockedTabId) args.tabId = lockedTabId
}
```

- [ ] **Step 2: lint 检查**

Run: `npx eslint --config "~/.claude/quality/eslint.config.js" src/client/components/ai/agent.js`
Expected: 无错误

- [ ] **Step 3: 验证**

1. 启动 `npm run dev`
2. 打开两个终端标签（比如本地 + VPS1）
3. 切到 VPS1，在 AI Agent 模式下让 AI "查一下磁盘空间"
4. 在 AI 执行过程中，切到本地终端标签
5. 确认 AI 的后续命令仍然发到 VPS1（而不是新切的本地标签）

---

### Task 4: 提交推送 + 发布

- [ ] **Step 1: 提交代码**

```bash
git add -A
git commit -m "feat: AI Agent Phase 1 - Tab上下文+高危弹窗+Tab锁定"
```

- [ ] **Step 2: 推送**

```bash
git push origin build
```

- [ ] **Step 3: 发布**

```bash
npm run rx
```

- [ ] **Step 4: 更新进度日志**

更新 `.claude/PROGRESS.md`，记录本轮完成的内容。

---

## 完成标准

```
[ ] AI 回复时知道自己连接的机器（host/type）
[ ] 执行 rm -rf / 类命令弹窗确认
[ ] 日常命令（ls/apt install/systemctl restart）不弹窗
[ ] 对话期间切标签，AI 不跑错机器
[ ] 已提交推送 GitHub
[ ] 已发布 v3.18.0
[ ] PROGRESS.md 已更新
```
