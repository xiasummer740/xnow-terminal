/**
 * ISSUES #23：连接历史无上限增长
 *
 * `updateHistory` 里裁剪只写在"命中已有条目"那一支，新增分支直接 return ——
 * 于是**每连一个没见过的主机就无条件 unshift 一条**，永不裁剪。
 * 对照同一族的 `addCmdHistory`（store/common.js）：它的裁剪写在 if/else **外面**，
 * 两支都生效 —— 说明这是漏写，不是有意为之。
 *
 * 为什么这条现在更要紧：#22 修完之前 `find` 默认只给 1000 条，撑死也就 1000；
 * #22 之后启动会把整张表读进来，而 `sys-menu/history.jsx` 是 `props.history.map(...)`
 * **不切片**、全量渲染 —— 历史有多长就渲染多少个节点。
 *
 * 测试手法说明：tab.js 的依赖链里有 .jsx 和 .png（Vite 能处理，Node 不能），
 * 直接 import 进不来，而 node_modules 里没有 esbuild 可做 JSX 转换（见 #13）。
 * 所以这里**把函数源码原文抠出来**，用 new Function 注入依赖执行 ——
 * 跑的是生产代码本身，不是另写一份等价实现（另写一份等于测试自己）。
 */

process.env.NODE_ENV = 'development'

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const { resolve } = require('node:path')
const { execFileSync } = require('node:child_process')
const { isDeepStrictEqual } = require('node:util')

const ROOT = resolve(__dirname, '../..')
const TAB_JS = resolve(ROOT, 'src/client/store/tab.js')
const HEADER = 'Store.prototype.updateHistory = function (tab) {'

// #23 修复前的最后一步（就是 #22 那个提交）。写死哈希不用 HEAD：
// HEAD 会随着我这次提交变成修好的版本，反证会自己失效（#49 踩过这个坑）。
const PRE_FIX_REV = '00b7f1c50a8d527e35f877765c3fd9a3f4e9ace1'

/**
 * 按大括号配平，从源码里抠出 updateHistory 的函数体（不含外层大括号）
 */
function extractBody (source) {
  const start = source.indexOf(HEADER)
  if (start === -1) {
    return null
  }
  const open = source.indexOf('{', start + HEADER.length - 1)
  let depth = 0
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') {
      depth++
    } else if (source[i] === '}') {
      depth--
      if (depth === 0) {
        return source.slice(open + 1, i)
      }
    }
  }
  return null
}

/**
 * 把抠出来的源码原文变成一个可执行函数，依赖全部注入。
 * `action` 的语义照 manate 的实现：只负责把一批写操作合成一次通知，本身直接执行
 * （node_modules/manate/dist/cjs/events/write-emitter.js）。
 */
function buildUpdateHistory (source) {
  const body = extractBody(source)
  assert.ok(body, '没能从源码里抠出 updateHistory —— 函数头变了？提取逻辑要跟着改')
  // 防"抠歪了还静默跑过"：抠出来的必须确实是这个函数
  assert.match(body, /tabPropertiesExcludes/, '抠出来的不是 updateHistory')
  assert.match(body, /disableConnectionHistory/, '抠出来的不是 updateHistory')
  assert.ok(body.length > 500, '抠出来的函数体太短，多半是配平抠错了')

  // new Function 平时是坑（等于 eval），这里是有意的：
  // 要执行的字符串来自**本仓库自己的源码文件**（读过 git 校验的那份），
  // 不含任何外部/用户输入；而且不这么做就只能另写一份等价实现 —— 那等于自己测自己。
  /* eslint-disable-next-line no-new-func */
  const fn = new Function(
    'window', 'isEqual', 'deepCopy', 'uid', 'action', 'maxHistory', 'tab',
    body
  )
  let seq = 0
  return {
    call (store, tab) {
      return fn(
        { store },
        isDeepStrictEqual,
        (o) => JSON.parse(JSON.stringify(o)),
        () => 'id-' + (++seq),
        (f) => (...a) => f(...a),
        MAX_HISTORY,
        tab
      )
    }
  }
}

const SRC_NOW = fs.readFileSync(TAB_JS, 'utf8')
const SRC_OLD = execFileSync('git', ['show', `${PRE_FIX_REV}:src/client/store/tab.js`], {
  cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
})

// maxHistory 的真值从 constants.js 读，不写死 —— 写死的话改了常量两边就脱钩
const MAX_HISTORY = Number(
  /export const maxHistory\s*=\s*(\d+)/.exec(
    fs.readFileSync(resolve(ROOT, 'src/client/common/constants.js'), 'utf8')
  )[1]
)

