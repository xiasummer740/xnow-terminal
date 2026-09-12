/**
 * ISSUES #50：`saveUserConfig` 跨 await 读-改-写，并发保存互相覆盖
 *
 * 执行流是「读旧值 → (await getDbConfig) → 合并 → 写回」。两次保存并发时：
 *   A 读旧值 → await → B 读旧值 → A 写回 → B 用**自己读到的旧值**把 A 刚写的盖回去
 * 丢的恰好是"不在 B 这次 payload 里"的字段 —— 也就是 A 那次改的东西。
 *
 * 什么时候会撞上：`watch.js` 的 debounce 到点触发保存，同一刻 `flushConfigSave()`
 * （退出路径，#49 加的）又发一次。**关窗那一刻**就能撞上，
 * 所以这条和 #49 是一对：flush 让这个竞态更容易发生。
 *
 * 测试方式：electron 用替身（只为满足 app-props / safe-storage 的 require），
 * 数据库是**真的 sqlite**（DATA_PATH 指到临时目录），控制器是生产代码原文，
 * 然后真的并发调 N 次 saveUserConfig 看字段会不会被打回去。
 * 不这么测就只剩"读源码说它串行了"——那证明不了并发下真不丢。
 */

process.env.NODE_ENV = 'development'

const { describe, test, before, after } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const Module = require('node:module')

const ROOT = path.resolve(__dirname, '../..')

let tmpRoot
let dataDir
let ctrl
let constants

function seedElectronStub (appData) {
  return {
    app: {
      getPath (name) {
        if (name === 'appData') return appData
        if (name === 'userData') return path.join(appData, 'xnow-terminal')
        if (name === 'exe') return path.join(appData, 'xnow-terminal.exe')
        if (name === 'home') return appData
        return appData
      },
      setName () {},
      // electron-log 在 load 时会问 app.getName/getVersion（这条 require 链里有 log，
      // 所以第一次加载 electron-log 就发生在替身生效期间，少一个都炸）
      getName: () => 'xnow-terminal',
      getVersion: () => '0.0.0-test',
      isPackaged: false
    },
    // 不给 safeStorage：走 AES 兜底那级，测试不依赖操作系统密钥环
    safeStorage: undefined
  }
}

before(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'xnow-cfg-race-'))
  const appData = path.join(tmpRoot, 'appdata')
  fs.mkdirSync(appData, { recursive: true })
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })

  const stub = seedElectronStub(appData)
  const origLoad = Module._load
  Module._load = function (request) {
    if (request === 'electron') return stub
    return origLoad.apply(this, arguments)
  }
  try {
    process.env.DATA_PATH = dataDir
    // DATA_PATH 必须赶在 db.js 之前设好 —— 它在模块顶层就建库了
    ctrl = require('../../src/app/lib/user-config-controller')
    constants = require('../../src/app/common/constants')
  } finally {
    Module._load = origLoad
  }
})

after(() => {
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch (_) { /* 句柄未释放，留给系统回收 */ }
})

/**
 * 读回落盘的配置行。**返回 Promise，调用处必须 await**
 * —— dbAction 是异步的，漏掉 await 拿到的是 Promise 对象，
 * 上面每个 `stored.xxx` 都会变成 undefined（这不是配置丢了，是没等）。
 *
 * 走**生产读路径**（dbAction），不走裸 SQL：配置行是加密落盘的（`enc:v2:fb:` 前缀），
 * 裸读只能拿到密文，JSON.parse 直接炸。应用自己也是这么读的，
 * 所以这里读到什么就是应用启动后会看到什么。
 */
function readStored (id = constants.userConfigId) {
  const { dbAction } = require('../../src/app/lib/db')
  return dbAction('data', 'findOne', { _id: id })
}

