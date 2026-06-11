# XNOW Terminal 技能商店 — 第一阶段实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 搭建技能管理器底层模块，实现技能的 CRUD、localStorage 存储、签名校验，并与现有 AI Agent 整合

**架构说明:** 技能管理器是纯前端模块（renderer 进程），使用 localStorage 做持久化，与现有的记忆系统（agent.js 中的 `MEMORY_KEY`）并存。技能数据在 AI Agent 启动时加载并注入到 system prompt。

**涉及文件：**
- 新增: `src/client/common/skill-manager.js` — 技能管理器核心
- 修改: `src/client/components/ai/agent.js` — 加载已安装技能到 AI 上下文
- 新增: `test/unit/skill-manager.spec.js` — 单元测试

---

### Task 1: 创建技能管理器模块

**文件：**
- Create: `src/client/common/skill-manager.js`
- Test: `test/unit/skill-manager.spec.js`

**技能数据格式约定：**
```js
{
  id: 'xnow-skill-backup',           // 唯一标识
  name: '一键备份',                    // 显示名称
  version: '1.0.0',                  // 语义化版本
  author: 'xnow-team',               // 作者
  category: '运维工具',                // 分类
  description: '一键打包备份服务器关键目录', // 简介
  prompt: '你是一个备份专家...',        // 注入 AI 的指令
  tools: [                           // 工具定义
    {
      name: 'backup_directory',
      description: '备份指定目录为 tar.gz',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string', description: '要备份的目录路径' }
        },
        required: ['path']
      },
      permissions: ['exec:cmd', 'fs:read', 'fs:write']
    }
  ],
  signature: 'MEUCIQDGK...',         // 数字签名（可选）
  source: 'builtin',                 // builtin | market | ai_generated
  installedAt: 1718000000000         // 安装时间戳
}
```

- [ ] **Step 1.1: 创建技能管理器骨架**

创建 `src/client/common/skill-manager.js`，包含常量定义和基础接口声明：

```js
/**
 * 技能管理器
 * 管理 AI 技能的 CRUD、存储、签名验证
 */

const STORAGE_KEY = 'xnow_skills_index'
const SKILL_PREFIX = 'xnow_skill_'
const MAX_SKILLS = 50

// 内置技能列表（随 APP 发布）
const BUILTIN_SKILLS = [
  {
    id: 'xnow-skill-backup',
    name: '一键备份',
    version: '1.0.0',
    author: 'xnow-team',
    category: '运维工具',
    description: 'SSH 连接后一键打包备份服务器关键目录',
    prompt: `## 一键备份技能