function newStore () {
  return { history: [], config: { disableConnectionHistory: false } }
}

const distinctTab = (i) => ({ host: `10.0.0.${i}`, port: 22 })
const sameTab = { host: '10.0.0.1', port: 22 }

describe('连接历史不得无上限增长（ISSUES #23）', () => {
  test('前提：maxHistory 读到了合理值', () => {
    assert.ok(Number.isInteger(MAX_HISTORY), 'maxHistory 没解析出来')
    assert.ok(MAX_HISTORY > 0 && MAX_HISTORY < 10000, 'maxHistory 值离谱：' + MAX_HISTORY)
  })

  test('连 200 个**不同**主机，history 必须被裁到上限内', () => {
    const { call } = buildUpdateHistory(SRC_NOW)
    const store = newStore()
    for (let i = 0; i < 200; i++) {
      call(store, distinctTab(i))
    }
    assert.ok(
      store.history.length <= MAX_HISTORY,
      `无上限增长：连了 200 个不同主机后 history 有 ${store.history.length} 条（上限 ${MAX_HISTORY}）`
    )
    assert.equal(store.history.length, MAX_HISTORY, '应该恰好填满到上限')
  })

  test('保留的是**最近**的，不是最早的', () => {
    const { call } = buildUpdateHistory(SRC_NOW)
    const store = newStore()
    for (let i = 0; i < 200; i++) {
      call(store, distinctTab(i))
    }
    // unshift 把新的放前面，pop 砍掉尾巴 = 砍最旧的
    assert.equal(store.history[0].tab.host, '10.0.0.199', '最新的一条不在最前')
    assert.equal(
      store.history[store.history.length - 1].tab.host,
      `10.0.0.${200 - MAX_HISTORY}`,
      '最旧的一条不对 —— 砍错方向了'
    )
  })

  test('重复连同一个主机仍然只占一条，且 count 累加（老行为不许坏）', () => {
    const { call } = buildUpdateHistory(SRC_NOW)
    const store = newStore()
    for (let i = 0; i < 30; i++) {
      call(store, sameTab)
    }
    assert.equal(store.history.length, 1, '同一个主机不该占多条')
    assert.equal(store.history[0].count, 30, 'count 没有累加')
  })

  test('正好等于上限时不裁（边界）', () => {
    const { call } = buildUpdateHistory(SRC_NOW)
    const store = newStore()
    for (let i = 0; i < MAX_HISTORY; i++) {
      call(store, distinctTab(i))
    }
    assert.equal(store.history.length, MAX_HISTORY)
    // 再加一条才该裁
    call(store, distinctTab(999))
    assert.equal(store.history.length, MAX_HISTORY)
  })

  test('关掉连接历史时一条都不记（老行为不许坏）', () => {
    const { call } = buildUpdateHistory(SRC_NOW)
    const store = newStore()
    store.config.disableConnectionHistory = true
    for (let i = 0; i < 10; i++) {
      call(store, distinctTab(i))
    }
    assert.equal(store.history.length, 0)
  })

  test('没有 host/type 的 tab 不进历史（老行为不许坏）', () => {
    const { call } = buildUpdateHistory(SRC_NOW)
    const store = newStore()
    call(store, { foo: 'bar' })
    assert.equal(store.history.length, 0)
  })
})

// ── 反证：同一份测试跑在修复前的源码上，必须变红 ──────────────

describe('反证：修复前的源码挡不住这条', () => {
  test('🔴 同样连 200 个不同主机，旧版涨到 200 条', () => {
    const { call } = buildUpdateHistory(SRC_OLD)
    const store = newStore()
    for (let i = 0; i < 200; i++) {
      call(store, distinctTab(i))
    }
    assert.equal(
      store.history.length, 200,
      '前提失效：旧版居然没涨到 200 —— 那 #23 就不是这个问题'
    )
  })

  test('旧版确实只在"命中已有条目"那一支里出现 maxHistory', () => {
    const oldBody = extractBody(SRC_OLD)
    const newBody = extractBody(SRC_NOW)
    // 旧版只有一处裁剪（else 支），新版两处（新增支 + else 支）
    assert.equal(
      (oldBody.match(/maxHistory/g) || []).length, 1,
      '旧版出现次数变了，提取或前提要重看'
    )
    assert.equal(
      (newBody.match(/maxHistory/g) || []).length, 2,
      '新版裁剪没有同时覆盖两支'
    )
  })
})
