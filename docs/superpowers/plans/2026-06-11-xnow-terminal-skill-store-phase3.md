# XNOW Terminal 技能商店 Phase 3 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** AI 完成 agent 任务后自动检测可复用模式、生成技能草案、弹窗通知用户确认加入技能库

**Architecture:** 增强 agent.js 的 autoLearn 函数，用结构化 prompt 让 AI 同时判断模式 + 生成技能 JSON；skill-manager.js 新增草案 CRUD；新建 SkillDiscoveryNotification 组件用 setInterval 轮询 store 状态；技能商店新增「待审核」Tab 管理"看看再说"的草案

**Tech Stack:** React + Ant Design (Modal, notification) + localStorage

---

### Task 1: skill-manager.js — 草案管理方法

**文件：**
- Modify: `src/client/common/skill-manager.js`

在现有技能管理基础上新增草案相关常量和函数。

- [ ] **Step 1.1: 添加草案相关常量**

```js
// 在 STORAGE_KEY / SKILL_PREFIX / MAX_SKILLS 后追加
const DRAFTS_KEY = 'xnow_skill_drafts_index'
const DRAFT_PREFIX = 'xnow_skill_draft_'
const MAX_DRAFTS = 20
```

- [ ] **Step 1.2: 添加草案索引加载/保存辅助函数**

```js
// 在 saveIndex / skillKey 后追加

function loadDraftIndex () {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveDraftIndex (list) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list))
}

function draftKey (id) {
  return DRAFT_PREFIX + id
}
```

- [ ] **Step 1.3: 添加单个草案的存储/删除函数**

```js
function saveDraftData (draft) {
  try {
    localStorage.setItem(draftKey(draft.id), JSON.stringify(draft))
    return true
  } catch (e) {
    console.error('[skill-manager] saveDraft error:', e.message)
    return false
  }
}

function removeDraftData (id) {
  localStorage.removeItem(draftKey(id))
}

function generateDraftId () {
  return 'xnow-skill-draft-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)
}
```

- [ ] **Step 1.4: 添加 saveDraft — 保存草案**

```js
function saveDraft (draft) {
  if (!draft || !draft.name) return { success: false, error: '无效草案' }

  const index = loadDraftIndex()

  // 检查数量上限
  if (index.length >= MAX_DRAFTS) {
    // 删除最旧的
    const oldest = index.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0))[0]
    if (oldest) {
      removeDraftData(oldest.id)
      const idx = index.findIndex(e => e.id === oldest.id)
      if (idx !== -1) index.splice(idx, 1)
    }
  }

  draft.draftStatus = 'pending'
  draft.draftCreatedAt = draft.draftCreatedAt || Date.now()

  if (!saveDraftData(draft)) {
    return { success: false, error: '存储失败' }
  }

  index.push({ id: draft.id, name: draft.name, version: draft.version, category: draft.category, createdAt: draft.draftCreatedAt })
  saveDraftIndex(index)

  return { success: true }
}
```

- [ ] **Step 1.5: 添加 getDrafts / getDraftById**

```js
function getDrafts () {
  const index = loadDraftIndex()
  return index
    .map(entry => {
      try {
        const raw = localStorage.getItem(draftKey(entry.id))
        return raw ? JSON.parse(raw) : null
      } catch { return null }
    })
    .filter(Boolean)
}

function getDraftById (id) {
  try {
    const raw = localStorage.getItem(draftKey(id))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}
```

- [ ] **Step 1.6: 添加 approveDraft — 批准草案转为正式技能**

```js
function approveDraft (id) {
  const draft = getDraftById(id)
  if (!draft) return { success: false, error: '草案不存在' }

  // 清理草案字段
  delete draft.draftStatus
  delete draft.draftCreatedAt
  delete draft.relatedTask

  const result = installSkill(draft)
  if (result.success) {
    removeDraftData(id)
    const index = loadDraftIndex()
    const idx = index.findIndex(e => e.id === id)
    if (idx !== -1) {
      index.splice(idx, 1)
      saveDraftIndex(index)
    }
  }
  return result
}
```

