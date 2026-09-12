/**
 * ISSUES #44：单实例命名管道无鉴权
 *
 * 原来 `net.createServer` 收到什么就转发什么 —— 本机任意进程连上管道、
 * 写一段 JSON，就会被当成"第二个实例"转发给渲染进程执行：
 * `options.privateKeyPath` 会被 readFile 出来当私钥发到 `options.host`
 * （任意文件读取 + 外发），`options.batchOp` 同理。
 *
 * 修法是共享 token 握手。这个文件既验「自己人能通」，也验
 * **「没带 token / 带错 token 的人通不了」** —— 后者才是这条 issue 的重点，
 * 只验前者的话，把校验删掉测试照样全绿。
 *
 * 这里连的是**真的命名管道**（Windows）/ Unix socket，不是打桩的网络层，
 * 所以握手是端到端跑通的。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const net = require('net')
const fs = require('fs')
const os = require('os')
const path = require('path')
const crypto = require('crypto')

const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xnow-si-'))
// 管道名带上随机后缀：并行/重复跑测试时不会撞上别的实例
const APP_NAME = 'xnow-si-test-' + crypto.randomBytes(4).toString('hex')

// userData 可切换：验证"token 写不进去"的降级路径时要指向一个不存在的目录
let currentUserData = userDataDir

const originalLoad = Module._load
Module._load = function (request, parent) {
  if (request === 'electron') {
    return {
      app: {
        getName: () => APP_NAME,
        getPath: (name) => (name === 'userData' ? currentUserData : os.tmpdir()),
        on: () => {}
      }
    }
  }
  if (request === './glob-state' && parent && /single-instance/.test(parent.filename)) {
    return { get: () => null, set: () => {} }
  }
  return originalLoad.apply(this, arguments)
}
const si = require('../../src/app/lib/single-instance')
Module._load = originalLoad

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function startServer (onSecondInstance) {
  return new Promise((resolve) => {
    const server = si.startSocketServer(onSecondInstance)
    server.once('listening', () => resolve(server))
  })
}

/** 绕过 si 的封装，直接往管道里写任意内容（模拟"本机别的进程"） */
function rawWrite (payload) {
  return new Promise((resolve) => {
    const client = net.createConnection(
      process.platform === 'win32'
        ? `\\\\.\\pipe\\${APP_NAME}-instance-lock`
        : path.join(os.tmpdir(), `${APP_NAME}-instance.sock`),
      () => {
        client.write(payload)
        client.end()
      }
    )
    client.on('close', resolve)
    client.on('error', resolve)
  })
}

test('sameToken：只有完全相等才算通过，类型/长度不符一律否', () => {
  const t = crypto.randomBytes(32).toString('hex')
  assert.equal(si.sameToken(t, t), true)
  assert.equal(si.sameToken(t, t.slice(0, -1)), false)
  assert.equal(si.sameToken(t, t + 'a'), false)
  assert.equal(si.sameToken(t, t.toUpperCase()), false)
  assert.equal(si.sameToken(t, ''), false)
  assert.equal(si.sameToken(t, null), false)
  assert.equal(si.sameToken(t, undefined), false)
  assert.equal(si.sameToken(t, { token: t }), false) // 别被对象绕过
  assert.equal(si.sameToken(null, null), false)
})

test('没有主实例在跑时返回 false（靠连接被拒，而不是靠 token 文件缺席）', async () => {
  fs.rmSync(path.join(userDataDir, 'instance-token'), { force: true })
  assert.equal(si.readToken(), null)
  // 关键：token 读不到**也要照连**。要是这里因为"没 token"就早退 false，
  // 那降级模式（主实例 token 写不进去、什么 token 都收）下第二个实例
  // 会以为自己是主实例，直接开出第二个窗口。
  assert.equal(await si.sendToFirstInstance({ argv: [] }), false)
})

