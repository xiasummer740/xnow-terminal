/**
 * ISSUES #36：AI 能用的工具，必须和 store 能干的活对齐
 *
 * **缺陷类别**（不是单个 case）：store 里加了能力、AI 工具层忘了跟，
 * 结果是"store 能干、AI 不会干"，而且**没有任何东西会红**。
 * 实际后果：书签能建、能看、能连，但**改不了也删不掉**；调 `delete_bookmark`
 * 直接 `throw new Error('Unknown agent tool: ...')`。
 *
 * 所以这里钉的不是"某 12 个工具存在"，而是**集合等式**：
 *
 *     agent 暴露的工具 == store 的活跃能力 ∪ Agent 独有工具
 *
 * 这样以后任何人往 mcp-handler 加一个能力却忘了在 agent-tools 里开口子，
 * 这条测试立刻红 —— 账本上不会再静静躺着第二个 #36。
 *
 * 两个方向都要钉，缺一不可：
 *   - 缺口（store 有、agent 没有）→ AI 能力缺失，就是这次修的东西
 *   - 悬空（agent 声明了、执行不了）→ 等于骗模型"你能调"，白耗轮次
 *     （技能工具那条死分支就是这一类的极端版，见最后一段）
 *
 * 测法是解析源码（两个文件都是 ESM/browser 代码，plain node 里 require 不进来）。
 * 解析必须剔除注释 —— mcp-handler 里 `quick_command` 那 4 个能力**整段是注释掉的**，
 * 不剔就会把它们当成"缺口"假报出来。下面有一条自检专门盯这个。
 */

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.resolve(__dirname, '../..')
const AGENT_TOOLS = path.join(ROOT, 'src/client/components/ai/agent-tools.js')
const MCP_HANDLER = path.join(ROOT, 'src/client/store/mcp-handler.js')
const AGENT = path.join(ROOT, 'src/client/components/ai/agent.js')

/**
 * 只留真代码：剔掉块注释和整行行注释。
 * 不剔的话，被注释掉的 case、以及说明文字里提到的工具名都会被当成真的。
 */
function codeOnly (src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .filter(l => !l.trim().startsWith('//'))
    .join('\n')
}

/** mcp-handler 里 dispatch switch 支持的活跃能力 */
function storeCapabilities () {
  const src = codeOnly(fs.readFileSync(MCP_HANDLER, 'utf8'))
  return new Set([...src.matchAll(/^\s*case '([a-zA-Z0-9_]+)'/gm)].map(m => m[1]))
}

/** agent-tools 里声明给模型的工具名（schema 侧） */
function agentToolSchemas () {
  const src = fs.readFileSync(AGENT_TOOLS, 'utf8')
  return new Set([...src.matchAll(/name: '([a-zA-Z0-9_]+)'/g)].map(m => m[1]))
}

/** agent-tools 里真正实现了的工具名（executeToolCall 的 case 侧） */
function agentToolCases () {
  const src = codeOnly(fs.readFileSync(AGENT_TOOLS, 'utf8'))
  return new Set([...src.matchAll(/^\s*case '([a-zA-Z0-9_]+)'/gm)].map(m => m[1]))
}

/**
 * Agent 独有、store 里没有对应 mcpXxx 的工具。
 * 这些不是遗漏，是设计如此：要么是 Agent 侧的交互（弹窗确认），
 * 要么直连主进程能力（文件/网络），压根不走 store。
 */
const AGENT_ONLY = [
  'confirm_with_user',
  'read_local_file',
  'write_local_file',
  'list_directory',
  'grep_files',
  'web_fetch_page'
]

/** 这次补上的 12 项 —— 显式钉住，防止哪天解析逻辑被"修"松了 */
const NEWLY_EXPOSED = [
  'get_bookmark',
  'edit_bookmark',
  'delete_bookmark',
  'list_bookmark_groups',
  'add_bookmark_group',
  'reload_tab',
  'duplicate_tab',
  'get_terminal_selection',
  'wait_for_terminal_idle',
  'zmodem_upload',
  'zmodem_download',
  'get_settings'
]