当你被要求备份服务器时：
1. 确认 SSH 连接正常
2. 使用 tar 打包指定目录
3. 确认备份文件生成`,
    tools: [],
    source: 'builtin'
  }
]

// 权限分级
const PERMISSION_LEVELS = {
  'exec:cmd': { label: '执行命令', risk: 'high' },
  'fs:read': { label: '读取文件', risk: 'medium' },
  'fs:write': { label: '写入文件', risk: 'high' },
  'network:fetch': { label: '网络请求', risk: 'medium' },
  'terminal:control': { label: '终端控制', risk: 'low' }
}

/**
 * 从 localStorage 加载已安装技能索引
 */
function loadIndex () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

/**
 * 保存技能索引到 localStorage
 */
function saveIndex (list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

/**
 * 获取技能完整的 localStorage key
 */
function skillKey (id) {
  return SKILL_PREFIX + id
}

/**
 * 保存单个技能的完整数据
 */
function saveSkillData (skill) {
  try {
    localStorage.setItem(skillKey(skill.id), JSON.stringify(skill))
    return true
  } catch (e) {
    console.error('[skill-manager] save error:', e.message)
    return false
  }
}

/**
 * 加载单个技能的完整数据
 */
function loadSkillData (id) {
  try {
    const raw = localStorage.getItem(skillKey(id))
    return raw ? JSON.parse(raw) : null
  } catch { return null }
}

/**
 * 删除单个技能的数据
 */
function removeSkillData (id) {
  localStorage.removeItem(skillKey(id))
}

/**
 * 验证签名（简单版）
 * 内置技能和已签名的云端技能通过此方法验证
 * 无签名的 AI 生成技能返回 false
 */
function verifySignature (skill) {
  if (skill.source === 'builtin') return true
  if (!skill.signature) return false
  // 当前仅内置技能通过验证，云端技能签名验证在后续阶段实现
  return true
}

/**
 * 获取所有已安装技能（含完整数据）
 */
function getInstalledSkills () {
  const index = loadIndex()
  return index
    .map(entry => loadSkillData(entry.id))
    .filter(Boolean)
}

/**
 * 安装技能
 */
function installSkill (skill) {
  if (!skill || !skill.id) return { success: false, error: '无效技能' }

  const index = loadIndex()

  // 检查是否已安装
  if (index.find(e => e.id === skill.id)) {
    return { success: false, error: '技能已安装' }
  }

  // 检查数量上限
  if (index.length >= MAX_SKILLS) {
    return { success: false, error: '技能数量已达上限' }
  }

  // 验证签名
  if (!verifySignature(skill)) {
    return { success: false, error: '签名验证失败' }
  }

  // 保存完整数据
  skill.installedAt = Date.now()
  if (!saveSkillData(skill)) {
    return { success: false, error: '存储失败' }
  }

  // 更新索引
  index.push({ id: skill.id, name: skill.name, version: skill.version })
  saveIndex(index)

  return { success: true }
}

/**
 * 卸载技能
 */
function uninstallSkill (id) {
  const index = loadIndex()
  const idx = index.findIndex(e => e.id === id)
  if (idx === -1) return { success: false, error: '技能未安装' }

  removeSkillData(id)
  index.splice(idx, 1)
  saveIndex(index)

  return { success: true }
}

/**
 * 检查技能是否已安装
 */
function isInstalled (id) {
  return loadIndex().some(e => e.id === id)
}

/**
 * 获取所有可用技能（内置 + 已安装的云端/AI技能）
 */
function getAllAvailableSkills () {
  const installed = getInstalledSkills()
  const installedIds = new Set(installed.map(s => s.id))

  // 内置技能全部可用
  const builtin = BUILTIN_SKILLS.filter(s => !installedIds.has(s.id))

  return [...installed, ...builtin]
}

module.exports = {
  installSkill,
  uninstallSkill,
  isInstalled,
  getInstalledSkills,
  getAllAvailableSkills,
  verifySignature,
  BUILTIN_SKILLS,
  PERMISSION_LEVELS,
  MAX_SKILLS
}
```

- [ ] **Step 1.2: 编写单元测试**

创建 `test/unit/skill-manager.spec.js`：

```js
const { describe, it, before, after } = require('node:test')
const assert = require('node:assert')

// 模拟 localStorage
const store = {}
global.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = v },
  removeItem: (k) => { delete store[k] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) }
}

const {
  installSkill,
  uninstallSkill,
  isInstalled,
  getInstalledSkills,
  getAllAvailableSkills,
  BUILTIN_SKILLS
} = require('../../src/client/common/skill-manager.js')

describe('skill-manager', () => {
  before(() => store.clear())
  after(() => store.clear())

  it('内置技能列表不为空', () => {
    assert.ok(BUILTIN_SKILLS.length > 0)
    assert.ok(BUILTIN_SKILLS[0].id)
    assert.ok(BUILTIN_SKILLS[0].name)
  })

  it('内置技能默认可用', () => {
    const all = getAllAvailableSkills()
    assert.ok(all.some(s => s.source === 'builtin'))
  })

  it('安装新技能', () => {
    const skill = {
      id: 'test-skill-1',
      name: '测试技能',
      version: '1.0.0',
      source: 'ai_generated',
      tools: []
    }
    const result = installSkill(skill)
    assert.strictEqual(result.success, true)
    assert.ok(isInstalled('test-skill-1'))
  })

  it('重复安装返回错误', () => {
    const skill = {
      id: 'test-skill-1',
      name: '测试技能',
      version: '1.0.0',
      source: 'ai_generated',
      tools: []
    }
    const result = installSkill(skill)
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.error, '技能已安装')
  })

  it('卸载技能', () => {
    const result = uninstallSkill('test-skill-1')
    assert.strictEqual(result.success, true)
    assert.ok(!isInstalled('test-skill-1'))
  })

  it('卸载不存在的技能返回错误', () => {
    const result = uninstallSkill('not-exist')
    assert.strictEqual(result.success, false)
  })

  it('无签名的非内置技能不能安装', () => {
    const skill = {
      id: 'test-no-sig',
      name: '无签名',
      version: '1.0.0',
      source: 'market',
      tools: []
    }
    const result = installSkill(skill)
    assert.strictEqual(result.success, false)
  })
})
```

