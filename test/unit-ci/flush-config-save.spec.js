/**
 * ISSUES #49：退出前不 flush 待写的配置 → 刚改的设置会丢
 *
 * 配置保存走的是 **100ms debounce**（`src/client/store/watch.js`：
 * `autoRun(..., func => debounce(func, 100))`），而两个退出处理函数
 * （`beforeExit` / `beforeExitApp`）原来**只弹确认框、不 flush** ——
 * 于是「改完设置马上关窗」时，那 100ms 窗口里的改动永远写不下去。
 * 没开 confirmBeforeExit 的话更是连提示都没有，用户只会觉得"设置没保存"。
 *
 * 修法：退出时把当前配置**再发一次** `saveUserConfig`。不依赖 debounce 定时器 ——
 * 消息派发给主进程之后，写盘在主进程完成，渲染进程随即销毁也不影响，
 * 比"等定时器到点"可靠。
 *
 * 这个测试做三件事：
 *   ① 把真实源码里的 `flushConfigSave` 抠出来执行，验行为
 *   ② 静态验两个退出处理函数**真的调了**它（改了辅助函数却忘了接上 = 没修）
 *   ③ 反证：改之前的版本在退出路径里**没有任何保存动作**（见文件末尾）
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const { execFileSync } = require('child_process')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '../..')
const SRC_PATH = resolve(ROOT, 'src/client/store/common.js')
const SRC = fs.readFileSync(SRC_PATH, 'utf8')

/** 按大括号配平，从 `function flushConfigSave () {` 抠到函数结束 */
function extractFunction (source, name) {
  const start = source.indexOf(`function ${name} () {`)
  assert.notEqual(start, -1, `源码里找不到 function ${name}`)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`${name} 的大括号没配平`)
}

// 抠出来的就是仓库里正在跑的那份代码（不是抄一遍），改了实现这里就跟着变
const FLUSH_SRC = extractFunction(SRC, 'flushConfigSave')

/** 造一个假的 window，记录所有派发出去的 IPC */
function makeWindow (config) {
  const calls = []
  return {
    calls,
    window: {
      store: { config },
      pre: {
        runGlobalAsync: (...args) => {
          calls.push(args)
          return Promise.resolve()
        }
      }
    }
  }
}

/** 在假 window 上跑真实的 flushConfigSave */
function runFlush (config) {
  const { calls, window } = makeWindow(config)
  // eslint-disable-next-line no-new-func
  const fn = new Function('window', `${FLUSH_SRC}; return flushConfigSave`)
  fn(window)()
  return calls
}

test('🔴 退出时会把当前配置派发出去 —— 这就是 #49 缺的那一步', () => {
  const config = { theme: 'dark', fontSize: 16 }
  const calls = runFlush(config)
  assert.deepEqual(calls, [['saveUserConfig', config]])
})

test('不经 debounce —— 派发是同步发生的，不依赖定时器到点', () => {
  // 关键性质：调用返回时消息**已经**交给主进程了。
  // 如果哪天有人把它改成 debounce，这个测试会挂。
  const calls = runFlush({ a: 1 })
  assert.equal(calls.length, 1, 'flush 必须同步派发，不能进 debounce')
})

test('配置为空时不派发（别拿空对象覆盖磁盘上的配置）', () => {
  assert.deepEqual(runFlush({}), [])
  assert.deepEqual(runFlush(null), [])
  assert.deepEqual(runFlush(undefined), [])
})

test('配置缺失时不抛 —— 退出路径上抛异常会打断关窗', () => {
  // beforeExit 里紧接着就要读 window.store.config，这里炸了后面全废
  assert.doesNotThrow(() => runFlush(undefined))
  assert.doesNotThrow(() => runFlush(null))
  assert.doesNotThrow(() => runFlush({}))
})

// ── 静态接线检查：接了才算修完 ────────────────────────────────────

/** 取出 `Store.prototype.X = function (...) {` 的函数体（大括号配平） */
function extractMethodBody (source, name) {
  const start = source.indexOf(`Store.prototype.${name} = function`)
  assert.notEqual(start, -1, `源码里找不到 Store.prototype.${name}`)
  let depth = 0
  for (let i = source.indexOf('{', start); i < source.length; i++) {
    if (source[i] === '{') depth++
    else if (source[i] === '}') {
      depth--
      if (depth === 0) return source.slice(start, i + 1)
    }
  }
  throw new Error(`${name} 的大括号没配平`)
}

test('两个退出处理函数都调了 flushConfigSave（漏一个就有一条路径丢数据）', () => {
  const missing = ['beforeExit', 'beforeExitApp'].filter((name) => {
    const body = extractMethodBody(SRC, name)
    return !/\bflushConfigSave\s*\(\s*\)/.test(body)
  })
  assert.deepEqual(missing, [], '这些退出路径没有 flush:\n' + missing.join('\n'))
})

test('flush 必须在弹确认框之前调用 —— 用户点取消也不该丢已改的设置', () => {
  // 放在 Modal.confirm 后面的话，"点了取消"这条路径就绕过去了
  const body = extractMethodBody(SRC, 'beforeExit')
  const flushAt = body.indexOf('flushConfigSave(')
  const modalAt = body.indexOf('Modal.confirm')
  assert.notEqual(modalAt, -1, 'beforeExit 里应该有 Modal.confirm')
  assert.ok(flushAt < modalAt, 'flushConfigSave 必须在 Modal.confirm 之前')
})

// ── 反证 ────────────────────────────────────────────────────────

test('🔴 改之前的版本在退出路径里确实没有任何保存动作', () => {
  // 不然就是"修了个没坏的东西"。取 HEAD 的版本（此刻工作区已改，只能从 git 里取）
  let old
  try {
    old = execFileSync('git', ['show', 'HEAD:src/client/store/common.js'], {
      cwd: ROOT,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024
    })
  } catch (e) {
    assert.fail('取不到 HEAD 版本，无法反证：' + e.message)
  }
  const leaky = ['beforeExit', 'beforeExitApp'].filter((name) => {
    const body = extractMethodBody(old, name)
    return /saveUserConfig|flushConfigSave/.test(body)
  })
  assert.deepEqual(
    leaky,
    [],
    '前提失效：旧版这些路径里居然已经有保存动作了 —— 那 #49 就不是这个问题'
  )
})
