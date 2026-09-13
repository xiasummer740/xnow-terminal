/**
 * Unit tests for nedb.js and sqlite.js enc/dec support.
 * Uses Node's built-in test runner (node:test).
 *
 * Run with:
 *   node --test test/unit/db-enc.spec.js
 */

const { test, describe, before, after } = require('node:test')
const assert = require('node:assert/strict')
const os = require('os')
const fs = require('fs')
const path = require('path')

// ---------------------------------------------------------------------------
// Simple reversible enc/dec for tests (XOR-rotate + base64)
// ---------------------------------------------------------------------------
// const TEST_ENC_PREFIX = 'enc:'

function simpleEnc (str) {
  return Buffer.from(str).toString('base64')
}

function simpleDec (str) {
  return Buffer.from(str, 'base64').toString('utf8')
}

const encOpts = { enc: simpleEnc, dec: simpleDec }

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeTmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'electerm-test-'))
}

/**
 * Windows 上 sqlite 那两个 DatabaseSync 句柄到测试结束仍是开着的，被占用的 .db
 * 文件删不掉，`rmSync` 会抛 EPERM。这是 OS 层面的限制（app.js 里也记着同一件事：
 * 「Windows 上删不掉被打开的文件」），不是测试失败 —— 只放过 EPERM，其余照旧抛出。
 */
