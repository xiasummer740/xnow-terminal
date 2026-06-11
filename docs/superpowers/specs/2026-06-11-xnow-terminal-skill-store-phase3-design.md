# XNOW Terminal 技能商店 Phase 3：AI 自动生成技能

## 概述

在技能商店 Phase 1（管理器+存储）和 Phase 2（商店 UI）的基础上，实现 AI 完成任务后自动检测可复用模式、生成技能草案、弹出通知、用户确认后加入技能库的完整链路。

## 核心数据流

```
AI Agent 完成任务（无 tool_calls）
  │
  ├─→ autoLearn 增强版：调用 AI 判断是否有可复用模式
  │    用 flash 模型，结构化输出 JSON
  │
  ├─→ 无模式 → 保留原有 memory 功能，流程结束
  │
  └─→ 有模式 → 生成技能草案（完整 JSON）
       │
       ├─→ 防重复检查：是否与已有技能/草案冲突？
       │    └─→ 冲突 → 丢弃草案，只存 memory
       │
       ├─→ 存草稿到 localStorage（xnow_skill_draft_*）
       │
       └─→ 设置 store.showSkillDiscovery = true
            └─→ SkillDiscoveryNotification 弹窗检测到状态变化
                 ├─ [✓ 加入技能库] → installSkill(draft) → 移除草稿
                 ├─ [📋 看看再说]  → 草稿保留在待审核列表 → 关闭弹窗
                 └─ [✗ 忽略]       → 移除草稿
```

## 修改文件一览

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/client/common/skill-manager.js` | 新增草案管理方法 |
| 修改 | `src/client/components/ai/agent.js` | 增强 autoLearn，支持技能草案生成 |
| 修改 | `src/client/store/init-state.js` | 新增 showSkillDiscovery / pendingSkillDraft |
| 修改 | `src/client/store/common.js` | 新增 toggleSkillDiscovery / approvePendingDraft / dismissPendingDraft |
| 新建 | `src/client/components/ai/skill-discovery-notification.jsx` | 自动发现弹窗组件 |
| 修改 | `src/client/components/ai/skill-store.jsx` | 新增「待审核」Tab |
| 修改 | `src/client/components/ai/skill-store.styl` | 待审核 Tab 样式 |
| 修改 | `src/client/components/ai/ai-chat.jsx` | 挂载通知组件 |
| 修改 | `test/unit/skill-manager.spec.js` | 添加草案管理相关测试 |

## 方案确认结果

### 模式检测策略：统一增强版 A
修改 `autoLearn` 的 prompt，一次调用做两件事：
- 判断是否有可复用的操作模式
- 有则生成完整技能 JSON + 保留经验总结
- 无则只存经验总结（和现在一样）

### 通知触发：Store 状态 + setInterval 轮询
与现有 `skill-store-modal` 一致，新增 `showSkillDiscovery` + `pendingSkillDraft` 两个 store 状态，新组件用 200ms 间隔轮询检测。

### 待审核管理：技能商店新增 Tab
`skill-manager.js` 新增草案 CRUD 方法，技能商店新增第三个「📋 待审核」Tab。

### AI 模型：固定 flash 模型
技能生成调用固定用 `deepseek-v4-flash`，不依赖用户主模型配置，省钱快速。

## 详细设计

### 1. skill-manager.js — 草案管理

```js
const DRAFTS_KEY = 'xnow_skill_drafts_index'
const DRAFT_PREFIX = 'xnow_skill_draft_'

function loadDraftIndex()        // 从 localStorage 加载草案索引
function saveDraftIndex(list)    // 保存草案索引到 localStorage
function draftKey(id)            // 草案 localStorage key
function saveDraftData(draft)    // 保存单个草案完整数据
function removeDraftData(id)     // 删除单个草案数据
function generateDraftId()       // 生成草案 ID: xnow-skill-draft-{timestamp}

