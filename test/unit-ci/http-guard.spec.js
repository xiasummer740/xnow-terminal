/**
 * ISSUES #29：回环 HTTP 服务不校验 Origin/Host
 *
 * #3 只修了 WS 侧（dispatch-center / session-server 里各自 verify）。
 * HTTP 侧（server.js 的 `/run` + 静态资源）一直是裸奔的：
 * 只要能把请求发到本机端口就能拿到响应，**Host 是谁完全不看**。
 *
 * 威胁模型是 **DNS rebinding**：攻击者把自己的域名解析到 127.0.0.1，
 * 用户打开那个页面 → 页面 JS 以 `http://attacker.com:<端口>` 打到本机服务。
 * 服务看到来源是"本机"，实际是别人；而 HTTP 响应**还能被读走**（WS 至少读不到）。
 *
 * 所以这里跑的是**真 express 实例 + 真 HTTP 请求**，不是调一下谓词就完事：
 * 中间件挂的位置对不对（在所有路由之前）、真响应码是不是 403，都要实测。
 * 被测中间件是 http-guard.js 的生产原文，直接 require 进来挂上 ——
 * server.js 在模块顶层就 runServer() 了，require 不进来，才把它拆出来的。
 */

process.env.NODE_ENV = 'development'

const { describe, test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')
const net = require('node:net')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const express = require('express')

const ROOT = path.resolve(__dirname, '../..')
const httpGuard = require('../../src/app/server/http-guard')
const { isLoopbackHost, isLoopbackOrigin } = require('../../src/app/server/ws-origin')

// 一个不会被抢的随机端口由 OS 分配（listen(0)）
let guarded
let guardedPort
let bare
let barePort
let assetsDir

function listen (app) {
  return new Promise((resolve) => {
    const s = app.listen(0, '127.0.0.1', () => resolve(s))
  })
}

function close (s) {
  return new Promise((resolve) => s.close(resolve))
}

/** 发一个真请求，自己指定 Host / Origin —— node 的 http client 允许覆盖 Host */
function get (port, { host, origin, omitHost = false, path: p = '/run' } = {}) {
  return new Promise((resolve, reject) => {
    const headers = {}
    if (!omitHost && host !== undefined) {
      headers.Host = host
    }
    if (origin !== undefined) {
      headers.Origin = origin
    }
    const req = http.request(
      { host: '127.0.0.1', port, path: p, method: 'GET', headers },
      (res) => {
        let body = ''
        res.setEncoding('utf8')
        res.on('data', (d) => { body += d })
        res.on('end', () => resolve({ status: res.statusCode, body }))
      }
    )
    req.on('error', reject)
    req.end()
  })
}

before(async () => {
  assetsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnow-guard-'))
  fs.writeFileSync(path.join(assetsDir, 'secret.txt'), 'assets-are-an-attack-surface')

  // ① 带上闸门的 app —— 形状照 server.js：闸门在所有路由之前
  const g = express()
  g.use(httpGuard)
  g.get('/run', (req, res) => res.send('ok'))
  g.use(express.static(assetsDir))
  guarded = await listen(g)
  guardedPort = guarded.address().port

  // ② 不挂闸门的 app（就是修复前的形状），用来做反证
  const b = express()
  b.get('/run', (req, res) => res.send('ok'))
  b.use(express.static(assetsDir))
  bare = await listen(b)
  barePort = bare.address().port
})

after(async () => {
  await close(guarded)
  await close(bare)
  try {
    fs.rmSync(assetsDir, { recursive: true, force: true })
  } catch (_) { /* 句柄未释放，留给系统回收 */ }
})

describe('回环 HTTP 必须校验 Host / Origin（ISSUES #29）', () => {
  test('正常调用放行：Host 是回环地址', async () => {
    for (const host of ['127.0.0.1', 'localhost', '[::1]']) {
      const r = await get(guardedPort, { host: `${host}:${guardedPort}` })
      assert.equal(r.status, 200, `Host=${host} 被误伤了：${r.status}`)
      assert.equal(r.body, 'ok')
    }
  })

  test('正常调用放行：不带 Origin（非浏览器客户端）', async () => {
    const r = await get(guardedPort, { host: `127.0.0.1:${guardedPort}` })
    assert.equal(r.status, 200, '不带 Origin 被拒了 —— 会误伤脚本/命令行客户端')
  })

  test('正常调用放行：Origin 是回环地址', async () => {
    const r = await get(guardedPort, {
      host: `127.0.0.1:${guardedPort}`,
      origin: `http://127.0.0.1:${guardedPort}`
    })
    assert.equal(r.status, 200, '同源的 Origin 被拒了 —— 应用自己就用不了')
  })

  test('🔴 DNS rebinding：Host 是攻击者域名 → 403', async () => {
    const r = await get(guardedPort, { host: `attacker.com:${guardedPort}` })
    assert.equal(r.status, 403, `Host=attacker.com 竟然放行了（${r.status}）—— #29 没修上`)
  })

  test('🔴 跨站请求：Host 合法但 Origin 是外站 → 403', async () => {
    const r = await get(guardedPort, {
      host: `127.0.0.1:${guardedPort}`,
      origin: 'http://evil.example.com'
    })
    assert.equal(r.status, 403, `外站 Origin 放行了（${r.status}）`)
  })

  test('🔴 静态资源也在闸门后面（不只是 /run）', async () => {
    const bad = await get(guardedPort, {
      host: `attacker.com:${guardedPort}`,
      path: '/secret.txt'
    })
    assert.equal(bad.status, 403, '静态资源绕过了闸门 —— 这正是最容易被忽略的暴露面')

    const ok = await get(guardedPort, {
      host: `127.0.0.1:${guardedPort}`,
      path: '/secret.txt'
    })
    assert.equal(ok.status, 200, '正常回环请求被静态资源误伤了')
    assert.match(ok.body, /attack-surface/)
  })
})

describe('Host 缺失：这一条和 Origin 的规则是**反**的', () => {
  test('HTTP/1.0 不带 Host 能绕过 Node 的自检，必须被闸门拒掉', async () => {
    // Node 自己会拒掉无 Host 的 HTTP/1.1（返回 400，见下面那条）；
    // 但 HTTP/1.0 **不要求** Host，实测能一路走到 handler 里（req.headers.host === undefined）。
    // 所以"缺失即拒"不是摆设，是这条路上的唯一一道锁。
    const res = await new Promise((resolve, reject) => {
      const c = net.connect(guardedPort, '127.0.0.1', () => {
        c.write('GET /run HTTP/1.0\r\nConnection: close\r\n\r\n')
      })
      let buf = ''
      c.setEncoding('utf8')
      c.on('data', (d) => { buf += d })
      c.on('end', () => resolve(buf))
      c.on('error', reject)
    })
    assert.match(res, /^HTTP\/1\.[01] 403/, `无 Host 的 HTTP/1.0 请求没被拒：${res.split('\r\n')[0]}`)
  })

  test('HTTP/1.1 不带 Host：Node 自己就 400 了（闸门之外还有一道）', async () => {
    const c = net.connect(guardedPort, '127.0.0.1', () => {
      c.write('GET /run HTTP/1.1\r\nConnection: close\r\n\r\n')
    })
    const first = await new Promise((resolve, reject) => {
      c.setEncoding('utf8')
      c.once('data', (d) => resolve(d.split('\r\n')[0]))
      c.on('error', reject)
    })
    c.destroy()
    assert.match(first, /400/, `预期 Node 层 400，实际：${first}`)
  })

  test('谓词直接测：Host 缺失/非法一律 false', () => {
    for (const v of [undefined, null, '', '   ', 123, {}]) {
      assert.equal(isLoopbackHost(v), false, `${JSON.stringify(v)} 不该放行`)
    }
    // 对照：Origin 的规则相反，缺失要放行（非浏览器客户端）
    assert.equal(isLoopbackOrigin(undefined), true, 'Origin 缺失的规则被改坏了')
    assert.equal(isLoopbackOrigin(null), true)
  })

  test('谓词直接测：端口和大小写不影响判定', () => {
    assert.equal(isLoopbackHost('127.0.0.1:5570'), true)
    assert.equal(isLoopbackHost('LOCALHOST:5570'), true, '大小写敏感了')
    assert.equal(isLoopbackHost('[::1]:5570'), true)
    assert.equal(isLoopbackHost('[::1]'), true)
    assert.equal(isLoopbackHost('127.0.0.1'), true)
    // 别把前缀相同但不是回环的放过
    assert.equal(isLoopbackHost('127.0.0.1.evil.com'), false, '前缀匹配漏了')
    assert.equal(isLoopbackHost('localhost.evil.com'), false, '前缀匹配漏了')
    assert.equal(isLoopbackHost('127.0.0.2'), false, '127.0.0.2 不是回环名单里的')
    assert.equal(isLoopbackHost('0.0.0.0'), false)
  })
})

// ── 反证：没有闸门时，同一批请求是通的 ────────────────────────

describe('反证：修复前的形状挡不住 DNS rebinding', () => {
  test('🔴 不加闸门，attacker.com 的 Host 照样 200', async () => {
    const r = await get(barePort, { host: `attacker.com:${barePort}` })
    assert.equal(
      r.status, 200,
      '前提失效：不加闸门也被拒了 —— 那 #29 就不是"缺校验"这个问题'
    )
    assert.equal(r.body, 'ok')
  })

  test('🔴 不加闸门，静态资源也能被外站读走', async () => {
    const r = await get(barePort, { host: `attacker.com:${barePort}`, path: '/secret.txt' })
    assert.equal(r.status, 200)
    assert.match(r.body, /attack-surface/, '前提失效：裸服务竟然读不到静态资源')
  })
})

// ── 挂载位置钉死：闸门必须在所有路由之前 ──────────────────────

describe('server.js 里的挂载位置不能退化', () => {
  const SRC = fs.readFileSync(path.join(ROOT, 'src/app/server/server.js'), 'utf8')

  test('闸门挂在 /run、静态资源、WS 注册之前', () => {
    const guard = SRC.indexOf('app.use(httpGuard)')
    assert.ok(guard !== -1, 'server.js 里没挂 httpGuard')
    // 挂后面等于没加 —— 路由先匹配上就不会走到闸门
    for (const [name, marker] of [
      ['/run', "app.get('/run'"],
      ['静态资源', 'initFileServer(app)'],
      ['WS', 'initWs(app)']
    ]) {
      const at = SRC.indexOf(marker)
      assert.ok(at !== -1, `找不到 ${name} 的注册点，标记变了要同步改这里`)
      assert.ok(
        guard < at,
        `闸门挂在了 ${name} 之后（${guard} > ${at}）—— 那条路就绕过去了`
      )
    }
  })

  test('用的是 ws-origin.js 那份唯一名单，没有另抄一份', () => {
    // 名单各写各的，早晚演变成"一边放一边挡"
    assert.match(SRC, /require\('\.\/http-guard'\)/, '没引 http-guard')
    const guardSrc = fs.readFileSync(path.join(ROOT, 'src/app/server/http-guard.js'), 'utf8')
    assert.match(guardSrc, /require\('\.\/ws-origin'\)/, '闸门没从 ws-origin 取谓词')
    assert.match(guardSrc, /isLoopbackHost/, '没校验 Host')
    // 名单只该在 ws-origin.js 里出现一次
    const listInWsOrigin = /LOOPBACK_HOSTS\s*=\s*\[/.test(
      fs.readFileSync(path.join(ROOT, 'src/app/server/ws-origin.js'), 'utf8')
    )
    assert.ok(listInWsOrigin, 'ws-origin.js 里没有唯一的回环名单')
    assert.ok(
      !/'127\.0\.0\.1'/.test(guardSrc),
      'http-guard.js 里又抄了一份地址名单 —— 应该只用 ws-origin 的谓词'
    )
  })
})
