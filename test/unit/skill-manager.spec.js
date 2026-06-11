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
  before(() => global.localStorage.clear())
  after(() => global.localStorage.clear())

  it('内置技能列表不为空', () => {
    assert.ok(BUILTIN_SKILLS.length >= 6)
    assert.ok(BUILTIN_SKILLS[0].id)
    assert.ok(BUILTIN_SKILLS[0].name)
    // 验证所有技能有必需的字段
    BUILTIN_SKILLS.forEach(skill => {
      assert.ok(skill.id, `技能 ${skill.name} 缺少 id`)
      assert.ok(skill.name, `技能缺少 name`)
      assert.ok(skill.category, `技能 ${skill.name} 缺少 category`)
      assert.ok(skill.description, `技能 ${skill.name} 缺少 description`)
    })
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
      signature: 'test-sig-1',
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
      signature: 'test-sig-1',
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