describe('#36 AI 的能力必须覆盖 store 的能力', () => {
  test('解析器自检：注释掉的 case 不算能力', () => {
    // mcp-handler 里 quick_command 那 4 个能力整段被 /* */ 包着。
    // 如果 codeOnly 失效，它们会混进 storeCapabilities，下面两条集合等式就会假红。
    const caps = storeCapabilities()
    for (const dead of [
      'list_quick_commands',
      'add_quick_command',
      'run_quick_command',
      'delete_quick_command'
    ]) {
      assert.ok(
        !caps.has(dead),
        `${dead} 是被注释掉的死能力，不该算进 store 能力表 —— codeOnly 没起作用`
      )
    }
    // 对照：紧挨着它上面的活 case 必须还在（证明不是把整块都剔没了）
    assert.ok(caps.has('list_bookmark_groups'), '剔注释剔过头了，活的 case 也没了')
  })

  test('🔴 store 能干的事，Agent 全都能干（缺口必须为空）', () => {
    const caps = storeCapabilities()
    const schemas = agentToolSchemas()
    const cases = agentToolCases()
    const gap = [...caps].filter(c => !schemas.has(c) && !cases.has(c)).sort()
    assert.deepEqual(
      gap, [],
      `store 有能力但 AI 没暴露（正是 #36 的缺陷类别）：${gap.join(', ')} —— ` +
      '往 mcp-handler 加能力的同时，必须在 agent-tools.js 里补 schema + case'
    )
    // 前提自检：别是"两边都解析成空集"导致的假绿
    assert.ok(caps.size >= 30, `store 能力只解析出 ${caps.size} 个，解析大概率坏了`)
    assert.ok(schemas.size >= 30, `agent schema 只解析出 ${schemas.size} 个，解析大概率坏了`)
  })

  test('🔴 没有"声明了却调不动"的工具（悬空必须为空）', () => {
    const schemas = agentToolSchemas()
    const cases = agentToolCases()
    const dangling = [...schemas].filter(s => !cases.has(s)).sort()
    assert.deepEqual(
      dangling, [],
      `这些工具报给了模型、执行时却会抛 Unknown agent tool：${dangling.join(', ')} —— ` +
      '等于骗模型"你能调"，白耗轮次'
    )
    const ghost = [...cases].filter(c => !schemas.has(c)).sort()
    assert.deepEqual(
      ghost, [],
      `这些工具实现了却没报给模型（模型永远不知道它存在）：${ghost.join(', ')}`
    )
  })

  test('Agent 独有工具就是那 6 个，不多不少', () => {
    const extra = [...agentToolCases()]
      .filter(c => !storeCapabilities().has(c))
      .sort()
    assert.deepEqual(
      extra, [...AGENT_ONLY].sort(),
      'Agent 独有工具清单变了。新加独有工具要同步更新本测试的 AGENT_ONLY；' +
      '如果是"store 没有对应实现"，那是设计选择，写进注释说明理由'
    )
  })

  test('这次补的 12 项一个都不能少（回归清单）', () => {
    const schemas = agentToolSchemas()
    const cases = agentToolCases()
    const missing = NEWLY_EXPOSED.filter(t => !schemas.has(t) || !cases.has(t))
    assert.deepEqual(
      missing, [],
      `#36 补过的工具又没了：${missing.join(', ')}`
    )
    // 用户实际报的那两件事，单独再钉一次
    assert.ok(schemas.has('edit_bookmark') && cases.has('edit_bookmark'), '书签改不了了')
    assert.ok(schemas.has('delete_bookmark') && cases.has('delete_bookmark'), '书签删不了了')
  })
})

// ── 反证：修复前确实缺这么多 ──────────────────────────────────