// 公开方法
function saveDraft(draft)        // 保存草案（含索引+数据）
function getDrafts()             // 获取所有草案（含完整数据）
function getDraftById(id)        // 获取单个草案
function approveDraft(id)        // 批准草案 → 转为正式技能（调用 installSkill + 删除草稿）
function rejectDraft(id)         // 拒绝草案 → 删除草稿
function hasSimilarSkill(draft)  // 检查是否有类似技能（比较 name/description）
```

草案数据格式（在 skill JSON 基础上增加 `draftStatus: 'pending'`）：

```js
{
  id: 'xnow-skill-draft-1234567890',
  name: '一键部署',
  version: '1.0.0',
  author: 'xnow-auto',
  category: '部署工具',
  description: '向服务器分发文件并执行命令',
  prompt: '...',
  tools: [],
  source: 'ai_generated',
  draftStatus: 'pending',
  draftCreatedAt: 1234567890,
  relatedTask: '部署前端到测试服务器'  // 触发该草案的对话摘要
}
```

### 2. agent.js — autoLearn 增强

**修改内容：**

- autoLearn 函数的 prompt 改为结构化输出（JSON 格式）
- 增加 flash 模型参数：调用时固定使用 `modelAI = 'deepseek-v4-flash'`（或从 config 读配置）
- 返回值处理逻辑：
  - `hasPattern: true` → `saveDraft(skill)` + `window.store.pendingSkillDraft = draft` + `window.store.showSkillDiscovery = true` + 保留 memory
  - `hasPattern: false` → 只存 memory（现有行为）
- 防重复检查：存草案前先调用 `hasSimilarSkill()`，有冲突则不存

**增强后的 autoLearn prompt（system）：**

```
你是一个技能提炼助手。根据以下 AI 任务对话，完成两项工作：

1. 判断本次任务的操作步骤是否形成了可复用的模式（即下次遇到类似需求时 AI 可以按固定流程操作）
2. 如果有可复用模式，生成一个完整的技能定义

可复用模式的判断标准：
- 操作步骤有清晰的流程（3步以上）
- 流程在不同场景下可重复使用
- 涉及工具调用（命令执行、文件操作等）

日常操作（如"查一下时间"、"说个笑话"）不应该生成技能。

如果发现可复用的操作模式，只输出以下 JSON（不要其他内容）：

{
  "hasPattern": true,
  "memory": "用一句中文总结这次任务的经验",
  "skill": {
    "name": "4-6字技能名称",
    "description": "30字以内的功能描述",
    "category": "从[运维工具, 监控工具, 部署工具, 安全工具, AI工具]中选择",
    "prompt": "详细的步骤指南，告诉 AI 怎么执行这个技能"
  }
}

如果没有发现可复用模式，只输出：

{
  "hasPattern": false,
  "memory": "用一句中文总结这次任务的经验（可以为空字符串）"
}
```

注意：
- memory 字段永远有值（即使为空字符串）
- hasPattern 为 false 时不要包含 skill 字段
- category 必须从给定列表中选择
- name 必须简短（4-6字）
- description 必须在 30 字以内

### 3. Store 状态（init-state.js / common.js）

**init-state.js 新增：**

```js
showSkillDiscovery: false,
pendingSkillDraft: null,
```

**common.js 新增方法：**

```js
Store.prototype.toggleSkillDiscovery = function () {
  this.showSkillDiscovery = !this.showSkillDiscovery
}

