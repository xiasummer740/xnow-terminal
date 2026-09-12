/**
 * ISSUES #31：SSRF 防护有洞，且 httpFetch 压根没接防护
 *
 * 实测过的三个绕过（原版 `isPrivateHost` 全部放行）：
 *   · `[::ffff:127.0.0.1]`  —— IPv6 映射写法没认出来
 *   · `169.254.169.254`     —— **云元数据**地址段压根没覆盖（拿到它 = 拿到云凭证）
 *   · `127.0.0.1.nip.io`    —— 公开域名解析到环回，纯字符串比对永远看不出来
 *
 * 这个文件除了验新版能挡住，还**把旧版实现抄进来跑同一批用例**
 * （见 "旧版确实有洞" 那条）—— 不然"修了个没坏的东西"也看不出来。
 *
 * DNS 是 stub 的：真去查 nip.io 会让单测依赖外网，而且结果不可控。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '../..')

// ── DNS stub（必须在 require 被测模块之前装上）──────────────────────
const DNS_TABLE = {
  '127.0.0.1.nip.io': [{ address: '127.0.0.1', family: 4 }],
  '169.254.169.254.nip.io': [{ address: '169.254.169.254', family: 4 }],
  'lan-monitor.local': [{ address: '192.168.1.50', family: 4 }],
  'public.example.com': [{ address: '93.184.216.34', family: 4 }],
  // 同一个域名既有公网又有内网地址（DNS rebinding 的典型形态）→ 必须算内网
  'rebind.example.com': [
    { address: '93.184.216.34', family: 4 },
    { address: '127.0.0.1', family: 4 }
  ]
}
const originalLoad = Module._load
Module._load = function (request, parent) {
  if (request === 'dns') {
    return {
      promises: {
        lookup: async (hostname) => {
          if (DNS_TABLE[hostname]) return DNS_TABLE[hostname]
          const e = new Error('getaddrinfo ENOTFOUND ' + hostname)
          e.code = 'ENOTFOUND'
          throw e
        }
      }
    }
  }
  return originalLoad.apply(this, arguments)
}
const guard = require(resolve(ROOT, 'src/app/lib/ssrf-guard.js'))
Module._load = originalLoad

/** 旧版实现（照抄 ISSUES 里的原代码），用来反证"这个修复确实修了东西" */
function oldIsPrivateHost (hostname) {
  const lower = hostname.toLowerCase()
  if (['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'].includes(lower)) return true
  const m = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    if (a === 10) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 127) return true
  }
  return false
}

const OLD_BYPASSES = [
  '[::ffff:127.0.0.1]', // IPv6 映射
  '::ffff:a9fe:a9fe', // new URL() 归一化后的同一条
  '169.254.169.254', // 云元数据
  'metadata.google.internal'
]

test('🔴 旧版确实有洞 —— 这条证明下面修的是真问题，不是在修没坏的东西', () => {
  OLD_BYPASSES.forEach((h) => {
    assert.equal(oldIsPrivateHost(h), false, `前提失效：旧版居然挡住了 ${h}`)
  })
})

test('新版把旧版的洞全补上', () => {
  OLD_BYPASSES.forEach((h) => {
    assert.equal(guard.isPrivateHost(h), true, `仍然放行: ${h}`)
  })
})

test('IPv6 映射写法要还原成 IPv4 再判（new URL() 会重写成十六进制）', () => {
  // 这是关键：URL 把 [::ffff:169.254.169.254] 重写成 ::ffff:a9fe:a9fe，
  // 只按 "::ffff:" + 点分十进制的去想会漏掉
  assert.equal(guard.ipv4FromMapped('::ffff:a9fe:a9fe'), '169.254.169.254')
  assert.equal(guard.ipv4FromMapped('::ffff:127.0.0.1'), '127.0.0.1')
  assert.equal(guard.isPrivateHost('::ffff:a9fe:a9fe'), true)
  assert.equal(guard.isPrivateHost('::ffff:7f00:1'), true) // 127.0.0.1
})

