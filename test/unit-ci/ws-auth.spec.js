/**
 * ISSUES #3：本机 WS 服务的鉴权零件
 *
 * 分三块验：
 *   1. 来源校验 —— 网页能往本机端口发 WS（不走 CORS 预检），Origin 是第二道锁
 *   2. token 比对 —— 定长比较，长度不同直接否
 *   3. token 生成 —— 强度够，且不再复用给 ID 的短 uid
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isLoopbackOrigin, tokenEquals } = require('../../src/app/server/ws-origin')
const { generateWsToken } = require('../../src/app/common/ws-token')
const fsFunctions = require('../../src/app/common/fs-functions')

test('回环来源放行，站点来源一律拒绝', () => {
  const allowed = [
    'http://127.0.0.1:5570',
    'http://127.0.0.1:34567',
    'https://localhost:8080',
    'http://localhost',
    'http://[::1]:5570'
  ]
  for (const o of allowed) {
    assert.equal(isLoopbackOrigin(o), true, `应放行：${o}`)
  }

  const blocked = [
    'https://evil.com',
    'http://evil.com:5570',
    // 关键用例：站点伪造回环字样的域名，不能被当成回环
    'http://127.0.0.1.evil.com',
    'http://localhost.evil.com',
    'http://notlocalhost',
    // DNS rebinding：浏览器发的仍是攻击者域名
    'http://rebind.attacker.net',
    'null'
  ]
  for (const o of blocked) {
    assert.equal(isLoopbackOrigin(o), false, `应拒绝：${o}`)
  }
})

test('没有 Origin 头放行（非浏览器客户端，仍受 token 约束）', () => {
  assert.equal(isLoopbackOrigin(undefined), true)
  assert.equal(isLoopbackOrigin(''), true)
  assert.equal(isLoopbackOrigin(null), true)
})

test('token 比对：正确通过，错误/长度不符/非字符串一律否', () => {
  const t = generateWsToken()
  assert.equal(tokenEquals(t, t), true)
  assert.equal(tokenEquals('wrong', t), false)
  assert.equal(tokenEquals(t.slice(0, -1), t), false)
  assert.equal(tokenEquals(t + 'x', t), false)
  assert.equal(tokenEquals('', t), false)
  assert.equal(tokenEquals(null, t), false)
  assert.equal(tokenEquals(undefined, t), false)
  assert.equal(tokenEquals(123, t), false)
  assert.equal(tokenEquals({}, t), false)
  // 服务端没拿到 token（env 缺失）时不能让空串意外通过
  assert.equal(tokenEquals('', ''), true, '空对空相等 —— 所以调用方必须保证 env 有值')
})

test('token 强度：256 bit 且每次不同', () => {
  const a = generateWsToken()
  const b = generateWsToken()
  assert.notEqual(a, b, '两次生成不能相同')
  // base64url 编码 32 字节 = 43 字符
  assert.equal(a.length, 43, `长度应为 43，实际 ${a.length}`)
  assert.match(a, /^[A-Za-z0-9_-]+$/, 'base64url 字符集，不含需要转义的字符')
  // 旧实现是 nanoid(7) —— 7 个字符 42 bit，明显不够
  assert.ok(a.length > 7)
})

test('文件操作名单：是数组、无重复、含前端实际用到的全部名字', () => {
  assert.ok(Array.isArray(fsFunctions))
  assert.equal(new Set(fsFunctions).size, fsFunctions.length, '名单不应有重复项')
  // 前端真实会发过来的名字（grep window.fs.* 得到），少一个就会误伤功能
  const used = [
    'access', 'closeCustom', 'openCustom', 'readCustom', 'readdir',
    'readFile', 'realpath', 'statCustom', 'writeCustom', 'writeFile'
  ]
  for (const n of used) {
    assert.ok(fsFunctions.includes(n), `名单缺少前端在用的函数：${n}`)
  }
  // 原型链成员绝不能进名单
  for (const bad of ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf']) {
    assert.ok(!fsFunctions.includes(bad), `名单不应包含原型链成员：${bad}`)
  }
})
