/**
 * ISSUES #47：SSH 算法套件里混着已破解的，而且**每次连接都在报价**
 *
 * 原来 `diffie-hellman-group1-sha1`（1024 位 Oakley Group 2，Logjam）和
 * `hmac-md5` 系列直接摆在 default 档里。这等于客户端**主动提议**用这些套件，
 * 中间人可以把双方降级到已破解的算法上。
 *
 * 现在分两档：default 只报强套件；老设备握不上手时 `reTryAltAlg()` 用 alt 档重试。
 * 所以这个文件要守住两件事，缺一不可：
 *
 *   ① default 里不能再出现已破解套件（否则等于没改）
 *   ② alt 档**必须真的能用** —— 它是"老设备还能连"的唯一指望
 *
 * ② 不是走过场。写这个改动时实机验证才发现：alt 档的 cipher 里塞了
 * `blowfish-cbc` / `arcfour256` / `arcfour128` / `arcfour`，而**这个 ssh2 构建
 * 根本不支持它们**。ssh2 对显式数组里不认识的算法名是**直接抛错**
 * （`generateAlgorithmList` → `Unsupported algorithm: X`），也就是说
 * `algAlt()` 一调用就抛，`reTryAltAlg()` 这条兜底路径**从来没成功过**。
 * 光删 default 不修 alt = 老设备从"第一次就能连"变成"两次都连不上"，是**倒退**。
 * 下面「每个算法名都是 ssh2 认识的」那条就是钉住这个坑的。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '../..')
const { algDefault, algAlt } = require(resolve(ROOT, 'src/app/server/ssh2-alg.js'))

const constants = require('@electerm/ssh2/lib/protocol/constants')

/** tier 的键名 → ssh2 里对应的受支持算法表 */
const SUPPORTED_BY_KEY = {
  kex: constants.SUPPORTED_KEX,
  cipher: constants.SUPPORTED_CIPHER,
  hmac: constants.SUPPORTED_MAC,
  compress: constants.SUPPORTED_COMPRESSION,
  serverHostKey: constants.SUPPORTED_SERVER_HOST_KEY
}

/** 已破解 / 过弱，只允许出现在重试档 */
const BROKEN_KEX = ['diffie-hellman-group1-sha1']
const BROKEN_HMAC = ['hmac-md5', 'hmac-md5-96']

/** 遍历一个档位里的每个算法名 */
function eachAlgo (tier, fn) {
  Object.keys(SUPPORTED_BY_KEY).forEach((key) => {
    (tier[key] || []).forEach((name) => fn(key, name))
  })
}

test('default 档不再报价已破解的 kex / MAC', () => {
  const d = algDefault()
  BROKEN_KEX.forEach((name) => {
    assert.ok(!d.kex.includes(name), `default 不该再报价 ${name}`)
  })
  BROKEN_HMAC.forEach((name) => {
    assert.ok(!d.hmac.includes(name), `default 不该再报价 ${name}`)
  })
})

test('default 档保留 sha1 —— 大量在役设备只认它，一刀切会连不上', () => {
  const d = algDefault()
  // OpenSSH 自己也仍然默认启用 sha1 系列；真正已破解的是 group1（1024 位）和 md5
  assert.ok(d.kex.includes('diffie-hellman-group14-sha1'))
  assert.ok(d.kex.includes('diffie-hellman-group-exchange-sha1'))
  assert.ok(d.hmac.includes('hmac-sha1'))
  assert.ok(d.hmac.includes('hmac-sha1-96'))
})

test('重试档把已破解套件加回来（老设备只认这些时的兜底）', () => {
  const a = algAlt()
  BROKEN_KEX.forEach((name) => assert.ok(a.kex.includes(name)))
  BROKEN_HMAC.forEach((name) => assert.ok(a.hmac.includes(name)))
})

test('重试档是 default 的超集 —— 不能顺手把强算法弄丢', () => {
  const d = algDefault()
  const a = algAlt()
  Object.keys(SUPPORTED_BY_KEY).forEach((key) => {
    const altList = a[key] || []
    ;(d[key] || []).forEach((name) => {
      assert.ok(altList.includes(name), `alt 档漏了 default 里的 ${key}:${name}`)
    })
  })
})

test('🔴 两档里的每个算法名 ssh2 都认识 —— 否则该档一调用就抛，兜底变空文', () => {
  ;[['default', algDefault()], ['alt', algAlt()]].forEach(([tierName, tier]) => {
    eachAlgo(tier, (key, name) => {
      assert.ok(
        SUPPORTED_BY_KEY[key].includes(name),
        `${tierName} 档的 ${key} 里有 ssh2 不支持的算法 "${name}"，` +
        'ssh2 会直接抛 Unsupported algorithm —— 这一档等于用不了'
      )
    })
  })
})

test('ssh-dss 只在重试档（太弱，不该主动报价）', () => {
  assert.ok(!(algDefault().serverHostKey || []).includes('ssh-dss'))
  assert.ok(algAlt().serverHostKey.includes('ssh-dss'))
})

test('3des-cbc 只在重试档', () => {
  assert.ok(!(algDefault().cipher || []).includes('3des-cbc'))
  assert.ok(algAlt().cipher.includes('3des-cbc'))
})

test('兜底路径真的接在"握手失败"上，不是写着好看', () => {
  const src = fs.readFileSync(resolve(ROOT, 'src/app/server/session-ssh.js'), 'utf8')
  // 正常连接用 default
  assert.match(src, /algorithms:\s*algDefault\(\)/)
  // 重试时换成 alt
  assert.match(src, /reTryAltAlg\s*\(\)[\s\S]{0,200}algorithms\s*=\s*algAlt\(\)/)
})