test('内网/环回/链路本地/保留段都要挡住', () => {
  const blocked = [
    'localhost', 'LOCALHOST', 'foo.localhost',
    '127.0.0.1', '127.1.2.3', '0.0.0.0',
    '10.1.2.3', '192.168.1.1', '172.16.0.1', '172.31.255.255',
    '169.254.169.254', '100.64.0.1',
    '198.18.0.1', '224.0.0.1', '255.255.255.255',
    '::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1',
    '[::1]', 'metadata.google.internal', 'instance-data'
  ]
  const missed = blocked.filter(h => guard.isPrivateHost(h) !== true)
  assert.deepEqual(missed, [], '没挡住的:\n' + missed.join('\n'))
})

test('公网地址要放行（不能矫枉过正把 AI 抓网页也堵死）', () => {
  const allowed = ['8.8.8.8', '93.184.216.34', '172.32.0.1', '172.15.0.1', 'example.com']
  const wronglyBlocked = allowed.filter(h => guard.isPrivateHost(h) === true)
  assert.deepEqual(wronglyBlocked, [], '被误挡的:\n' + wronglyBlocked.join('\n'))
})

test('域名解析到内网也要挡 —— nip.io 这类纯字符串看不出来', async () => {
  assert.equal(await guard.resolvesToPrivate('127.0.0.1.nip.io'), true)
  assert.equal(await guard.resolvesToPrivate('public.example.com'), false)
})

test('一个域名解析出多个地址时，只要有一个内网就算内网', async () => {
  assert.equal(await guard.resolvesToPrivate('rebind.example.com'), true)
})

test('解析不出来时放行（解析失败的话请求本身也连不上，不该让 DNS 抖动误伤）', async () => {
  assert.equal(await guard.resolvesToPrivate('nxdomain.example.invalid'), false)
})

test('已在用 IP 字面量时不再查 DNS', async () => {
  // 查了也不影响结果，但没必要多一次网络往返
  assert.equal(await guard.resolvesToPrivate('127.0.0.1'), false)
})

// ── httpFetch 的窄策略：内网必须放行，否则砍掉监控功能 ──────────────

test('🔴 监控用的内网地址必须放行 —— 挡掉就等于砍掉 netdata/哪吒', () => {
  const mustAllow = ['192.168.1.50', '10.0.0.7', '172.16.5.5', '127.0.0.1', 'lan-monitor.local']
  const wronglyBlocked = mustAllow.filter(h => guard.isLinkLocalOrReserved(h) === true)
  assert.deepEqual(wronglyBlocked, [], '被误挡的监控地址:\n' + wronglyBlocked.join('\n'))
})

test('但云元数据那一段（169.254/16）任何监控都不可能指向，必须挡', () => {
  assert.equal(guard.isLinkLocalOrReserved('169.254.169.254'), true)
  assert.equal(guard.isLinkLocalOrReserved('169.254.0.1'), true)
  assert.equal(guard.isLinkLocalOrReserved('::ffff:a9fe:a9fe'), true)
  assert.equal(guard.isLinkLocalOrReserved('fe80::1'), true)
  assert.equal(guard.isLinkLocalOrReserved('metadata.google.internal'), true)
  assert.equal(guard.isLinkLocalOrReserved('0.0.0.0'), true)
})

test('窄策略也要查 DNS —— 否则 169.254.169.254.nip.io 绕过字符串判定', async () => {
  assert.equal(await guard.resolvesToLinkLocalOrReserved('169.254.169.254.nip.io'), true)
  // 内网监控域名不能被这道闸误伤
  assert.equal(await guard.resolvesToLinkLocalOrReserved('lan-monitor.local'), false)
})

test('空主机名一律拒绝（不猜、不放行）', () => {
  assert.equal(guard.isPrivateHost(''), true)
  assert.equal(guard.isPrivateHost(null), true)
  assert.equal(guard.isPrivateHost(undefined), true)
  assert.equal(guard.isLinkLocalOrReserved(''), true)
})

test('末尾带点的 FQDN 与不带点是同一台（别用 example.com. 绕过）', () => {
  assert.equal(guard.normalizeHostname('LOCALHOST.'), 'localhost')
  assert.equal(guard.isPrivateHost('localhost.'), true)
  assert.equal(guard.isPrivateHost('127.0.0.1.'), true)
})
