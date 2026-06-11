const { describe, it, before } = require('node:test')
const assert = require('node:assert')

// 模拟 localStorage
const store = {}
global.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = v },
  removeItem: (k) => { delete store[k] },
  clear: () => { Object.keys(store).forEach(k => delete store[k]) }
}

let skillManager

describe('skill-manager', () => {
  before(async () => {
    skillManager = await import('../../src/client/common/skill-manager.js')
    global.localStorage.clear()
  })

  it('内置技能列表不为空', () => {
    assert.ok(skillManager.BUILTIN_SKILLS.length >= 6)
    assert.ok(skillManager.BUILTIN_SKILLS[0].id)
    assert.ok(skillManager.BUILTIN_SKILLS[0].name)
    // 验证所有技能有必需的字段
    skillManager.BUILTIN_SKILLS.forEach(skill => {
      assert.ok(skill.id, `技能 ${skill.name} 缺少 id`)
      assert.ok(skill.name, `技能缺少 name`)
      assert.ok(skill.category, `技能 ${skill.name} 缺少 category`)
      assert.ok(skill.description, `技能 ${skill.name} 缺少 description`)
    })
  })

  it('内置技能默认可用', () => {
    const all = skillManager.getAllAvailableSkills()
    assert.ok(all.some(s => s.source === 'builtin'))
  })

  it('安装新技能', () => {
    const skill = {
      id: 'test-skill-1',
      name: '测试技能',
      version: '1.0.0',
      source: 'ai_generated',
      signature: 'test-sig-1',
      tools: []
    }
    const result = skillManager.installSkill(skill)
    assert.strictEqual(result.success, true)
    assert.ok(skillManager.isInstalled('test-skill-1'))
  })

  it('重复安装返回错误', () => {
    const skill = {
      id: 'test-skill-1',
      name: '测试技能',
      version: '1.0.0',
      source: 'ai_generated',
      signature: 'test-sig-1',
      tools: []
    }
    const result = skillManager.installSkill(skill)
    assert.strictEqual(result.success, false)
    assert.strictEqual(result.error, '技能已安装')
  })

  it('卸载技能', () => {
    const result = skillManager.uninstallSkill('test-skill-1')
    assert.strictEqual(result.success, true)
    assert.ok(!skillManager.isInstalled('test-skill-1'))
  })

  it('卸载不存在的技能返回错误', () => {
    const result = skillManager.uninstallSkill('not-exist')
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
    const result = skillManager.installSkill(skill)
    assert.strictEqual(result.success, false)
  })
})

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
