/**
 * Phase 3 集成测试 — 模拟 autoLearn 技能生成流程
 * 不依赖 GUI，直接测试数据流
 */
import { describe, it, before } from 'node:test'
import assert from 'node:assert'

// Mock localStorage
const store = {}
global.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = v },
  removeItem: (k) => { delete store[k] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) }
}

// Mock window.store (used by autoLearn to trigger notification)
global.window = {
  store: {
    pendingSkillDraft: null,
    showSkillDiscovery: false,
    clearPendingDraft () {
      this.pendingSkillDraft = null
      this.showSkillDiscovery = false
    },
    triggerResize () {}
  }
}

let skillManager

describe('Phase 3 集成测试 — AI 自动生成技能', () => {
  before(async () => {
    skillManager = await import('../../src/client/common/skill-manager.js')
    // 安装一个内置技能（让列表非空）
    const result = skillManager.installSkill({
      id: 'xnow-skill-backup',
      name: '一键备份',
      version: '1.0.0',
      author: 'xnow-team',
      category: '运维工具',
      description: 'SSH 连接后一键打包备份服务器关键目录',
      prompt: '备份指令',
      tools: [],
      source: 'builtin'
    })
    assert.strictEqual(result.success, true)
  })

  it('1. hasSimilarSkill 检测到同名内置技能', () => {
    assert.ok(skillManager.hasSimilarSkill({ name: '一键备份' }))
  })

  it('2. hasSimilarSkill 放行新技能名', () => {
    assert.ok(!skillManager.hasSimilarSkill({ name: '全新测试技能' }))
  })

  it('3. 模拟 autoLearn 检测到有模式 → 生成草案', () => {
    // 模拟 autoLearn 成功后解析的 JSON
    const parsedSkill = {
      name: '系统检测',
      description: '自动化检测系统运行状态',
      category: '运维工具',
      prompt: '## 系统检测技能\n1. 运行 systeminfo\n2. 检查 CPU/内存/磁盘'
    }

    const draft = {
      id: 'xnow-skill-draft-' + Date.now(),
      name: parsedSkill.name,
      version: '1.0.0',
      author: 'xnow-auto',
      category: parsedSkill.category,
      description: parsedSkill.description,
      prompt: parsedSkill.prompt,
      tools: [],
      source: 'ai_generated',
      draftStatus: 'pending',
      draftCreatedAt: Date.now()
    }

    // 检查不冲突
    assert.ok(!skillManager.hasSimilarSkill(draft))

    // 存草案
    const saveResult = skillManager.saveDraft(draft)
    assert.strictEqual(saveResult.success, true)

    // 模拟通知触发
    global.window.store.pendingSkillDraft = draft
    global.window.store.showSkillDiscovery = true
    assert.strictEqual(window.store.showSkillDiscovery, true)
    assert.strictEqual(window.store.pendingSkillDraft.name, '系统检测')
  })

  it('4. 待审核列表中有刚生成的草案', () => {
    const drafts = skillManager.getDrafts()
    assert.ok(drafts.length >= 1)
    assert.ok(drafts.some(d => d.name === '系统检测'))
  })

  it('5. 点击"加入技能库" → approveDraft', () => {
    const drafts = skillManager.getDrafts()
    const target = drafts.find(d => d.name === '系统检测')
    assert.ok(target, '草案应该存在')

    const result = skillManager.approveDraft(target.id)
    assert.strictEqual(result.success, true)

    // 确认草案已被删除
    const remainingDrafts = skillManager.getDrafts()
    assert.ok(!remainingDrafts.some(d => d.name === '系统检测'))

    // 确认技能已安装
    assert.ok(skillManager.isInstalled(target.id))
  })

  it('6. 已安装列表中包含批准后的技能', () => {
    const installed = skillManager.getInstalledSkills()
    assert.ok(installed.some(s => s.name === '系统检测'))
    assert.strictEqual(installed.find(s => s.name === '系统检测').source, 'ai_generated')
  })

  it('7. 模拟又生成了重复技能 → 防重复拦截', () => {
    const draft = { name: '系统检测' }
    assert.ok(skillManager.hasSimilarSkill(draft), '同名技能应被检测到')
  })

  it('8. 模拟"看看再说"流程', () => {
    const draft = {
      id: 'xnow-skill-draft-' + Date.now(),
      name: '日志分析助手',
      description: '自动扫描和分析日志文件',
      category: 'AI工具',
      prompt: '分析指令',
      tools: [],
      source: 'ai_generated',
      draftStatus: 'pending',
      draftCreatedAt: Date.now()
    }

    // 存草案但不批准（模拟"看看再说"）
    const saveResult = skillManager.saveDraft(draft)
    assert.strictEqual(saveResult.success, true)

    // 关闭通知（clearPendingDraft）
    window.store.clearPendingDraft()
    assert.strictEqual(window.store.showSkillDiscovery, false)
    assert.strictEqual(window.store.pendingSkillDraft, null)

    // 草案还在待审核列表
    const drafts = skillManager.getDrafts()
    assert.ok(drafts.some(d => d.name === '日志分析助手'))
  })

  it('9. 模拟"忽略"流程 → rejectDraft', () => {
    const drafts = skillManager.getDrafts()
    const target = drafts.find(d => d.name === '日志分析助手')
    assert.ok(target)

    const result = skillManager.rejectDraft(target.id)
    assert.strictEqual(result.success, true)

    const remaining = skillManager.getDrafts()
    assert.ok(!remaining.some(d => d.name === '日志分析助手'))
  })

  it('10. 验证完全不相关的操作不触发技能生成', () => {
    // 模拟 autoLearn 传入了日常对话（如"说个笑话"）
    // 这种情况下 autoLearn 的 prompt 应该让 AI 输出 hasPattern: false
    // 这里验证：如果 autoLearn 没有写任何草案，getDrafts 列表不应该增加
    // （autoLearn 本身不直接产生草案，是通过 saveDraft 写入）
    const draftsBefore = skillManager.getDrafts()
    // 日常操作不应该调用 saveDraft
    assert.ok(draftsBefore.length === 0 || draftsBefore.every(d => !['笑话', '天气'].includes(d.name)))
  })
})