function cleanTmpDir (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (e) {
    if (e.code !== 'EPERM') throw e
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/** 数一数目录树下落定的 / 还在写的 nedb 文件（目录不存在时算 0）。 */
function scanNedb (dir) {
  let done = 0
  let pending = 0
  const walk = (d) => {
    let entries
    try {
      entries = fs.readdirSync(d, { withFileTypes: true })
    } catch (e) {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        walk(path.join(d, entry.name))
      } else if (entry.name.endsWith('.nedb')) {
        done++
      } else if (entry.name.endsWith('.nedb~')) {
        pending++
      }
    }
  }
  walk(dir)
  return { done, pending }
}

/**
 * nedb 的 Datastore 是 autoload 的：数据文件不存在时它会在**后台**异步补建
 * （先写 `xxx.nedb~` 再 rename 成 `xxx.nedb`）。createDb() 一口气建 15 张表，
 * 不等这些后台写落定就删临时目录，nedb 的 rename 会 ENOENT —— 而且是在测试
 * 结束之后才炸出来，node:test 会因此判整个文件失败。
 * 所以删目录前先等：连续 3 次采样「文件数不变且没有半成品的 `~`」才算落定。
 */
async function waitForNedbSettled (dir, timeout = 5000) {
  const deadline = Date.now() + timeout
  let last = -1
  let stable = 0
  while (Date.now() < deadline) {
    const { done, pending } = scanNedb(dir)
    if (done > 0 && pending === 0 && done === last) {
      if (++stable >= 3) {
        return done
      }
    } else {
      stable = 0
    }
    last = done
    await sleep(20)
  }
  const { done, pending } = scanNedb(dir)
  throw new Error(
    `等 nedb 后台建数据文件超时（${timeout}ms）：已落定 ${done} 个，还在写 ${pending} 个`
  )
}

// ---------------------------------------------------------------------------
// SQLite tests (Node >= 22)
// ---------------------------------------------------------------------------
describe('sqlite createDb', () => {
  const { createDb } = require('../../src/app/lib/sqlite')

  // --- without enc/dec ---
  describe('without enc/dec', () => {
    let db
    let tmpDir

    before(() => {
      tmpDir = makeTmpDir()
      db = createDb(tmpDir, 'testuser')
    })

    after(() => {
      cleanTmpDir(tmpDir)
    })

    test('insert and find returns original data', async () => {
      const doc = { host: 'example.com', port: 22 }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      assert.ok(inserted._id, 'inserted document should have _id')
      assert.equal(inserted.host, 'example.com')

      const results = await db.dbAction('bookmarks', 'find')
      assert.equal(results.length, 1)
      assert.equal(results[0].host, 'example.com')
      assert.equal(results[0].port, 22)
    })

    test('findOne returns correct document', async () => {
      const doc = { host: 'other.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'other.com')
    })

    test('update modifies data', async () => {
      const doc = { host: 'update-me.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      await db.dbAction('bookmarks', 'update', { _id: inserted._id }, { $set: { host: 'updated.com' } })
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'updated.com')
    })

    test('remove deletes document', async () => {
      const doc = { host: 'remove-me.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      const changes = await db.dbAction('bookmarks', 'remove', { _id: inserted._id })
      assert.ok(changes >= 1)
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found, null)
    })

    test('non-enc table (lastStates) stores data normally', async () => {
      const doc = { key: 'value' }
      const inserted = await db.dbAction('lastStates', 'insert', doc)
      const found = await db.dbAction('lastStates', 'findOne', { _id: inserted._id })
      assert.equal(found.key, 'value')
    })
  })

  // --- with enc/dec ---
  describe('with enc/dec', () => {
    let db
    let tmpDir
    let dbFolder

    before(() => {
      tmpDir = makeTmpDir()
      dbFolder = path.join(tmpDir, 'xnow-terminal', 'users', 'testuser')
      db = createDb(tmpDir, 'testuser', encOpts)
    })

    after(() => {
      cleanTmpDir(tmpDir)
    })

    test('inserted bookmarks data is encrypted on disk', async () => {
      const doc = { host: 'secret.com', password: 'hunter2' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      assert.ok(inserted._id)

      // Read raw sqlite file to confirm the value is not plain text
      const dbPath = path.join(dbFolder, 'xnow.db')
      const raw = fs.readFileSync(dbPath, 'latin1')
      assert.ok(!raw.includes('hunter2'), 'raw db should NOT contain plaintext password')
      assert.ok(!raw.includes('secret.com'), 'raw db should NOT contain plaintext host')
    })

    test('find returns decrypted data', async () => {
      const results = await db.dbAction('bookmarks', 'find')
      const found = results.find(r => r.host === 'secret.com')
      assert.ok(found, 'should find the document with decrypted host')
      assert.equal(found.password, 'hunter2')
    })

    test('findOne returns decrypted data', async () => {
      const doc = { host: 'findone.com', user: 'alice' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'findone.com')
      assert.equal(found.user, 'alice')
    })

    test('update encrypts new value and find decrypts it', async () => {
      const doc = { host: 'todo-update.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      await db.dbAction('bookmarks', 'update', { _id: inserted._id }, { $set: { host: 'updated-enc.com' } })
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'updated-enc.com')
    })

    test('data table: only userConfig record is encrypted', async () => {
      // userConfig should be encrypted
      await db.dbAction('data', 'insert', { _id: 'userConfig', value: 'topSecret123' })
      // other data record should NOT be encrypted
      await db.dbAction('data', 'insert', { _id: 'version', value: '1.0.0' })
      const dbPath = path.join(dbFolder, 'xnow_data.db')
      const raw = fs.readFileSync(dbPath, 'latin1')
      assert.ok(!raw.includes('topSecret123'), 'userConfig value should NOT be plaintext on disk')
      assert.ok(raw.includes('1.0.0'), 'non-userConfig data should be plaintext on disk')
    })

    test('data find returns decrypted userConfig, plain others', async () => {
      const results = await db.dbAction('data', 'find')
      const uc = results.find(r => r._id === 'userConfig')
      const ver = results.find(r => r._id === 'version')
      assert.ok(uc, 'should find userConfig')
      assert.equal(uc.value, 'topSecret123', 'userConfig value should be decrypted')
      assert.ok(ver, 'should find version')
      assert.equal(ver.value, '1.0.0', 'version value should be readable')
    })

    test('profiles table is encrypted', async () => {
      const doc = { name: 'myProfile', secret: 'profileSecret' }
      await db.dbAction('profiles', 'insert', doc)
      const dbPath = path.join(dbFolder, 'xnow.db')
      const raw = fs.readFileSync(dbPath, 'latin1')
      assert.ok(!raw.includes('profileSecret'), 'profiles db should NOT contain plaintext secret')
    })

    test('non-enc table (quickCommands) is NOT encrypted', async () => {
      const doc = { cmd: 'ls -la' }
      await db.dbAction('quickCommands', 'insert', doc)
      const dbPath = path.join(dbFolder, 'xnow.db')
      const raw = fs.readFileSync(dbPath, 'latin1')
      assert.ok(raw.includes('ls -la'), 'non-enc tables should store data as plaintext')
    })

    test('remove works on enc table', async () => {
      const doc = { host: 'to-delete.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      const changes = await db.dbAction('bookmarks', 'remove', { _id: inserted._id })
      assert.ok(changes >= 1)
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found, null)
    })
  })
})

// ---------------------------------------------------------------------------
// nedb tests (works on all Node versions)
// ---------------------------------------------------------------------------
describe('nedb createDb', () => {
  const { createDb } = require('../../src/app/lib/nedb')

  // --- without enc/dec ---
  describe('without enc/dec', () => {
    let db
    let tmpDir

    before(() => {
      tmpDir = makeTmpDir()
      db = createDb(tmpDir, 'testuser')
    })

    after(async () => {
      // 先等 nedb 的后台建文件落定，再删目录（否则它的 rename 会 ENOENT）
      await waitForNedbSettled(tmpDir)
      cleanTmpDir(tmpDir)
    })

    test('insert and find returns original data', async () => {
      const doc = { host: 'example.com', port: 22 }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      assert.ok(inserted._id)
      assert.equal(inserted.host, 'example.com')

      const results = await db.dbAction('bookmarks', 'find', {})
      assert.ok(results.some(r => r.host === 'example.com'))
    })

    test('findOne returns correct document', async () => {
      const doc = { host: 'other.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'other.com')
    })

    test('update modifies data', async () => {
      const doc = { host: 'update-me.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      await db.dbAction('bookmarks', 'update', { _id: inserted._id }, { $set: { host: 'updated.com' } })
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'updated.com')
    })

    test('remove deletes document', async () => {
      const doc = { host: 'remove-me.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      await db.dbAction('bookmarks', 'remove', { _id: inserted._id })
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found, null)
    })
  })

  // --- with enc/dec ---
  describe('with enc/dec', () => {
    let db
    let tmpDir

    before(() => {
      tmpDir = makeTmpDir()
      db = createDb(tmpDir, 'testuser', encOpts)
    })

    after(async () => {
      // 先等 nedb 的后台建文件落定，再删目录（否则它的 rename 会 ENOENT）
      await waitForNedbSettled(tmpDir)
      cleanTmpDir(tmpDir)
    })

    test('inserted bookmarks data is encrypted on disk', async () => {
      const doc = { host: 'secret.com', password: 'hunter2' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      assert.ok(inserted._id)

      // Read raw nedb file to confirm the value is not plain text
      const nedbPath = path.join(
        tmpDir, 'xnow-terminal', 'users', 'testuser', 'xnow.bookmarks.nedb'
      )
      const raw = fs.readFileSync(nedbPath, 'utf8')
      assert.ok(!raw.includes('hunter2'), 'nedb file should NOT contain plaintext password')
      assert.ok(!raw.includes('secret.com'), 'nedb file should NOT contain plaintext host')
    })

    test('find returns decrypted data', async () => {
      const results = await db.dbAction('bookmarks', 'find', {})
      const found = results.find(r => r.host === 'secret.com')
      assert.ok(found, 'should find the document with decrypted host')
      assert.equal(found.password, 'hunter2')
    })

    test('findOne returns decrypted data', async () => {
      const doc = { host: 'findone.com', user: 'bob' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'findone.com')
      assert.equal(found.user, 'bob')
    })

    test('update encrypts new value and find decrypts it', async () => {
      const doc = { host: 'todo-update.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      await db.dbAction('bookmarks', 'update', { _id: inserted._id }, { $set: { host: 'updated-enc.com' } })
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found.host, 'updated-enc.com')
    })

    test('data table: only userConfig record is encrypted', async () => {
      await db.dbAction('data', 'insert', { _id: 'userConfig', secret: 'mySecret' })
      await db.dbAction('data', 'insert', { _id: 'version', value: '1.0.0' })
      const nedbPath = path.join(
        tmpDir, 'xnow-terminal', 'users', 'testuser', 'xnow.data.nedb'
      )
      const raw = fs.readFileSync(nedbPath, 'utf8')
      assert.ok(!raw.includes('mySecret'), 'userConfig secret should NOT be plaintext in nedb')
      assert.ok(raw.includes('1.0.0'), 'non-userConfig data should be plaintext in nedb')
    })

    test('data find returns decrypted userConfig, plain others', async () => {
      const results = await db.dbAction('data', 'find', {})
      const uc = results.find(r => r._id === 'userConfig')
      const ver = results.find(r => r._id === 'version')
      assert.ok(uc, 'should find userConfig')
      assert.equal(uc.secret, 'mySecret', 'userConfig secret should be decrypted')
      assert.ok(ver, 'should find version')
      assert.equal(ver.value, '1.0.0', 'version value should be readable')
    })

    test('profiles table is encrypted', async () => {
      const doc = { name: 'myProfile', secret: 'profileSecret' }
      await db.dbAction('profiles', 'insert', doc)
      const nedbPath = path.join(
        tmpDir, 'xnow-terminal', 'users', 'testuser', 'xnow.profiles.nedb'
      )
      const raw = fs.readFileSync(nedbPath, 'utf8')
      assert.ok(!raw.includes('profileSecret'), 'profiles nedb should NOT contain plaintext secret')
    })

    test('non-enc table (quickCommands) is NOT encrypted', async () => {
      const doc = { cmd: 'echo hello' }
      await db.dbAction('quickCommands', 'insert', doc)
      const nedbPath = path.join(
        tmpDir, 'xnow-terminal', 'users', 'testuser', 'xnow.quickCommands.nedb'
      )
      const raw = fs.readFileSync(nedbPath, 'utf8')
      assert.ok(raw.includes('echo hello'), 'non-enc tables should store data as plaintext')
    })

    test('remove works on enc table', async () => {
      const doc = { host: 'to-delete.com' }
      const inserted = await db.dbAction('bookmarks', 'insert', doc)
      await db.dbAction('bookmarks', 'remove', { _id: inserted._id })
      const found = await db.dbAction('bookmarks', 'findOne', { _id: inserted._id })
      assert.equal(found, null)
    })
  })
})