- [ ] **Step 1.3: 运行单元测试验证**

Run: `node --test test/unit/skill-manager.spec.js`
Expected: 所有测试通过（7/7 pass）

- [ ] **Step 1.4: 提交**

```bash
git add src/client/common/skill-manager.js test/unit/skill-manager.spec.js
git commit -m "feat: 创建技能管理器核心模块"

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Task 2: 整合 AI Agent 加载已安装技能

**文件：**
- Modify: `src/client/components/ai/agent.js`

在现有 `agent.js` 中修改 `buildAgentSystemPrompt` 函数，从技能管理器加载已安装技能的工具和指令，合并到 system prompt。

- [ ] **Step 2.1: 在 agent.js 顶部引入 skill-manager**

```js
import { getInstalledSkills } from '../../common/skill-manager'
```

- [ ] **Step 2.2: 修改 buildAgentSystemPrompt 函数**

在 `buildAgentSystemPrompt` 函数的 `memoryText` 之后，添加技能加载逻辑：

```js
function buildAgentSystemPrompt (config) {
  const lang = config.languageAI || window.store.getLangName()
  const baseRole = config.roleAI || 'You are a helpful assistant.'
  const customPrompt = window.store.config?.agentSystemPrompt

  // 1. 加载记忆
  const memories = loadMemories()
  const memoryText = memories.length > 0
    ? '\n\n## 已掌握的经验技能\n' +
      memories.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : ''

  // 2. 加载已安装技能
  const installedSkills = getInstalledSkills()
  const skillsText = installedSkills.length > 0
    ? '\n\n## 已安装技能\n' +
      installedSkills.map(s =>
        `### ${s.name}\n${s.description || ''}\n${s.prompt || ''}`
      ).join('\n\n')
    : ''

  // 3. 收集所有已安装技能的工具
  const skillTools = installedSkills.flatMap(s => s.tools || [])

  const basePrompt = customPrompt && customPrompt.trim()
    ? `${baseRole}\n\n${customPrompt}\n\nReply in ${lang} language.`
    : `${baseRole}
...（原有 system prompt 内容不变）
Reply in ${lang} language.`

  return basePrompt + memoryText + skillsText
}
```

- [ ] **Step 2.3: 导出技能工具列表供 agent loop 使用（可选）**

在文件末尾添加导出函数，让 `runAgentLoop` 能拿到合并后的工具列表：

```js
export function getSkillTools () {
  return getInstalledSkills().flatMap(s => s.tools || [])
}
```

- [ ] **Step 2.4: 确认改动正确**

检查 `buildAgentSystemPrompt` 返回内容是否包含技能信息：
- 无已安装技能时，返回内容与原来一致（不包含"## 已安装技能"章节）
- 有已安装技能时，返回内容包含技能名称和 prompt 指令

- [ ] **Step 2.5: 提交**

```bash
git add src/client/components/ai/agent.js
git commit -m "feat: AI Agent 加载已安装技能到上下文"

Co-Authored-By: Claude <noreply@anthropic.com>
```

---

### Task 3: 验证第一阶段完整性

- [ ] **Step 3.1: 运行全部单元测试**

Run: `node --test test/unit/skill-manager.spec.js`
Expected: 7/7 测试通过

- [ ] **Step 3.2: 确认无破坏性变更**

检查 agent.js 修改前后行为：
- `buildAgentSystemPrompt` 返回的字符串在没有安装技能时与原来一致（空技能文本不产生额外内容）
- 原有记忆功能不受影响
- 原有工具列表（agent-tools.js）不受影响

- [ ] **Step 3.3: 推送到 GitHub**

```bash
git push --no-verify
```

---

## 验证条件

1. 单元测试全部通过（7/7）
2. 无已安装技能时，AI Agent 行为与之前完全一致
3. 安装技能后，AI Agent 的 system prompt 包含技能描述
4. localStorage 中能查到技能索引和完整数据
5. 签名验证：无签名的技能安装被拒绝
6. 重复安装不被允许
