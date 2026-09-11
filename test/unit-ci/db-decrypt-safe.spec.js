/**
 * ISSUES #8：解密失败不得静默覆盖原始密文
 *
 * 背景：safeStorage 密钥变化（换 Windows 账号 / 换 profile / 数据被拷到别处）时，
 * safeDecrypt 解不开会**原样返回密文**（见 src/app/lib/safe-storage.js），
 * 于是 JSON.parse 失败、记录被当成空对象返回。
 * 危险的是这个空对象会随 watch 同步或用户编辑被写回，
 * 把库里原本完好的密文覆盖成 {}，用户数据就真的没了。
 *
 * 本测试锁死：即使读到的记录是空的，写回时也必须原样恢复密文。
 */

process.env.NODE_ENV = 'development'
// 别让外部 DATA_PATH 把测试数据写到真实目录去（sqlite.js 优先读 DATA_PATH）
delete process.env.DATA_PATH

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')
const { createDb } = require('../../src/app/lib/sqlite')

const PREFIX = 'v2:safe:'
const SECRET = JSON.stringify({
  title: 'RN US',
  host: '192.129.210.52',
  username: 'root',
  password: 'p@ssw0rd'
})

// 正常的加解密对
const enc = s => PREFIX + Buffer.from(s, 'utf8').toString('base64')
const dec = s => Buffer.from(s.slice(PREFIX.length), 'base64').toString('utf8')

// 模拟密钥变化后 safeStorage 解不开：safeDecrypt 原样返回密文
const decBroken = s => s

function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xnow-db-test-'))
}

// sqlite.js 内部是 resolve(appPath, 'xnow-terminal')，数据目录比 appPath 再深一层
function dataDir (dir) {
  return path.join(dir, 'xnow-terminal')
}

function readRaw (dir, id) {
  const db = new DatabaseSync(
    path.join(dataDir(dir), 'users', 'default_user', 'xnow.db'),
    { readOnly: true }
  )
  const row = db.prepare('SELECT data FROM `bookmarks` WHERE _id = ?').get(id)
  db.close()
  return row && row.data
}

// 数据库句柄在模块内长期持有，Windows 上删不掉打开中的文件，清理失败不算测试失败
function cleanup (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) { /* 句柄未释放，留给系统回收 */ }
}

describe('解密失败时的数据保护（ISSUES #8）', () => {
  test('正常情况：写入后能原样读回', async () => {
    const dir = tmpDir()
    const { dbAction } = createDb(dir, 'default_user', { enc, dec })
    await dbAction('bookmarks', 'insert', { _id: 'b1', ...JSON.parse(SECRET) })
    const rows = await dbAction('bookmarks', 'find', {})
    assert.equal(rows.length, 1)
    assert.equal(rows[0].host, '192.129.210.52')
    assert.equal(rows[0].password, 'p@ssw0rd')
    cleanup(dir)
  })

  test('密文在库里的确是加密存储的', async () => {
    const dir = tmpDir()
    const { dbAction } = createDb(dir, 'default_user', { enc, dec })
    await dbAction('bookmarks', 'insert', { _id: 'b1', ...JSON.parse(SECRET) })
    const raw = readRaw(dir, 'b1')
    assert.ok(raw.startsWith(`enc:${PREFIX}`), '应以加密前缀存储，实际：' + raw.slice(0, 20))
    assert.ok(!raw.includes('p@ssw0rd'), '明文密码不应直接落盘')
    cleanup(dir)
  })

  test('解密失败后写回，必须保留原始密文而不是覆盖成空对象', async () => {
    const dir = tmpDir()

    // 1) 先用正常密钥写入一条真实记录
    const good = createDb(dir, 'default_user', { enc, dec })
    await good.dbAction('bookmarks', 'insert', { _id: 'b1', ...JSON.parse(SECRET) })
    const rawBefore = readRaw(dir, 'b1')
    assert.ok(rawBefore.startsWith(`enc:${PREFIX}`))

    // 2) 密钥变了：新实例解不开这条记录
    const broken = createDb(dir, 'default_user', { enc, dec: decBroken })
    const rows = await broken.dbAction('bookmarks', 'find', {})
    assert.equal(rows.length, 1, '记录条数不变')
    assert.equal(rows[0]._id, 'b1', '记录仍在（不是被删了）')
    assert.equal(rows[0].host, undefined, '解不开时读为空（已知行为）')

    // 3) 关键：上层把它写回去（watch 同步 / 用户点保存都会走到这里）
    await broken.dbAction('bookmarks', 'update', { _id: 'b1' }, {
      $set: { _id: 'b1' }
    })

    // 4) 密文必须原封不动 —— 换回正常密钥仍能解出完整内容
    const rawAfter = readRaw(dir, 'b1')
    assert.equal(
      rawAfter,
      rawBefore,
      '密文被改写了！解密失败时写回应原样保留密文'
    )
    const recovered = JSON.parse(dec(rawAfter.slice(4)))
    assert.equal(recovered.password, 'p@ssw0rd', '原始内容仍可完整恢复')

    cleanup(dir)
  })
})