describe('#50 并发保存不得互相覆盖', () => {
  test('前提：控制器和真 sqlite 库都加载起来了', () => {
    assert.ok(ctrl && typeof ctrl.saveUserConfig === 'function', 'saveUserConfig 没拿到')
    assert.ok(constants && constants.userConfigId, 'constants 没拿到')
    assert.ok(
      fs.existsSync(path.join(dataDir, 'users', 'default_user', 'xnow_data.db')),
      'DATA_PATH 没生效，库不在临时目录 —— 那这个测试可能动到了真实数据'
    )
  })

  test('🔴 同一刻并发改**不同**字段，谁的改动都不许丢', async () => {
    // 先写一个基线配置
    await ctrl.saveUserConfig({ theme: 'base', fontSize: 14, lang: 'zh_cn' })

    // 三次保存同时发出，各自只改一个字段、且都不带另外两个字段
    const fields = [
      { theme: 'dark' },
      { fontSize: 20 },
      { lang: 'en_us' }
    ]
    await Promise.all(fields.map(f => ctrl.saveUserConfig({ ...f })))

    const stored = await readStored()
    assert.ok(stored, '配置没落盘')
    assert.equal(stored.theme, 'dark', 'theme 被并发保存盖回去了')
    assert.equal(stored.fontSize, 20, 'fontSize 被并发保存盖回去了')
    assert.equal(stored.lang, 'en_us', 'lang 被并发保存盖回去了')
  })

  test('🔴 大并发（20 次）每个字段都要活下来', async () => {
    const base = { seed: 1 }
    await ctrl.saveUserConfig(base)

    const writes = []
    for (let i = 0; i < 20; i++) {
      writes.push(ctrl.saveUserConfig({ [`field${i}`]: `v${i}` }))
    }
    await Promise.all(writes)

    const stored = await readStored()
    const missing = []
    for (let i = 0; i < 20; i++) {
      if (stored[`field${i}`] !== `v${i}`) {
        missing.push(i)
      }
    }
    assert.deepEqual(
      missing, [],
      `这些字段被并发写丢了：${missing.join(',')}（活下来 ${20 - missing.length}/20）`
    )
  })

  test('不该落库的字段仍然不落库（老行为不许坏）', async () => {
    await ctrl.saveUserConfig({
      theme: 'keepme',
      host: '0.0.0.0',
      port: 5570,
      tokenElecterm: 'secret-token',
      terminalTypes: ['x'],
      server: {}
    })
    const stored = await readStored()
    assert.equal(stored.theme, 'keepme')
    for (const f of ['host', 'port', 'tokenElecterm', 'terminalTypes', 'server']) {
      assert.ok(!(f in stored), `${f} 不该落库，却出现在库里`)
    }
  })

  test('一次失败不许卡死后续保存（串行化不能变成死锁）', async () => {
    // 让第一次写的 dbAction 抛错：传一个 JSON 序列化不了的值（循环引用）
    const circular = { theme: 'boom' }
    circular.self = circular
    const failed = ctrl.saveUserConfig(circular).then(
      () => 'resolved',
      () => 'rejected'
    )
    // 紧接着的这次必须能正常写进去
    const ok = ctrl.saveUserConfig({ theme: 'after-failure' })
    assert.equal(await failed, 'rejected', '前提失效：那次写入居然没失败')
    await ok
    assert.equal(
      (await readStored()).theme, 'after-failure',
      '前一次失败把后面的保存卡死了 —— 串行链断了'
    )
  })
})

// ── 反证：修复前的写法在这个测试下会丢字段 ────────────────────