test('token 写不进去时退回旧行为，而不是让单实例锁失效', async () => {
  // 指向一个不存在的目录：writeFileSync 不会建父目录 → ENOENT → 降级
  const bogus = path.join(userDataDir, 'does-not-exist', 'deep')
  currentUserData = bogus
  const got = []
  try {
    const server = await startServer((d) => got.push(d))
    try {
      assert.equal(si.readToken(), null, '这个目录下不该有 token')
      // 降级模式下什么 token 都收 —— 宁可少一层防护，也不能开两个窗口
      await rawWrite(JSON.stringify({ progs: { options: { host: 'legacy.example.com' } } }))
      await sleep(200)
      assert.deepEqual(got, [{ options: { host: 'legacy.example.com' } }])
    } finally {
      server.close()
    }
  } finally {
    currentUserData = userDataDir
  }
})

test('🔴 主实例起来后，自己人（带对 token）能送达', async () => {
  const got = []
  const server = await startServer((data) => got.push(data))
  try {
    assert.ok(fs.existsSync(path.join(userDataDir, 'instance-token')), '主实例应写下 token')

    const sent = await si.sendToFirstInstance({ options: { host: 'a.example.com' } })
    assert.equal(sent, true, '应当送达')
    await sleep(200)
    assert.deepEqual(got, [{ options: { host: 'a.example.com' } }])
  } finally {
    server.close()
  }
})

test('🔴 不带 token 的裸连接**不能**注入（这就是 #44 原来那条洞）', async () => {
  const got = []
  const server = await startServer((data) => got.push(data))
  try {
    // 攻击者能构造出完全合法的 progs —— 差别只在没有 token
    await rawWrite(JSON.stringify({
      options: { host: 'evil.example.com', privateKeyPath: 'C:\\Users\\me\\.ssh\\id_rsa' }
    }))
    await sleep(200)
    assert.deepEqual(got, [], '没有 token 却把 payload 转发下去了')
  } finally {
    server.close()
  }
})

test('带错 token 也不能注入（别指望"随便给个字符串"能过）', async () => {
  const got = []
  const server = await startServer((data) => got.push(data))
  try {
    await rawWrite(JSON.stringify({ token: 'deadbeef', progs: { options: { host: 'evil' } } }))
    await sleep(200)
    assert.deepEqual(got, [])
  } finally {
    server.close()
  }
})

test('token 唯一对应本次运行：重新当主实例会换新的，旧 token 立刻作废', async () => {
  const server1 = await startServer(() => {})
  const t1 = si.readToken()
  server1.close()
  const server2 = await startServer(() => {})
  const t2 = si.readToken()
  try {
    assert.notEqual(t1, t2, '每次当主实例都该换新 token')
    const got = []
    server2.close()
    const server3 = await startServer((d) => got.push(d))
    try {
      await rawWrite(JSON.stringify({ token: t1, progs: { options: { host: 'evil' } } }))
      await sleep(200)
      assert.deepEqual(got, [], '上一轮的旧 token 不该还能用')
    } finally {
      server3.close()
    }
  } finally {
    server2.close()
  }
})

test('畸形 JSON 不崩，也不转发', async () => {
  const got = []
  const server = await startServer((data) => got.push(data))
  try {
    await rawWrite('{not json')
    await sleep(200)
    assert.deepEqual(got, [])
  } finally {
    server.close()
  }
})

test('超长消息会被断开 —— 无上限的话本机进程能拿管道把内存撑爆', async () => {
  const got = []
  const server = await startServer((data) => got.push(data))
  try {
    const big = JSON.stringify({ token: si.readToken(), progs: { pad: 'x'.repeat(2 * 1024 * 1024) } })
    assert.ok(big.length > si.MAX_MESSAGE_BYTES, '前提：这条消息确实超过上限')
    await rawWrite(big)
    await sleep(300)
    assert.deepEqual(got, [], '超长消息不该被转发')
  } finally {
    server.close()
  }
})
