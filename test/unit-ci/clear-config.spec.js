/**
 * ISSUES #40：`--clear-config` 半删除并把应用弄成"打不开"
 *
 * 根因不是"删错了"，是**删除的时机**：打开数据库的是
 * `create-app → get-config → db → sqlite` 这条 require 链（db.js 在模块顶层就
 * createDb()），所以 require create-app 的那一刻 sqlite 句柄已经开了。
 * Windows 上删不掉被打开的文件 —— 这里**实测**这件事，不靠推理。
 *
 * 于是原来的写法串成了两连击：
 *   rmSync 抛 EPERM → createApp() 的 Promise 被拒 → app.js 没有 .catch
 *   → 只在 unhandledRejection 记日志 → 一个窗口都不创建
 *
 * 这个 spec 分三段：
 *   ① 钉住故障机制本身（锁住的目录删不掉，且是**半删除**）
 *   ② 钉住 clearDataDir 在故障下不抛、并如实返回 false
 *   ③ 钉住修法的关键顺序：清理必须排在 require('./lib/create-app') 之前
 */

process.env.NODE_ENV = 'development'

const { describe, test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { DatabaseSync } = require('node:sqlite')

const ROOT = path.resolve(__dirname, '../..')
const { clearDataDir } = require('../../src/app/lib/clear-config')

const APP_JS = path.join(ROOT, 'src/app/app.js')
const CREATE_APP_JS = path.join(ROOT, 'src/app/lib/create-app.js')

function tmpDir (tag) {
  return fs.mkdtempSync(path.join(os.tmpdir(), `xnow-clear-${tag}-`))
}

/** 造一个像真实数据目录的东西：两个 sqlite 库 + 版本标记 + 旧 nedb + 日志 */
function seedDataDir (dir) {
  const userDir = path.join(dir, 'users', 'default_user')
  fs.mkdirSync(userDir, { recursive: true })
  const mainDb = new DatabaseSync(path.join(userDir, 'xnow.db'))
  const dataDb = new DatabaseSync(path.join(userDir, 'xnow_data.db'))
  mainDb.exec('CREATE TABLE IF NOT EXISTS t (a)')
  dataDb.exec('CREATE TABLE IF NOT EXISTS t (a)')
  fs.writeFileSync(path.join(dir, '.xnow-version'), '3.17.11')
  fs.writeFileSync(path.join(userDir, 'electerm.bookmarks.nedb'), 'legacy')
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'logs', 'main.log'), 'log')
  return { mainDb, dataDb }
}

function rm (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) { /* 句柄还没放，留给系统回收 */ }
}

describe('#40 故障机制：数据库句柄开着时目录删不掉', () => {
  test('🔴 rmSync 抛 EPERM，且 force:true 吞不掉', () => {
    const dir = tmpDir('eperm')
    const { mainDb, dataDb } = seedDataDir(dir)
    let code = null
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (e) {
      code = e.code
    }
    // 这就是修复前 create-app.js 里那一行，一模一样
    assert.equal(
      code, 'EPERM',
      `前提变了：锁住的目录没抛 EPERM 而是 ${code} —— 那"删不掉"的根因要重看`
    )
    mainDb.close()
    dataDb.close()
    rm(dir)
  })

  test('🔴 而且是**半删除**：能删的删了，锁住的旧数据留下', () => {
    const dir = tmpDir('half')
    const { mainDb, dataDb } = seedDataDir(dir)
    try {
      fs.rmSync(dir, { recursive: true, force: true })
    } catch (_) { /* 预期抛 */ }

    const left = fs.readdirSync(dir, { recursive: true }).map(String)
    // 活下来的恰好是想清掉的东西
    assert.ok(
      left.some(p => p.includes('xnow.db')),
      '前提失效：db 文件居然被删掉了'
    )
    assert.ok(
      left.some(p => p.includes('xnow_data.db')),
      '前提失效：xnow_data.db 居然被删掉了'
    )
    // 被删掉的是周边文件 —— 目录已经处于不一致状态
    assert.ok(
      !fs.existsSync(path.join(dir, '.xnow-version')),
      '前提失效：.xnow-version 没被删掉，那"半删除"这个说法要重看'
    )
    assert.ok(
      !fs.existsSync(path.join(dir, 'users', 'default_user', 'electerm.bookmarks.nedb')),
      '前提失效：旧 nedb 没被删掉'
    )

    mainDb.close()
    dataDb.close()
    rm(dir)
  })

  test('句柄关掉之后同一个目录就能删干净（修法成立的前提）', () => {
    const dir = tmpDir('after-close')
    const { mainDb, dataDb } = seedDataDir(dir)
    mainDb.close()
    dataDb.close()
    assert.equal(clearDataDir(dir), true, '句柄关了还删不掉？')
    assert.equal(fs.existsSync(dir), false, '目录还在')
  })
})