Store.prototype.clearPendingDraft = function () {
  this.pendingSkillDraft = null
  this.showSkillDiscovery = false
}
```

### 3.5 autoLearn 模型覆写逻辑

当前 `autoLearn` 使用 `config.modelAI`（用户主模型）。改为优先使用 flash 模型：

```js
// 在 autoLearn 函数内，调用 AI 前构造 model 参数
const skillGenModel = 'deepseek-v4-flash'  // 固定使用 flash
// 但如果用户配置中有 skillGenModel 字段，优先使用
const modelToUse = config.skillGenModel || 'deepseek-v4-flash'
```

flash 调用失败时（网络错误、API 不兼容等），回退到 `config.modelAI` 重试。两次都失败则静默退出，不影响主流程。

### 4. SkillDiscoveryNotification 组件（新建）

**文件：** `src/client/components/ai/skill-discovery-notification.jsx`

**功能：**
- 200ms 轮询 `window.store.showSkillDiscovery`
- 为 true 时弹出 antd Modal
- Modal 内容：
  - 标题：「🧠 AI 学会了一个新技能！」
  - 技能名称 + 分类标签
  - 描述
  - 来源标签：「⚠️ AI 生成，未经验证」
  - 三个按钮：
    - `✓ 加入技能库`（primary）→ `installSkill(draft)` + `clearPendingDraft()` + 刷新
    - `📋 看看再说` → `clearPendingDraft()`
    - `✗ 忽略` → `rejectDraft(draft.id)` + `clearPendingDraft()`

**与现有安装确认弹窗的关系：**
- 安装确认弹窗（showInstallConfirm）在技能商店卡片点击"安装"时触发，走完整权限展示流程
- 自动发现弹窗默认不需要展示权限列表（AI 生成的技能通常不含工具/权限），直接安装
- 如果生成的技能包含 tools/permissions，在弹窗中简略提示

### 5. skill-store.jsx — 新增待审核 Tab

在现有 `skill-store.jsx` 的 tabItems 中增加第三个 Tab：

```jsx
{
  key: 'pending',
  label: '📋 待审核',
  children: <PendingSkillsTab refresh={refresh} />
}
```

**PendingSkillsTab 组件：**
- 从 `skill-manager.getDrafts()` 获取待审核草案列表
- 每个草案展示：名称、描述、分类标签、生成时间
- 操作按钮：「✓ 加入技能库」和「✗ 忽略」
- 空状态：「没有待审核的技能草案」

复用 `installed-list` 样式，与已安装列表风格一致。

### 6. skill-store.styl — 新增样式

在现有样式下方追加：

```styl
// 待审核 Tab
.pending-list
  // 复用 .installed-list 类似的布局
  // 新增草案特有的样式（如时间戳、触发任务摘要）
```

### 7. ai-chat.jsx — 挂载通知组件

在 `SkillStoreModal` 导入旁边导入并挂载 `SkillDiscoveryNotification`：

```jsx
import SkillDiscoveryNotification from './skill-discovery-notification'
// ...
<SkillStoreModal store={window.store} />
<SkillDiscoveryNotification />
```

### 8. 防重复机制

`hasSimilarSkill(draft)` 的检查逻辑：
1. 遍历 `BUILTIN_SKILLS` + 已安装技能 + 待审核草案
2. 比较 `name` 是否相同或包含
3. 比较 `description` 是否相似（关键词重叠度）
4. 如果命中任意一个，返回 true，不生成新草案

### 9. 边界情况处理

| 场景 | 处理 |
|------|------|
| AI 对话只有一个问答（非任务） | autoLearn 的 prompt 自动判断无模式，只存 memory |
| 第一次生成草案时 localStorage 满 | saveDraft 捕获异常，静默失败 |
| 用户正在看技能商店时新草案到来 | showSkillDiscovery 弹出遮罩层通知 |
| 多次任务识别到相同模式 | 防重复检查拦截，只生成一次 |
| 待审核列表存了太多草案 | 限制最多 20 个，超出时删除最旧的 |
| flash 模型调用失败 | 回退到原有 autoLearn 行为（只存 memory） |

## 与现有系统的关系

### 不和 Phase 1&2 修改的文件
- `src/client/components/ai/skill-store-modal.jsx` — 不修改
- `src/client/store/init-state.js` 只新增状态，不删改现有
- `src/client/store/common.js` 只新增方法，不删改现有

### 兼容性
- 旧版 autoLearn 存入的 memories 不受影响
- 已安装的技能不受影响
- 草案数据格式向后兼容

## 验证标准

1. Agent 完成一个多步骤任务后（如部署、备份），自动弹出技能发现通知
2. 简单任务（如查时间）不触发技能发现
3. 点击「加入技能库」后技能出现在「已安装」列表
4. 点击「看看再说」后技能出现在「待审核」Tab
5. 点击「忽略」后技能草案被删除
6. 生成和已有技能同名的草案时被拦截
7. 草稿数据在页面刷新后依然存在
8. 单元测试覆盖草案 CRUD 方法