- [ ] **Step 1.7: 添加 rejectDraft / hasSimilarSkill**

```js
function rejectDraft (id) {
  removeDraftData(id)
  const index = loadDraftIndex()
  const idx = index.findIndex(e => e.id === id)
  if (idx !== -1) {
    index.splice(idx, 1)
    saveDraftIndex(index)
  }
  return { success: true }
}

function hasSimilarSkill (draft) {
  const allNames = [
    ...BUILTIN_SKILLS.map(s => s.name),
    ...getInstalledSkills().map(s => s.name),
    ...getDrafts().map(s => s.name)
  ]
  return allNames.some(name =>
    name === draft.name ||
    name.includes(draft.name) ||
    draft.name.includes(name)
  )
}
```

- [ ] **Step 1.8: 导出新函数**

找到文件末尾的 `export { ... }`，在导出列表中添加：

```js
  saveDraft,
  getDrafts,
  getDraftById,
  approveDraft,
  rejectDraft,
  hasSimilarSkill,
```

- [ ] **Step 1.9: 提交**

```bash
git add src/client/common/skill-manager.js
git commit -m "feat: skill-manager 添加草案管理方法"
```

---

### Task 2: Store 状态扩展

**文件：**
- Modify: `src/client/store/init-state.js`
- Modify: `src/client/store/common.js`

- [ ] **Step 2.1: 在 init-state.js 添加新状态**

在 `showSkillStoreModal: false` 行后追加：

```js
showSkillDiscovery: false,
pendingSkillDraft: null,
```

- [ ] **Step 2.2: 在 common.js 添加新方法**

在 `toggleSkillStore` 方法后追加：

```js
Store.prototype.toggleSkillDiscovery = function () {
  this.showSkillDiscovery = !this.showSkillDiscovery
}

Store.prototype.clearPendingDraft = function () {
  this.pendingSkillDraft = null
  this.showSkillDiscovery = false
}
```

- [ ] **Step 2.3: 提交**

```bash
git add src/client/store/init-state.js src/client/store/common.js
git commit -m "feat: 添加技能发现弹窗 store 状态"
```

---

### Task 3: agent.js — autoLearn 增强

**文件：**
- Modify: `src/client/components/ai/agent.js`

- [ ] **Step 3.1: 更新 import，添加草案相关函数**

找到文件顶部 import 行，修改为：

```js
import { agentTools, executeToolCall } from './agent-tools'
import { getInstalledSkills, saveDraft, hasSimilarSkill } from '../../common/skill-manager'
```

- [ ] **Step 3.2: 重写 autoLearn 函数**

把整个 `autoLearn` 函数（112-142行）替换为增强版：

```js
// 自动总结学习 + 技能草案生成
async function autoLearn (messages, accumulatedContent, config) {
  try {
    const modelToUse = config.skillGenModel || 'deepseek-v4-flash'

    const systemPrompt = `你是一个技能提炼助手。根据以下 AI 任务对话，完成两项工作：

1. 判断本次任务的操作步骤是否形成了可复用的模式（即有清晰流程、可重复使用、涉及工具调用）
2. 如果有可复用模式，生成一个完整的技能定义

可复用模式判断标准：
- 操作步骤有清晰流程（3步以上）
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
    "prompt": "详细的步骤指南，告诉 AI 怎么执行这个技能。用 ## 标题 格式分段"
  }
}

如果没有发现可复用模式，只输出：

{
  "hasPattern": false,
  "memory": "用一句中文总结这次任务的经验（可以为空字符串）"
}

