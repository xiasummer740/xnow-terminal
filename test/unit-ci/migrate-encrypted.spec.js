/**
 * ISSUES #21：v1→v2 迁移把整库**明文**写进 sqlite（含 SSH 密码）
 *
 * 根因是 `createSqlite(appPath, defaultUserName)` 少传了第三个参数 ——
 * 于是 sqlite.js 里 `enc` 是 undefined，`toRow` 的
 * `enc && shouldEncForRow(dbName, _id)` 直接短路成 false，整行按明文 JSON 落盘。
 *
 * 原来的注释理由是「safeStorage 在 IPC/迁移上下文不可靠，等用户下次编辑时自然会加密」。
 * 这个理由两条都不成立，本测试把它们都钉住：
 *   1. 「下次编辑会加密」只覆盖用户**再手工碰过**的记录，没碰过的永远明文
 *   2. safeEncrypt 有三级兜底（safeStorage → 本机密钥 AES-256-GCM → 带标记的不安全
 *      存储），系统级不可用也会落到第二级**照样加密** —— 不加密从来不是兜底选项
 *
 * migrate() 本身进不来（依赖 app-props/electron 一长串），所以这里测两件事：
 *   · 行为：同一个 createDb，给不给 enc/dec 就是「加密」和「明文」的分界
 *   · 链路：迁移脚本确实传了 enc/dec，且确实来自 safe-storage（防以后被改回去）
 */

process.env.NODE_ENV = 'development'
// 别让外部 DATA_PATH 把测试数据写到真实目录去（sqlite.js 优先读 DATA_PATH）
delete process.env.DATA_PATH

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { DatabaseSync } = require('node:sqlite')
const { createDb } = require('../../src/app/lib/sqlite')

const ROOT = path.resolve(__dirname, '../..')
const MIGRATE_JS = path.join(ROOT, 'src/app/migrate/migrate-1-to-2.js')

// #21 修复前的最后一步（提交 6bf7e7ef）。写死哈希不用 HEAD —— HEAD 会随提交前移，
// 反证就自己失效了（ISSUES #49 踩过这个坑）。
const PRE_FIX_REV = '6bf7e7ef'

const PREFIX = 'v2:safe:'
const SECRET = JSON.stringify({
  title: 'RN US',
  host: '192.129.210.52',
  username: 'root',
  password: 'p@ssw0rd'
})

// 正常的加解密对（照 #8 那份 spec 的写法）
const enc = s => PREFIX + Buffer.from(s, 'utf8').toString('base64')
const dec = s => Buffer.from(s.slice(PREFIX.length), 'base64').toString('utf8')

function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xnow-migrate-enc-'))
}

function dbFile (dir) {
  return path.join(dir, 'xnow-terminal', 'users', 'default_user', 'xnow.db')
}

function readRaw (dir, id) {
  const db = new DatabaseSync(dbFile(dir), { readOnly: true })
  try {
    const row = db.prepare('SELECT data FROM `bookmarks` WHERE _id = ?').get(id)
    return row && row.data
  } finally {
    db.close()
  }
}

function cleanup (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) { /* 句柄未释放，留给系统回收 */ }
}