describe('#40 clearDataDir：任何情况都不抛异常', () => {
  test('正常目录：删干净并返回 true', () => {
    const dir = tmpDir('ok')
    fs.mkdirSync(path.join(dir, 'users'), { recursive: true })
    fs.writeFileSync(path.join(dir, 'users', 'a.txt'), 'x')
    assert.equal(clearDataDir(dir), true)
    assert.equal(fs.existsSync(dir), false)
  })

  test('目录不存在：返回 true，不当成失败', () => {
    const dir = path.join(os.tmpdir(), 'xnow-does-not-exist-' + process.pid)
    assert.equal(fs.existsSync(dir), false)
    assert.equal(clearDataDir(dir), true, '目录本来就不存在，不该报失败')
  })

  test('🔴 目录被锁住：返回 false，但**绝不抛**（抛出去就是应用打不开）', () => {
    const dir = tmpDir('locked')
    const { mainDb, dataDb } = seedDataDir(dir)
    let threw = null
    let result
    try {
      result = clearDataDir(dir)
    } catch (e) {
      threw = e
    }
    assert.equal(threw, null, `clearDataDir 抛了 ${threw && threw.code} —— 就是 #40 那个"不开窗"`)
    assert.equal(result, false, '没清干净却报成功，日志会骗人')
    mainDb.close()
    dataDb.close()
    rm(dir)
  })

  test('路径是空值时返回 false，不拿空字符串去删（防御性）', () => {
    for (const v of [undefined, null, '', 0]) {
      assert.equal(clearDataDir(v), false, `${JSON.stringify(v)} 不该被当成可删路径`)
    }
  })
})

// ── 修法的关键：清理必须排在打开数据库那条 require 链之前 ──────