describe('#50 反证：修复前的形状挡不住', () => {
  test('🔴 用旧的写法（读完再合并，无串行化）并发写会丢字段', async () => {
    // 复刻旧 writeConfig 的时序：每个保存都"先读、await 一拍、再写"
    const { DatabaseSync } = require('node:sqlite')
    const dbFile = path.join(dataDir, 'users', 'default_user', 'xnow_data.db')
    const id = constants.userConfigId

    function readRow () {
      const db = new DatabaseSync(dbFile, { readOnly: true })
      try {
        const row = db.prepare('SELECT data FROM `data` WHERE _id = ?').get(id)
        return row && row.data ? JSON.parse(row.data) : {}
      } finally {
        db.close()
      }
    }
    function writeRow (obj) {
      const db = new DatabaseSync(dbFile)
      try {
        db.prepare('UPDATE `data` SET data = ? WHERE _id = ?').run(JSON.stringify(obj), id)
      } finally {
        db.close()
      }
    }

    writeRow({ theme: 'old', fontSize: 14, lang: 'zh_cn' })

    // 旧路径：read → await → write，三路并发
    async function legacySave (patch) {
      const conf = readRow()
      await new Promise(resolve => setImmediate(resolve)) // 对应 getDbConfig 的 await
      writeRow({ _id: id, ...conf, ...patch })
    }
    await Promise.all([
      legacySave({ theme: 'new' }),
      legacySave({ fontSize: 99 }),
      legacySave({ lang: 'ja' })
    ])

    const stored = readRow()
    const lost = ['theme', 'fontSize', 'lang'].filter(f => {
      const expect = { theme: 'new', fontSize: 99, lang: 'ja' }[f]
      return stored[f] !== expect
    })
    assert.ok(
      lost.length > 0,
      '前提失效：旧写法这次没丢字段 —— 那 #50 描述的竞态可能不成立，要重看'
    )
  })
})

// ── 钉住"读在锁内"这个关键点 ──────────────────────────────────

describe('#50 读必须发生在锁内', () => {
  const SRC = fs.readFileSync(
    path.join(ROOT, 'src/app/lib/user-config-controller.js'), 'utf8'
  )

  test('getDbConfig 的调用在 writeConfig 里，不在 saveUserConfig 的锁外', () => {
    // 读要是在锁外（先读好再排队），读到的还是过期的旧值 —— 等于没修
    const saveFn = /exports\.saveUserConfig = \(userConfig\) => \{([\s\S]*?)\n\}/.exec(SRC)
    assert.ok(saveFn, 'saveUserConfig 的形状变了，提取要跟着改')
    assert.ok(
      !/getDbConfig/.test(saveFn[1]),
      'saveUserConfig 里直接调了 getDbConfig —— 读跑到锁外了，串行化白做'
    )
    const writeFn = /async function writeConfig \(userConfig\) \{([\s\S]*?)\n\}/.exec(SRC)
    assert.ok(writeFn, '找不到 writeConfig')
    assert.match(writeFn[1], /await getDbConfig\(\)/, 'writeConfig 里没有读旧值')
  })

  test('串行链：前一次失败后仍继续，且链自己吞掉结果防未处理拒绝', () => {
    assert.match(SRC, /let saveChain = Promise\.resolve\(\)/, '没有串行链')
    assert.match(
      SRC,
      /saveChain\.then\(\s*\(\) => writeConfig\(userConfig\),\s*\(\) => writeConfig\(userConfig\)\s*\)/,
      '串行链的后继没有在"前一次失败"时继续跑 —— 一次异常会卡死后续所有保存'
    )
    assert.match(
      SRC,
      /saveChain = p\.then\(\(\) => \{\}, \(\) => \{\}\)/,
      'saveChain 没吞掉结果，会产生未处理的 Promise 拒绝'
    )
  })

  test('🔴 反证：修复前那版把读写都摊在 saveUserConfig 里', () => {
    // ⚠️ 钉**字面提交号**，不能写 HEAD —— 修复一提交，HEAD 就指到修好的版本上，
    // 这两条断言会立刻反转（#40 的同类钉子就这么炸过一次）。
    // ebcb4eb0 是 #50 修复前的最后一个提交。
    const old = require('node:child_process').execFileSync(
      'git', ['show', 'ebcb4eb07773b83da9cb1d4a10476a9673575b50:src/app/lib/user-config-controller.js'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
    assert.match(
      old,
      /const conf = await getDbConfig\(\)/,
      '前提失效：旧版没有"读旧值"这一步'
    )
    assert.ok(
      !/saveChain/.test(old),
      '前提失效：旧版已经有串行链了 —— 那 #50 要重看'
    )
  })
})