describe('#36 反证：修复前缺口真实存在', () => {
  test('🔴 钉修复前那个提交，缺口正好是那 12 项', () => {
    // ⚠️ 钉字面提交号，不能写 HEAD —— 修复一提交 HEAD 就移位，钉子会反转（#40 踩过）
    const old = require('node:child_process').execFileSync(
      'git', ['show', '32db0b79:src/client/components/ai/agent-tools.js'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
    const oldSchemas = new Set([...old.matchAll(/name: '([a-zA-Z0-9_]+)'/g)].map(m => m[1]))
    const oldCases = new Set(
      [...codeOnly(old).matchAll(/^\s*case '([a-zA-Z0-9_]+)'/gm)].map(m => m[1])
    )
    const gap = [...storeCapabilities()]
      .filter(c => !oldSchemas.has(c) && !oldCases.has(c))
      .sort()
    assert.deepEqual(
      gap, [...NEWLY_EXPOSED].sort(),
      '前提失效：修复前的缺口和记录对不上 —— 要么账本记错了，要么这次的修复范围不是这 12 项'
    )
  })
})

// ── 技能工具那条死分支 ────────────────────────────────────────

describe('#36 技能自带的工具不再报给模型', () => {
  const agentSrc = fs.readFileSync(AGENT, 'utf8')
  const toolsSrc = fs.readFileSync(AGENT_TOOLS, 'utf8')
  // ⚠️ 这两段全部断言在**剔过注释**的文本上。不剔的话，上面源码里那些
  // 「曾经回一句请参考技能说明使用」的解释性注释会把断言骗过去（写这文件时
  // 第一版就是这么假红的 —— 和 #40 那处 codeOnly 是同一个坑，第二次踩了）。
  const agentCode = codeOnly(agentSrc)
  const toolsCode = codeOnly(toolsSrc)

  test('🔴 发给模型的工具清单里没有技能工具了', () => {
    // 技能工具执行不了（只会回一句"请参考技能说明使用"），报给模型就是白耗轮次
    assert.ok(
      !/agentTools\.concat\(/.test(agentCode),
      'agent.js 又把技能工具 concat 进工具清单了 —— 那些工具执行不了'
    )
    assert.ok(
      !/getSkillTools/.test(agentCode),
      'getSkillTools 还在（已无引用，属于孤儿代码）'
    )
  })

  test('🔴 执行侧的技能查表分支已删，落到 default 就是照实报错', () => {
    assert.ok(
      !/请参考技能说明使用/.test(toolsCode),
      'executeToolCall 里还留着"请参考技能说明使用"那句 —— 既然工具不报给模型了，' +
      '这句只会让人以为"其实能用"'
    )
    // default 分支的形状：只抛错，不再去技能表里找一圈
    const defaultBranch = /default:\s*\n([\s\S]*?)\n\s*\}\s*\n\}/.exec(toolsCode)
    assert.ok(defaultBranch, 'default 分支形状变了，提取要跟着改')
    assert.match(
      defaultBranch[1], /throw new Error\(`Unknown agent tool: \$\{toolName\}`\)/,
      'default 分支不再抛 Unknown agent tool 了'
    )
    assert.ok(
      !/getInstalledSkills/.test(toolsCode),
      'agent-tools.js 里还留着 getInstalledSkills —— 技能查表删干净了，import 也该删'
    )
  })

  test('技能工具仍能被读到（只是不报给模型）—— 别把技能功能一起删了', () => {
    // skill.tools 还在被技能详情 UI 和权限展示用（skill-store.jsx），
    // 这次只动了"报给模型"这一处，技能本身的功能不该受影响
    const skillSrc = fs.readFileSync(
      path.join(ROOT, 'src/client/components/ai/skill-store.jsx'), 'utf8'
    )
    assert.match(skillSrc, /skill\.tools/, '技能详情的 tools 展示被误删了')
    assert.ok(
      /skill\.tools/.test(agentSrc),
      'agent.js 里技能 tools 的读取没了 —— 可能删过头了'
    )
  })
})

// ── 参数契约：schema 说的字段，必须覆盖 store 真的会读的字段 ──
//
// 这一层专治新工具**运行时**翻车：schema 是给模型的说明书，store 方法才是
// 真正的实现。说明书少写一个字段，模型就不会传它 —— store 拿到 undefined，
// 要么抛错，要么（更糟）用一个默认值悄悄干了别的事。
// 集合等式保证"工具存在"，这一段保证"工具的字段对得上"。

describe('#36 工具声明的参数必须覆盖 store 会读的字段', () => {
  /** 取 src 中 fromIdx 之后第一个 { } 配对的内部文本（括号计数，字符串里的配对括号不影响） */
  function blockAfter (src, fromIdx) {
    const open = src.indexOf('{', fromIdx)
    if (open === -1) return ''
    let depth = 0
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') depth++
      else if (src[i] === '}') {
        depth--
        if (depth === 0) return src.slice(open + 1, i)
      }
    }
    return ''
  }

  /** 某个 store 方法体里读到的 args.xxx 字段名 */
  function storeArgsRead (methodName) {
    const src = fs.readFileSync(MCP_HANDLER, 'utf8')
    const at = src.indexOf(`Store.prototype.${methodName} = `)
    assert.ok(at !== -1, `找不到 store 方法 ${methodName}`)
    const body = blockAfter(src, src.indexOf('{', at))
    return new Set([...body.matchAll(/\bargs\.([a-zA-Z0-9_]+)/g)].map(m => m[1]))
  }

  /** 某个工具的 schema 里声明的顶层字段名 */
  function schemaProps (toolName) {
    const src = fs.readFileSync(AGENT_TOOLS, 'utf8')
    const at = src.indexOf(`name: '${toolName}'`)
    assert.ok(at !== -1, `agent-tools 里没有工具 ${toolName}`)
    // 本工具条目的终点 = 下一个工具名（或文件末尾）
    const next = src.indexOf("name: '", at + 10)
    let region = src.slice(at, next === -1 ? src.length : next)
    // 剔掉字符串字面量，免得描述里的 {"title":"..."} 被当成字段名
    region = region.replace(/'[^']*'/g, "''").replace(/"[^"]*"/g, '""')
    const propsAt = region.indexOf('properties:')
    if (propsAt === -1) return new Set()
    const props = blockAfter(region, propsAt)
    // 只取第一层的 key（嵌套对象内部的不算本工具的顶层参数）
    const keys = new Set()
    let depth = 0
    for (const line of props.split('\n')) {
      const t = line.trim()
      if (depth === 0) {
        const m = /^([a-zA-Z0-9_]+)\s*:/.exec(t)
        if (m) keys.add(m[1])
      }
      depth += (line.match(/\{/g) || []).length
      depth -= (line.match(/\}/g) || []).length
    }
    return keys
  }

  /** store 方法名 ←→ agent 工具名 的对应（这 12 项全是同名直调） */
  const PAIRS = [
    ['mcpGetBookmark', 'get_bookmark'],
    ['mcpEditBookmark', 'edit_bookmark'],
    ['mcpDeleteBookmark', 'delete_bookmark'],
    ['mcpListBookmarkGroups', 'list_bookmark_groups'],
    ['mcpAddBookmarkGroup', 'add_bookmark_group'],
    ['mcpReloadTab', 'reload_tab'],
    ['mcpDuplicateTab', 'duplicate_tab'],
    ['mcpGetTerminalSelection', 'get_terminal_selection'],
    ['mcpWaitForTerminalIdle', 'wait_for_terminal_idle'],
    ['mcpZmodemUpload', 'zmodem_upload'],
    ['mcpZmodemDownload', 'zmodem_download'],
    ['mcpGetSettings', 'get_settings']
  ]

  /**
   * 有意不写进 schema 的字段：store 读了，但不该让模型去调。
   * 每一条都要写清楚为什么 —— 这是"故意不暴露"，不是"忘了"。
   */
  const INTENTIONAL_OMISSIONS = {
    // minWait 是"命令发出后先干等多久再开始判空闲"，纯粹是内部时序补偿。
    // 模型没有理由调它，默认 1000ms 就是对的；暴露出去只会让模型瞎设一个值。
    wait_for_terminal_idle: ['minWait']
  }

  for (const [method, tool] of PAIRS) {
    test(`${tool} 的 schema 覆盖 ${method} 读的每个字段`, () => {
      const read = storeArgsRead(method)
      const declared = schemaProps(tool)
      const omissions = INTENTIONAL_OMISSIONS[tool] || []
      const missing = [...read].filter(f => !declared.has(f) && !omissions.includes(f))
      assert.deepEqual(
        missing, [],
        `${method} 会读 args.${missing.join(' / args.')}，但 ${tool} 的 schema 没声明 —— ` +
        '模型不会传这个字段，store 会拿到 undefined。要么补进 schema，' +
        '要么加进 INTENTIONAL_OMISSIONS 并写清为什么不让模型调'
      )
      // 前提自检：别是"两边都解析成空"的假绿
      if (read.size > 0) {
        assert.ok(declared.size > 0, `${tool} 的 schema 一个字段都没解析出来，解析坏了`)
      }
    })
  }

  test('这 12 项里确实有读参数的（证明上面的契约检查不是空转）', () => {
    const withArgs = PAIRS.filter(([m]) => storeArgsRead(m).size > 0)
    assert.ok(
      withArgs.length >= 8,
      `只有 ${withArgs.length} 个方法读参数，太少了 —— 解析大概率坏了`
    )
  })
})
