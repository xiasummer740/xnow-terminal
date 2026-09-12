/**
 * ISSUES #39：SSH 主机密钥校验曾经形同虚设
 *
 * 原来的实现在内存里记一份主机密钥，发现对不上时只 `console.warn` 一句
 * **然后照样连**（`return true`）。中间人把密钥换掉时，用户看不到那句警告，
 * 防护等于零 —— 而这条路径（一键部署哪吒 / VPS 监控）是要往目标机发密码和命令的。
 *
 * 现在改成 OpenSSH 的 accept-new 语义，判定逻辑在
 * `src/app/server/ssh-known-hosts.js` 的 createAcceptNewHostVerifier 里。
 * 这里测的就是这个判定：**要么放行要么拒绝，没有"警告一下继续连"的中间态**。
 *
 * 用的是真的 known_hosts 文件（临时目录里的），不是 mock —— 因为要防的正是
 * "键名对上了但内容格式对不上" 这类只在真实文件上才暴露的问题。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const crypto = require('crypto')
const fs = require('fs')
const os = require('os')
const { join, resolve } = require('path')

const ROOT = resolve(__dirname, '../..')
const MODULE_PATH = resolve(ROOT, 'src/app/server/ssh-known-hosts.js')
const {
  createAcceptNewHostVerifier,
  checkKnownHosts
} = require(MODULE_PATH)

/** SSH 线格式里的一段的编码：4 字节长度 + 内容 */
function sshString (buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf)
  const len = Buffer.alloc(4)
  len.writeUInt32BE(b.length, 0)
  return Buffer.concat([len, b])
}

/** 造一个真的 ed25519 主机公钥（线格式 blob，与 ssh2 的 getPublicSSH() 一致） */
function makeHostKey () {
  const { publicKey } = crypto.generateKeyPairSync('ed25519')
  const der = publicKey.export({ type: 'spki', format: 'der' })
  const raw = der.subarray(der.length - 32)
  return Buffer.concat([sshString('ssh-ed25519'), sshString(raw)])
}

function tempKnownHosts (t) {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'xnow-kh-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  return join(dir, 'known_hosts')
}

/** 跑一次 hostVerifier，拿到它给 ssh2 的答复（true = 放行） */
function ask (verifier, hostKey) {
  return new Promise((resolve) => {
    verifier(hostKey, (ok) => resolve(ok))
  })
}

test('第一次见这个主机：放行，并把密钥写进 known_hosts（TOFU）', async (t) => {
  const knownHostsPath = tempKnownHosts(t)
  const hostKey = makeHostKey()
  const events = []
  const verifier = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 22,
    knownHostsPath,
    onEvent: (event) => events.push(event)
  })

  assert.equal(await ask(verifier, hostKey), true, '没见过的机器应该按 accept-new 放行')

  const written = fs.readFileSync(knownHostsPath, 'utf8')
  assert.match(written, /^example\.com ssh-ed25519 /, '密钥要留在文件里，下次才认得出来')
  assert.deepEqual(events, ['host-key-added'])
})

test('同一个主机、同一个密钥：放行，且不重复追加', async (t) => {
  const knownHostsPath = tempKnownHosts(t)
  const hostKey = makeHostKey()
  const verifier = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 22,
    knownHostsPath
  })

  assert.equal(await ask(verifier, hostKey), true)
  assert.equal(await ask(verifier, hostKey), true)

  const lines = fs.readFileSync(knownHostsPath, 'utf8').trim().split('\n')
  assert.equal(lines.length, 1, '认出来就不该再写一遍，否则文件会被每次连接撑大')
})

test('🔴 同一个主机换了密钥：拒绝连接（这就是中间人攻击的样子）', async (t) => {
  const knownHostsPath = tempKnownHosts(t)
  const realKey = makeHostKey()
  const attackerKey = makeHostKey()
  assert.notEqual(realKey.toString('base64'), attackerKey.toString('base64'))

  // 先正常连过一次，信任记录里有的是 realKey
  const first = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 22,
    knownHostsPath
  })
  assert.equal(await ask(first, realKey), true)

  // 再来一次，对端递过来的是别的密钥
  const events = []
  const second = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 22,
    knownHostsPath,
    onEvent: (event) => events.push(event)
  })
  assert.equal(
    await ask(second, attackerKey),
    false,
    '密钥对不上必须拒绝 —— 改前这里警告一句就放行了，等于没校验'
  )
  assert.deepEqual(events, ['host-key-rejected'])

  // 而且不能把攻击者的密钥覆盖写进去：原记录还在，攻击者的密钥没落盘
  const { getHostKeyMeta } = require(MODULE_PATH)
  const written = fs.readFileSync(knownHostsPath, 'utf8')
  assert.ok(
    written.includes(getHostKeyMeta(realKey).keyData),
    '原来那条可信记录不能被抹掉'
  )
  assert.ok(
    !written.includes(getHostKeyMeta(attackerKey).keyData),
    '被拒绝的密钥绝不能落盘，否则下次它就变成"可信"了'
  )
})