describe('迁移写入必须加密（ISSUES #21）', () => {
  test('传了 enc/dec：落盘是密文，明文密码不出现在文件里', async () => {
    const dir = tmpDir()
    const { dbAction } = createDb(dir, 'default_user', { enc, dec })
    await dbAction('bookmarks', 'update', { _id: 'b1' }, {
      $set: { _id: 'b1', ...JSON.parse(SECRET) }
    }, { upsert: true })

    const raw = readRaw(dir, 'b1')
    assert.ok(raw.startsWith('enc:'), '没有加密前缀，实际：' + raw.slice(0, 20))
    assert.ok(
      !raw.includes('p@ssw0rd'),
      '明文密码落盘了 —— 这正是 #21'
    )
    // 而且要能读回来，否则只是换了个坏法
    const [row] = await dbAction('bookmarks', 'find', {})
    assert.equal(row.password, 'p@ssw0rd', '密文读不回来')
    cleanup(dir)
  })

  test('🔴 反证：不传 enc/dec（就是修复前的写法）确实整行明文', async () => {
    const dir = tmpDir()
    // 这就是迁移脚本原来那行：createSqlite(appPath, defaultUserName)
    const { dbAction } = createDb(dir, 'default_user')
    await dbAction('bookmarks', 'update', { _id: 'b1' }, {
      $set: { _id: 'b1', ...JSON.parse(SECRET) }
    }, { upsert: true })

    const raw = readRaw(dir, 'b1')
    assert.ok(
      raw.includes('p@ssw0rd'),
      '前提失效：不传 enc/dec 竟然也加密了 —— 那 #21 的根因判断就是错的'
    )
    assert.ok(!raw.startsWith('enc:'), '不该有加密前缀')
    cleanup(dir)
  })

  test('safeEncrypt 真的有三级兜底 —— 「系统级不可用」不等于「不加密」', () => {
    // 原注释的理由是「safeStorage 不可靠所以干脆不加密」。直接读源码钉住：
    // 三级依次是 safeStorage / AES-256-GCM 本机密钥 / 带标记的不安全存储，
    // 任何一级成功都仍然是加密，不存在「返回明文」这条路。
    const src = fs.readFileSync(path.join(ROOT, 'src/app/lib/safe-storage.js'), 'utf8')
    assert.match(src, /exports\.safeEncrypt/, '找不到 safeEncrypt')
    assert.match(src, /ss\.encryptString\(str\)/, '少了 safeStorage 那一级')
    assert.match(src, /fallbackEncrypt\(str\)/, '少了 AES-256-GCM 兜底那一级')
    assert.match(src, /INSECURE_PREFIX \+ str/, '少了"带标记的不安全存储"那一级')
    // 兜底那一级也是加密的（AES-256-GCM），不是明文
    assert.match(src, /aes-256-gcm/, '兜底不是真加密？')
  })
})

// ── 链路钉死：迁移脚本必须真的把 enc/dec 传下去 ──────────────

describe('迁移脚本的写入侧必须接上加密', () => {
  const SRC = fs.readFileSync(MIGRATE_JS, 'utf8')

  test('从 safe-storage 取 enc/dec，且传给 createSqlite', () => {
    assert.match(
      SRC,
      /require\('\.\.\/lib\/safe-storage'\)/,
      '没从 safe-storage 取加解密函数'
    )
    assert.match(SRC, /safeEncrypt/, '没有 safeEncrypt')
    assert.match(SRC, /safeDecrypt/, '没有 safeDecrypt')
    // createSqlite(...) 的实参里必须有 enc 和 dec —— 只 import 不传等于没修
    const call = /createSqlite\(\s*appPath\s*,\s*defaultUserName\s*,\s*\{([\s\S]*?)\}\s*\)/.exec(SRC)
    assert.ok(call, 'createSqlite 的调用形状变了，或者没传第三个参数')
    assert.match(call[1], /enc\s*:\s*safeEncrypt/, 'enc 没接上')
    assert.match(call[1], /dec\s*:\s*safeDecrypt/, 'dec 没接上')
  })

  test('和 db.js 用的是同一对函数（读写同源，不会写得进读不出）', () => {
    const dbJs = fs.readFileSync(path.join(ROOT, 'src/app/lib/db.js'), 'utf8')
    assert.match(dbJs, /safeEncrypt, safeDecrypt/, 'db.js 取的不是这一对')
    assert.match(dbJs, /encOpts/, 'db.js 没构造 encOpts')
    // 两边都得引用 safe-storage，才谈得上同源
    assert.match(SRC, /safe-storage/, '迁移侧不是同一来源')
  })

  test('🔴 反证：修复前那版没有传第三个参数', () => {
    const old = execFileSync('git', ['show', `${PRE_FIX_REV}:src/app/migrate/migrate-1-to-2.js`], {
      cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024
    })
    assert.match(
      old,
      /createSqlite\(appPath,\s*defaultUserName\)/,
      '前提失效：旧版看起来已经传了参数 —— 那 #21 的根因判断要重看'
    )
    assert.ok(
      !/safe-storage/.test(old),
      '旧版居然引了 safe-storage，前提要重看'
    )
  })
})