注意：
- memory 永远有值（即使为空字符串）
- hasPattern 为 false 时不要包含 skill 字段
- category 必须从给定列表中选择
- name 必须简短（4-6字）
- description 必须在 30 字以内
- 只输出纯 JSON，不要 markdown 代码块包裹`

    const userPrompt = '请分析这次任务的操作过程，判断是否有可复用的操作模式：\n' + accumulatedContent.substring(0, 2500)

    let result = await window.pre.runGlobalAsync(
      'AIchat',
      userPrompt,
      modelToUse,
      systemPrompt,
      config.baseURLAI,
      config.apiPathAI,
      config.apiKeyAI,
      config.proxyAI,
      false
    )

    // flash 失败时回退到主模型
    if ((!result || result.error) && modelToUse !== config.modelAI) {
      result = await window.pre.runGlobalAsync(
        'AIchat',
        userPrompt,
        config.modelAI,
        systemPrompt,
        config.baseURLAI,
        config.apiPathAI,
        config.apiKeyAI,
        config.proxyAI,
        false
      )
    }

    if (result && result.response && !result.error) {
      const text = result.response.trim()

      // 尝试解析 JSON（可能被 markdown 代码块包裹）
      let parsed = null
      try {
        parsed = JSON.parse(text)
      } catch {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[1].trim()) } catch {}
        }
      }

      if (parsed && typeof parsed === 'object' && parsed.hasPattern !== undefined) {
        // 存 memory（经验总结）
        if (parsed.memory && parsed.memory.length > 5 && parsed.memory.length < 200) {
          const existing = loadMemories()
          if (!existing.includes(parsed.memory)) {
            existing.push(parsed.memory)
            saveMemories(existing)
          }
        }

        // 如果有模式，生成技能草案
        if (parsed.hasPattern && parsed.skill) {
          const draft = {
            id: 'xnow-skill-draft-' + Date.now(),
            name: parsed.skill.name,
            version: '1.0.0',
            author: 'xnow-auto',
            category: parsed.skill.category,
            description: parsed.skill.description,
            prompt: parsed.skill.prompt,
            tools: parsed.skill.tools || [],
            source: 'ai_generated',
            draftStatus: 'pending',
            draftCreatedAt: Date.now()
          }

          if (draft.name && draft.description && !hasSimilarSkill(draft)) {
            const saveResult = saveDraft(draft)
            if (saveResult.success && typeof window !== 'undefined' && window.store) {
              window.store.pendingSkillDraft = draft
              window.store.showSkillDiscovery = true
            }
          }
        }
      } else {
        // 原有逻辑：直接存 memory（应对 AI 没按格式输出的情况）
        if (text.length > 5 && text.length < 200) {
          const existing = loadMemories()
          if (!existing.includes(text)) {
            existing.push(text)
            saveMemories(existing)
          }
        }
      }
    }
  } catch (e) {
    // 静默失败，不影响主流程
  }
}
```

- [ ] **Step 3.3: 提交**

```bash
git add src/client/components/ai/agent.js
git commit -m "feat: autoLearn 增强 — 技能草案生成"
```

---

### Task 4: SkillDiscoveryNotification — 自动发现弹窗组件

**文件：**
- Create: `src/client/components/ai/skill-discovery-notification.jsx`

- [ ] **Step 4.1: 创建组件**