test('被标记 @revoked 的密钥：拒绝连接', async (t) => {
  const knownHostsPath = tempKnownHosts(t)
  const hostKey = makeHostKey()
  const { getHostKeyMeta } = require(MODULE_PATH)
  const meta = getHostKeyMeta(hostKey)
  fs.writeFileSync(
    knownHostsPath,
    `@revoked example.com ${meta.keyType} ${meta.keyData}\n`
  )

  const verifier = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 22,
    knownHostsPath
  })
  assert.equal(await ask(verifier, hostKey), false)
})

test('非 22 端口：写进去的格式和认出来的格式必须是同一套', async (t) => {
  // 这一条防的是"写的时候用 [host]:port、查的时候用 host"这类不对称 ——
  // 一旦不对称，要么每次连接都认为是新主机（信任记录形同虚设），
  // 要么把老朋友当成攻击者拒掉。
  const knownHostsPath = tempKnownHosts(t)
  const hostKey = makeHostKey()
  const verifier = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 2222,
    knownHostsPath
  })

  assert.equal(await ask(verifier, hostKey), true, '第一次放行并记录')
  assert.match(fs.readFileSync(knownHostsPath, 'utf8'), /^\[example\.com\]:2222 /)

  const result = await checkKnownHosts({ host: 'example.com', port: 2222, hostKey, knownHostsPath })
  assert.equal(result.status, 'match', '自己写进去的记录，自己必须认出来')
})

test('known_hosts 读不了 / 写不了：拒绝，不赌', async (t) => {
  // fail closed —— 拿不准的时候放行，正是这个缺陷本来的样子
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'xnow-kh-'))
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }))
  const events = []
  const verifier = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 22,
    knownHostsPath: dir,
    onEvent: (event) => events.push(event)
  })

  assert.equal(await ask(verifier, makeHostKey()), false)
  assert.deepEqual(events, ['host-key-check-failed'])
})

test('审计回调自己抛异常，不能把连接判断带崩', async (t) => {
  const knownHostsPath = tempKnownHosts(t)
  const verifier = createAcceptNewHostVerifier({
    host: 'example.com',
    port: 22,
    knownHostsPath,
    onEvent: () => { throw new Error('审计系统挂了') }
  })
  assert.equal(await ask(verifier, makeHostKey()), true)
})

test('ipc.js 走的是这个验过的工厂，不再自己手写一套', () => {
  // 静态断言：判定逻辑只应该有一份。ipc.js 里如果再长出内联的 hostVerifier，
  // 说明有人绕过这里改了行为 —— 那这个 spec 就测不到真实生效的代码了。
  const text = fs.readFileSync(resolve(ROOT, 'src/app/lib/ipc.js'), 'utf8')
  assert.match(
    text,
    /hostVerifier: createAcceptNewHostVerifier\(\{/,
    'execSshCommand 必须用 createAcceptNewHostVerifier'
  )
  assert.ok(
    !/knownHostKeys/.test(text),
    '内存版信任记录应该已经删掉（它只警告不拦截，且进程重启就忘）'
  )
})

test('被拒的原因要传到用户手里，不能只留 ssh2 那句 "Host denied"', () => {
  // ssh2 校验失败时抛给调用方的是它自己那句 "Host denied (verification failed)"，
  // 不看指纹根本判断不了是"真被劫持"还是"重装了机器"。
  // 详细原因（主机、指纹、known_hosts 路径）只在这里记得到，所以必须转出去。
  const text = fs.readFileSync(resolve(ROOT, 'src/app/lib/ipc.js'), 'utf8')
  assert.match(
    text,
    /if \(event === 'host-key-rejected'\) \{\s*hostKeyRejection = detail/,
    '要先把被拒的原因记下来'
  )
  assert.match(
    text,
    /reject\(hostKeyRejection \? new Error\(hostKeyRejection\) : err\)/,
    '报错时要用记下来的那条原因'
  )
})