describe('#40 清理的调用位置', () => {
  const appSrc = fs.readFileSync(APP_JS, 'utf8')

  /**
   * 只留真代码，把注释行剔掉再比位置。
   * 不剔的话这个断言会被**注释里提到的** require 骗过去 —— 上面那段注释
   * 正好写着 `require('./lib/create-app')`，第一版就是这么假绿/假红的。
   */
  function codeOnly (src) {
    return src
      .split('\n')
      .filter(l => {
        const t = l.trim()
        return !(t.startsWith('//') || t.startsWith('/*') || t.startsWith('*'))
      })
      .join('\n')
  }

  test('app.js 里 clearConfigIfRequested() 在 require(create-app) 之前', () => {
    const code = codeOnly(appSrc)
    const clearAt = code.indexOf('clearConfigIfRequested()')
    const requireAt = code.indexOf("const { createApp } = require('./lib/create-app')")
    assert.ok(clearAt !== -1, 'app.js 里没调用 clearConfigIfRequested()')
    assert.ok(requireAt !== -1, "app.js 里没有 require('./lib/create-app') 那句声明")
    assert.ok(
      clearAt < requireAt,
      `顺序反了（清理在 ${clearAt}、require create-app 在 ${requireAt}）—— ` +
      'require 那一刻 sqlite 句柄就开了，清理必然 EPERM'
    )
  })

  test('这个断言本身不会被注释骗到（自检）', () => {
    // 反向验证 codeOnly 有效：把"注释里的 require"放到前面，真 require 放到后面
    const fake = [
      "// 注释里提到 require('./lib/create-app') 不算数",
      'clearConfigIfRequested()',
      "const { createApp } = require('./lib/create-app')"
    ].join('\n')
    const code = codeOnly(fake)
    assert.ok(
      code.indexOf('clearConfigIfRequested()') <
        code.indexOf("const { createApp } = require('./lib/create-app')"),
      'codeOnly 没起作用，注释里的提及仍会干扰位置判断'
    )
  })

  test('create-app.js 里不再有第二份清除逻辑（清理只留一处）', () => {
    const src = fs.readFileSync(CREATE_APP_JS, 'utf8')
    assert.ok(
      !/fs\.rmSync\(/.test(src),
      'create-app.js 里还有 rmSync —— 两处清理会各自演化，删掉这一处'
    )
    assert.ok(
      !/clearConfig/.test(src) || !/rmSync/.test(src),
      'create-app.js 里还残留 clear-config 的删除代码'
    )
  })

  test('被删掉的那份旧写法确实存在过（钉住修复前的形状）', () => {
    // 反证不必真的跑 git（旧代码没有 try/catch，跑起来就是本 spec 第一段那个 EPERM），
    // 用 git show 确认它原来是"无保护的 rmSync + 硬编码 appData 路径"就够了
    const old = require('node:child_process').execFileSync(
      'git', ['show', 'HEAD:src/app/lib/create-app.js'],
      { cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }
    )
    assert.match(
      old,
      /fs\.rmSync\(dataPath, \{ recursive: true, force: true \}\)/,
      '前提失效：HEAD 里找不到原来那行无保护的 rmSync'
    )
    assert.match(
      old,
      /resolve\(app\.getPath\('appData'\), 'xnow-terminal'\)/,
      '前提失效：原来那处硬编码路径不见了'
    )
  })
})

// ── 端到端：真按 app.js 的顺序跑一遍清理 ──────────────────────
//
// 上面那些测的是"清理逻辑本身对不对"。这一段补的是最关键的一环：
// **在真 app 的加载顺序下，跑到清理那一刻，sqlite 句柄到底开没开。**
//
// app-props 要 electron 的 app（plain node 里 require('electron') 只拿到一个路径字符串），
// 所以用一个符合 app.js 时机的 stub 顶掉 electron —— stub 只提供 app-props 需要的
// getPath/setName，不假装实现 electron 的其它部分。
// 这样跑的是**生产代码原文**（clear-config → command-line → app-props），
// 只是把 electron 换成了替身，比"读源码断言顺序"强一档。

describe('#40 端到端：真跑一遍清理（electron 用替身）', () => {
  test('清理跑的时候数据库句柄还没开 —— 目录能被真删掉', () => {
    const Module = require('node:module')
    const origLoad = Module._load

    const fakeAppData = tmpDir('e2e-appdata')
    const dataDir = path.join(fakeAppData, 'xnow-terminal')
    const { mainDb, dataDb } = seedDataDir(dataDir)

    // 先造出"被占用"的样子：句柄开着，此时清理必然失败
    assert.equal(clearDataDir(dataDir), false, '前提失效：句柄开着竟然也能删掉')
    // 关掉才是正常启动路径下应有的状态（清理跑在 db 被 require 之前）
    mainDb.close()
    dataDb.close()

    const electronStub = {
      app: {
        getPath (name) {
          if (name === 'appData') return fakeAppData
          if (name === 'userData') return path.join(fakeAppData, 'xnow-terminal')
          if (name === 'exe') return path.join(fakeAppData, 'xnow-terminal.exe')
          if (name === 'home') return fakeAppData
          return fakeAppData
        },
        setName () {}
      }
    }
    Module._load = function (request, parent, isMain) {
      if (request === 'electron') return electronStub
      return origLoad.apply(this, arguments)
    }

    const savedArgv = process.argv.slice()
    const savedDataPath = process.env.DATA_PATH
    const savedNodeTest = process.env.NODE_TEST
    try {
      // 别让 runtime-constants 的 isTest 把命令行解析短路掉
      delete process.env.NODE_TEST
      // sqlite.js 优先读 DATA_PATH，这里也设上，确保"清理"和"数据库"指向同一处
      process.env.DATA_PATH = dataDir
      process.argv = ['electron', 'app.js', '--clear-config']

      const { clearConfigIfRequested } = require('../../src/app/lib/clear-config')
      const { initCommandLine } = require('../../src/app/lib/command-line')
      const progs = initCommandLine()
      assert.ok(progs && progs.options, '前提失效：命令行没被解析（isTest 短路了？）')
      assert.equal(progs.options.clearConfig, true, '前提失效：--clear-config 没被认出来')

      // 关键断言之一：走到这一步，db 模块**一次都没被 require 过**
      const loadedDb = Object.keys(require.cache).filter(
        k => /[\\/]app[\\/]lib[\\/](db|sqlite)\.js$/.test(k)
      )
      assert.deepEqual(
        loadedDb, [],
        '清理之前 db/sqlite 已经被 require 了 —— 那就是原来"删不掉"的老路'
      )

      const cleared = clearConfigIfRequested()
      assert.equal(cleared, true, '目录没被清掉')
      assert.equal(fs.existsSync(dataDir), false, '数据目录还在')
      assert.equal(
        fs.existsSync(path.join(dataDir, 'users', 'default_user', 'xnow.db')), false,
        'db 文件还在 —— 想清掉的旧数据没清掉'
      )
    } finally {
      Module._load = origLoad
      process.argv = savedArgv
      if (savedDataPath === undefined) delete process.env.DATA_PATH
      else process.env.DATA_PATH = savedDataPath
      if (savedNodeTest !== undefined) process.env.NODE_TEST = savedNodeTest
      rm(fakeAppData)
    }
  })
})

// ── 数据目录只有一份算法 ──────────────────────────────────────

describe('#40 清理和数据库必须算同一个目录', () => {
  test('app-props 的 dataPath 和 sqlite.js / nedb.js 的表达式同形', () => {
    const props = fs.readFileSync(path.join(ROOT, 'src/app/common/app-props.js'), 'utf8')
    // 唯一算法的形状：process.env.DATA_PATH || resolve(<appPath>, 'xnow-terminal')
    assert.match(
      props,
      /const dataPath = process\.env\.DATA_PATH \|\| resolve\(appPaths\.appPath, 'xnow-terminal'\)/,
      'app-props 里的 dataPath 算法变了 —— 数据库那两处也要跟着改，否则清理和数据库会分叉'
    )
    for (const f of ['src/app/lib/sqlite.js', 'src/app/lib/nedb.js']) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      assert.match(
        src,
        /process\.env\.DATA_PATH \|\| resolve\(appPath, 'xnow-terminal'\)/,
        `${f} 里的表达式和 app-props 不一致了`
      )
    }
  })

  test('clear-config.js 不再自己硬编码 appData 路径', () => {
    const src = fs.readFileSync(path.join(ROOT, 'src/app/lib/clear-config.js'), 'utf8')
    assert.ok(
      !/getPath\('appData'\)/.test(src),
      'clear-config.js 自己算了 appData 路径 —— 便携版（appPath=exe 目录）和 ' +
      '自定义 DATA_PATH 都会被算错，必须用 app-props 的 dataPath'
    )
    assert.match(src, /require\('\.\.\/common\/app-props'\)/, '没从 app-props 取 dataPath')
  })
})