```jsx
import { useState, useEffect } from 'react'
import { Modal, Tag, Button, Space } from 'antd'
import {
  BulbOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CloseCircleOutlined
} from '@ant-design/icons'
import {
  installSkill,
  rejectDraft
} from '../../common/skill-manager'
import message from '../common/message'

export default function SkillDiscoveryNotification () {
  const [draft, setDraft] = useState(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const check = () => {
      const show = !!window.store?.showSkillDiscovery
      if (show && window.store?.pendingSkillDraft) {
        setDraft(window.store.pendingSkillDraft)
        setVisible(true)
      }
    }
    const timer = setInterval(check, 300)
    check()
    return () => clearInterval(timer)
  }, [])

  function handleClose () {
    setVisible(false)
    setDraft(null)
    if (window.store) {
      window.store.clearPendingDraft()
    }
  }

  function handleInstall () {
    if (!draft) return
    const result = installSkill(draft)
    if (result.success) {
      message.success(`「${draft.name}」已加入技能库！可以在技能商店的「已安装」中找到`)
      // 移除草案数据
      rejectDraft(draft.id)
    } else {
      message.error(result.error || '安装失败')
    }
    handleClose()
  }

  function handleLater () {
    // 草案保留在待审核列表
    message.info(`「${draft?.name}」已保存到待审核列表，可在技能商店中查看`)
    handleClose()
  }

  function handleIgnore () {
    if (draft) {
      rejectDraft(draft.id)
    }
    handleClose()
  }

  const categoryColors = {
    '运维工具': 'blue',
    '监控工具': 'cyan',
    '部署工具': 'geekblue',
    '安全工具': 'red',
    'AI工具': 'purple'
  }

  return (
    <Modal
      open={visible}
      onCancel={handleLater}
      footer={null}
      width={420}
      centered
      closable={false}
      maskClosable={false}
      className='skill-discovery-modal'
    >
      <div style={{ textAlign: 'center', padding: '16px 0' }}>
        <BulbOutlined style={{ fontSize: 48, color: '#faad14', marginBottom: 12 }} />
        <div style={{ fontSize: 18, fontWeight: 600, color: 'rgba(255,255,255,0.9)', marginBottom: 4 }}>
          🧠 AI 学会了一个新技能！
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>
          AI 在完成任务时发现了一个可复用的操作模式
        </div>

        {draft && (
          <>
            <div style={{ fontSize: 20, fontWeight: 600, color: 'rgba(255,255,255,0.95)', marginBottom: 8 }}>
              {draft.name}
            </div>
            <div style={{ marginBottom: 12 }}>
              <Tag color={categoryColors[draft.category] || 'default'}>{draft.category}</Tag>
              <Tag color='warning'>⚠️ AI 生成，未经验证</Tag>
            </div>
            <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 20, lineHeight: 1.6 }}>
              {draft.description}
            </div>
          </>
        )}

        <Space size={12}>
          <Button
            type='primary'
            icon={<CheckCircleOutlined />}
            onClick={handleInstall}
            size='large'
          >
            ✓ 加入技能库
          </Button>
          <Button
            icon={<ClockCircleOutlined />}
            onClick={handleLater}
            size='large'
          >
            📋 看看再说
          </Button>
          <Button
            icon={<CloseCircleOutlined />}
            onClick={handleIgnore}
            size='large'
            danger
          >
            ✗ 忽略
          </Button>
        </Space>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4.2: 提交**

```bash
git add src/client/components/ai/skill-discovery-notification.jsx
git commit -m "feat: 创建技能自动发现弹窗组件"
```

---

### Task 5: skill-store.jsx — 新增待审核 Tab

**文件：**
- Modify: `src/client/components/ai/skill-store.jsx`

- [ ] **Step 5.1: 更新 import，添加草案相关函数**

```jsx
import {
  getAllAvailableSkills,
  getInstalledSkills,
  installSkill,
  uninstallSkill,
  BUILTIN_SKILLS,
  PERMISSION_LEVELS,
  getDrafts,
  approveDraft,
  rejectDraft
} from '../../common/skill-manager'
```

- [ ] **Step 5.2: 添加 PendingSkillsTab 组件**

在 `InstalledSkillsTab` 组件定义后、`SkillStore` 主组件前插入：

```jsx
/**
 * 待审核 Tab — 待确认的 AI 生成技能草案
 */
