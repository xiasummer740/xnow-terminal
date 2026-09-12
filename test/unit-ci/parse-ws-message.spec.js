/**
 * ISSUES #42：会话 WS 收到畸形 JSON 会打死整个会话进程
 *
 * 原来 sftp / transfer / 升级 三条 WS 路径都是裸的 `JSON.parse(message)`，
 * throw 发生在 `ws.on('message')` 回调里 → `uncaughtException` → 会话进程
 * `cleanup()` + `process.exit(0)`。那个进程里挂着**同一个会话的全部终端**，
 * 所以一条脏消息 = 用户所有标签页一起断。
 *
 * 这里测的就是"丢消息，不断连接"这个选择，外加一件静态检查：
 * **调用方真的用上了它**（不然修了模块、留了裸调用，等于没修）。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const fs = require('fs')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '../..')

// parse-ws-message 经 ../common/log 拉进 electron-log（进而要 generated 的
// ../package.json），纯 node 里加载不动。只为拿日志、不关心它写了什么，直接替掉。
const logged = []
const originalLoad = Module._load
Module._load = function (request, parent) {
  if (/^\.\.\/common\/log$/.test(request) && parent && /parse-ws-message/.test(parent.filename)) {
    return {
      error: (...args) => logged.push(args),
      info: () => {},
      warn: () => {}
    }
  }
  return originalLoad.apply(this, arguments)
}
const { parseWsMessage } = require(resolve(ROOT, 'src/app/server/parse-ws-message.js'))
Module._load = originalLoad

test('合法 JSON 正常解析（不能把正常消息也挡掉）', () => {
  assert.deepEqual(parseWsMessage('{"action":"sftp-new","id":"a"}'), {
    action: 'sftp-new',
    id: 'a'
  })
  assert.deepEqual(parseWsMessage('[1,2]'), [1, 2])
  assert.deepEqual(parseWsMessage('"plain"'), 'plain')
})

test('🔴 畸形 JSON 返回 null 而**不是抛出** —— 抛出去就是整个会话进程退出', () => {
  const bad = [
    '{"action":', // 截断
    'not json at all',
    '{a:1}', // 非法键
    '',
    '{"a":1}}', // 多余括号
    'undefined'
  ]
  bad.forEach((s) => {
    let out
    assert.doesNotThrow(() => { out = parseWsMessage(s) }, `不该抛: ${JSON.stringify(s)}`)
    assert.equal(out, null, `该返回 null: ${JSON.stringify(s)}`)
  })
})

test('Binary 帧（Buffer）同样不抛', () => {
  assert.doesNotThrow(() => parseWsMessage(Buffer.from([0x00, 0xff, 0xfe])))
  assert.equal(parseWsMessage(Buffer.from([0x00, 0xff, 0xfe])), null)
})

test('畸形消息会被记下来 —— 静默丢弃会让问题查不出来', () => {
  logged.length = 0
  parseWsMessage('{oops')
  assert.equal(logged.length, 1, '应该记一条日志')
  assert.match(logged[0][0], /不是合法 JSON/)
})

test('日志里不写消息原文（可能含用户输入/凭据），只写长度', () => {
  logged.length = 0
  parseWsMessage('{"password":"s3cr3t",')
  const text = logged[0].join(' ')
  assert.ok(!text.includes('s3cr3t'), `日志泄露了消息内容: ${text}`)
  assert.match(text, /长度/)
})

test('调用点必须用 parseWsMessage，不能留裸 JSON.parse（否则修了等于没修）', () => {
  // 判定标准不是"有没有裸 JSON.parse"，而是**这个 throw 会不会变成致命异常**：
  // 裸解析外面已经套了 try 的（dispatch-center 的 /common/s）本来就不会打死进程，
  // 不强制改写；外面没套 try 的才是 #42 要防的。
  const files = [
    'src/app/server/session-server.js',
    'src/app/server/dispatch-center.js'
  ]
  const offenders = []
  files.forEach((f) => {
    const lines = fs.readFileSync(resolve(ROOT, f), 'utf8').split('\n')
    lines.forEach((line, i) => {
      if (!/JSON\.parse\s*\(\s*message\s*\)/.test(line)) return
      // 往回看 3 行内有没有 try（允许中间夹注释/空行）
      const nearby = lines.slice(Math.max(0, i - 3), i).join('\n')
      if (!/\btry\s*\{/.test(nearby)) {
        offenders.push(`${f}:${i + 1} 裸的 JSON.parse(message)，外层没有 try —— 抛出去会打死会话进程`)
      }
    })
  })
  assert.deepEqual(offenders, [], '还有会致命的裸解析:\n' + offenders.join('\n'))
})