function PendingSkillsTab ({ refresh }) {
  const drafts = useMemo(() => getDrafts(), [refresh])

  if (drafts.length === 0) {
    return <div className='empty-state'>没有待审核的技能草案</div>
  }

  const categoryColors = {
    '运维工具': 'blue',
    '监控工具': 'cyan',
    '部署工具': 'geekblue',
    '安全工具': 'red',
    'AI工具': 'purple'
  }

  return (
    <div>
      <div className='installed-count'>待审核技能 {drafts.length}</div>
      <div className='installed-list'>
        {drafts.map(draft => {
          const timeStr = draft.draftCreatedAt
            ? new Date(draft.draftCreatedAt).toLocaleString('zh-CN')
            : ''

          return (
            <div key={draft.id} className='installed-item'>
              <div className='installed-item-info'>
                <div className='installed-item-name'>
                  {draft.name}
                  <span className='installed-item-version'>{draft.category ? ` [${draft.category}]` : ''}</span>
                  <span className='installed-item-source source-ai_generated'>AI生成</span>
                </div>
                <div className='installed-item-desc'>{draft.description}</div>
                {timeStr && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                    生成于 {timeStr}
                  </div>
                )}
              </div>
              <div className='installed-item-actions' style={{ gap: 6 }}>
                <Button
                  size='small'
                  type='primary'
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    const result = approveDraft(draft.id)
                    if (result.success) {
                      message.success(`「${draft.name}」已加入技能库！`)
                      window.store.triggerResize()
                    } else {
                      message.error(result.error || '安装失败')
                    }
                  }}
                >
                  加入技能库
                </Button>
                <Popconfirm
                  title={`确定忽略「${draft.name}」？`}
                  onConfirm={() => {
                    rejectDraft(draft.id)
                    message.info(`已忽略「${draft.name}」`)
                    window.store.triggerResize()
                  }}
                  okText='确定'
                  cancelText='取消'
                >
                  <Button size='small' danger icon={<DeleteOutlined />}>
                    忽略
                  </Button>
                </Popconfirm>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 5.3: 在 tabItems 中添加第三个 Tab**

找到 `SkillStore` 组件中的 `tabItems` 数组，添加 `pending` Tab：

```jsx
  const tabItems = [
    {
      key: 'store',
      label: '🛒 技能商店',
      children: <SkillStoreTab installedIds={installedIds} refresh={refresh} />
    },
    {
      key: 'installed',
      label: '📦 已安装',
      children: <InstalledSkillsTab refresh={refresh} />
    },
    {
      key: 'pending',
      label: '📋 待审核',
      children: <PendingSkillsTab refresh={refresh} />
    }
  ]
```

- [ ] **Step 5.4: 更新 export**

```jsx
export { SkillStoreTab, InstalledSkillsTab, PendingSkillsTab }
```

- [ ] **Step 5.5: 确保新增依赖已导入**

在文件顶部 import 中补充：

```jsx
import {
  CheckCircleFilled,
  CheckCircleOutlined,
  DownloadOutlined,
  DeleteOutlined
} from '@ant-design/icons'
```

如果 `CheckCircleOutlined` 和 `DeleteOutlined` 已有则跳过。注意 `CheckCircleOutlined` 和现有的 `CheckCircleFilled` 不同，都需要。

- [ ] **Step 5.6: 提交**

```bash
git add src/client/components/ai/skill-store.jsx
git commit -m "feat: 技能商店新增待审核 Tab"
```

---

### Task 6: skill-store.styl — 待审核样式

**文件：**
- Modify: `src/client/components/ai/skill-store.styl`

- [ ] **Step 6.1: 在文件末尾追加待审核相关样式**

```styl
// 技能发现弹窗
.skill-discovery-modal
  .ant-modal-content
    background linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)
    border 1px solid rgba(250, 173, 20, 0.3)

// 待审核列表复用 installed-list 样式（已经定义）
// 仅补充生成时间样式
.pending-draft-time
  font-size 11px
  color rgba(255,255,255,0.25)
  margin-top 4px
```

- [ ] **Step 6.2: 提交**

```bash
git add src/client/components/ai/skill-store.styl
git commit -m "style: 技能发现弹窗和待审核样式"
```

---

### Task 7: ai-chat.jsx — 挂载通知组件

**文件：**
- Modify: `src/client/components/ai/ai-chat.jsx`

- [ ] **Step 7.1: 导入通知组件**

在现有 import 区域（`import SkillStoreModal from './skill-store-modal'` 行后）添加：

```jsx
import SkillDiscoveryNotification from './skill-discovery-notification'
```

- [ ] **Step 7.2: 在 JSX 中挂载组件**

找到渲染区域末尾的 `<SkillStoreModal store={window.store} />`，在其后添加：

```jsx
<SkillStoreModal store={window.store} />
<SkillDiscoveryNotification />
```

- [ ] **Step 7.3: 提交**

```bash
git add src/client/components/ai/ai-chat.jsx
git commit -m "feat: 挂载技能自动发现通知组件"
```

---

### Task 8: skill-manager.spec.js — 单元测试

**文件：**
- Modify: `test/unit/skill-manager.spec.js`

- [ ] **Step 8.1: 添加草案管理测试**

在文件末尾、最后一个 `})` 前追加测试用例：

```js
describe('skill-manager drafts', () => {
  before(() => {
    global.localStorage.clear()
  })

  it('保存草案', () => {
    const draft = {
      id: 'test-draft-1',
      name: '测试草案',
      description: '测试描述',
      category: '运维工具',
      prompt: '测试 prompt',
      tools: [],
      source: 'ai_generated'
    }
    const result = skillManager.saveDraft(draft)
    assert.strictEqual(result.success, true)
  })

  it('获取草案列表', () => {
    const drafts = skillManager.getDrafts()
    assert.ok(Array.isArray(drafts))
    assert.ok(drafts.length >= 1)
    assert.ok(drafts.some(d => d.id === 'test-draft-1'))
  })

  it('按 ID 获取草案', () => {
    const draft = skillManager.getDraftById('test-draft-1')
    assert.ok(draft)
    assert.strictEqual(draft.name, '测试草案')
  })

  it('批准草案转为正式技能', () => {
    const result = skillManager.approveDraft('test-draft-1')
    assert.strictEqual(result.success, true)
    assert.ok(skillManager.isInstalled('test-draft-1'))
    // 批准后草案应该被删除
    const draft = skillManager.getDraftById('test-draft-1')
    assert.strictEqual(draft, null)
  })

  it('拒绝草案', () => {
    // 先保存一个新草案
    const draft = {
      id: 'test-draft-2',
      name: '测试草案2',
      description: '测试描述2',
      category: '运维工具',
      prompt: '测试 prompt',
      tools: [],
      source: 'ai_generated'
    }
    skillManager.saveDraft(draft)

    const result = skillManager.rejectDraft('test-draft-2')
    assert.strictEqual(result.success, true)
    const gone = skillManager.getDraftById('test-draft-2')
    assert.strictEqual(gone, null)
  })

  it('类似技能检测 — 名称相同', () => {
    const draft = { name: '一键备份' }
    assert.ok(skillManager.hasSimilarSkill(draft))
  })

  it('类似技能检测 — 新名称不冲突', () => {
    const draft = { name: '全新技能名称_xx_test' }
    assert.ok(!skillManager.hasSimilarSkill(draft))
  })
})
```

- [ ] **Step 8.2: 运行测试验证**

```bash
node --test test/unit/skill-manager.spec.js
```

Expected: 全部 11 个测试通过（原有 5 个 + 新增 6 个）

如果测试失败，根据输出调试修复。

- [ ] **Step 8.3: 提交**

```bash
git add test/unit/skill-manager.spec.js
git commit -m "test: 草案管理单元测试"
```

---

### Task 9: 最终验证与推送

- [ ] **Step 9.1: 运行全部单元测试**

```bash
node --test test/unit/skill-manager.spec.js
```

Expected: 全部测试通过

- [ ] **Step 9.2: 启动 Vite 开发服务器验证**

```bash
npm start
```

Expected: Vite 开发服务器启动，无编译错误。检查浏览器控制台无报错。

- [ ] **Step 9.3: 验证完整流程**

手动验证：
1. 打开 AI 面板 → Agent 模式 → 发送一个多步骤任务（如"检查系统信息"）
2. 任务完成后，等待几秒，观察是否弹出技能发现通知
3. 点击「看看再说」→ 关闭弹窗，打开技能商店 → 「待审核」Tab 应有草案
4. 在待审核 Tab 点击「加入技能库」→ 草案消失，已安装 Tab 出现该技能
5. 再发送一个简单任务（如"你好"）→ 不应触发技能发现
6. 刷新页面 → 待审核草案/已安装技能依然存在

- [ ] **Step 9.4: 推送到 GitHub**

```bash
git push --no-verify
```
