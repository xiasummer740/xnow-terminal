/**
 * ISSUES #22：find 不传 _limit 时被静默砍到 1000 条
 *
 * 这是**跨后端行为分叉**，不是单纯的性能取舍：
 *   · NeDB 那侧（nedb.js 的 find 分支）把 args 原样丢给 NeDB，没有上限
 *   · sqlite 那侧原来 `else { LIMIT 1000 }`
 * 而 Node >= 22 走的就是 sqlite（见 src/app/lib/db.js 的后端选择），所以是线上路径。
 *
 * 后果（都是静默的，没有任何地方报错）：
 *   · ipc.js exportAllBookmarks —— 备份文件被截断，写出去的 totalBookmarks=1000 是假的
 *   · client/common/db.js find() —— 前端列表第 1000 条之后看不见，也就删不掉
 *
 * 关键前提（实测确认，不是推测）：全项目**没有任何调用方**传 _limit ——
 * `grep -rn "_limit" src/` 只命中 sqlite.js 自己。也就是说每一次 find 都吃这个默认值，
 * 「显式传 _limit 就没问题」这条路在真实代码里根本没人走。
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

// 用 1200 条：必须**大于** 1000 才能暴露旧默认值，且留出余量证明不是"恰好等于"
const N = 1200

function tmpDir () {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'xnow-find-limit-'))
}

function dataDir (dir) {
  return path.join(dir, 'xnow-terminal')
}

function mainDbFile (dir) {
  return path.join(dataDir(dir), 'users', 'default_user', 'xnow.db')
}

// 数据库句柄在模块内长期持有，Windows 上删不掉打开中的文件，清理失败不算测试失败
function cleanup (dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch (_) { /* 句柄未释放，留给系统回收 */ }
}

async function seed (dir) {
  const { dbAction } = createDb(dir, 'default_user')
  const docs = []
  for (let i = 0; i < N; i++) {
    docs.push({ _id: `b${String(i).padStart(4, '0')}`, host: `10.0.0.${i % 256}` })
  }
  await dbAction('bookmarks', 'insert', docs)
  return dbAction
}

describe('find 默认返回全部（ISSUES #22）', () => {
  test(`find({}) 必须返回全部 ${N} 条，不是 1000`, async () => {
    const dir = tmpDir()
    const dbAction = await seed(dir)

    const rows = await dbAction('bookmarks', 'find', {})
    assert.equal(
      rows.length,
      N,
      `被截断了：拿到 ${rows.length} 条，库里实际 ${N} 条`
    )
    // 逐条对账，排除"条数对了但内容错了"（比如 WHERE 写歪了）
    const ids = new Set(rows.map(r => r._id))
    assert.ok(ids.has('b0000'), '第一条不在结果里')
    assert.ok(ids.has(`b${String(N - 1).padStart(4, '0')}`), '最后一条不在结果里')
    cleanup(dir)
  })

  test('不传参数（args[0] 是 undefined）也不能截断', async () => {
    // vps-dashboard-subscription.jsx 就是这么调的：runGlobalAsync('dbAction','bookmarks','find')
    const dir = tmpDir()
    const dbAction = await seed(dir)
    const rows = await dbAction('bookmarks', 'find')
    assert.equal(rows.length, N)
    cleanup(dir)
  })

  test('🔴 备份导出：totalBookmarks 必须是真实条数', async () => {
    // 复刻 ipc.js exportAllBookmarks 的取数方式（同样不传 _limit）
    const dir = tmpDir()
    const dbAction = await seed(dir)
    const bookmarks = await dbAction('bookmarks', 'find')
    const bookmarkGroups = await dbAction('bookmarkGroups', 'find')
    const backup = {
      version: 1,
      exportedAt: '2026-09-12T00:00:00.000Z',
      totalBookmarks: bookmarks.length,
      bookmarks,
      bookmarkGroups
    }
    assert.equal(backup.totalBookmarks, N, '备份里写的条数是假的')
    assert.equal(backup.bookmarks.length, N, '备份文件里实际只有这么多条')
    cleanup(dir)
  })

  test('显式传 _limit 仍然照办（分页调用方不受影响）', async () => {
    const dir = tmpDir()
    const dbAction = await seed(dir)
    const rows = await dbAction('bookmarks', 'find', { _limit: 5 })
    assert.equal(rows.length, 5)
    cleanup(dir)
  })

  test('_limit + _skip 组合仍能翻页', async () => {
    const dir = tmpDir()
    const dbAction = await seed(dir)
    const page = await dbAction('bookmarks', 'find', { _limit: 3, _skip: 10 })
    assert.equal(page.length, 3)
    cleanup(dir)
  })

  test('只传 _skip 不能崩 —— SQLite 的 OFFSET 必须挂在 LIMIT 后面', async () => {
    // `SELECT * FROM t OFFSET 2` 在 SQLite 里是语法错误。
    // 改 #22 之前 LIMIT 永远会被加上，所以这个坑是这次才露出来的，得钉住。
    const dir = tmpDir()
    const dbAction = await seed(dir)
    const rows = await dbAction('bookmarks', 'find', { _skip: N - 1 })
    assert.equal(rows.length, 1, 'OFFSET 没生效或直接抛错了')
    cleanup(dir)
  })

  test('_limit 超硬上限会截断，但要在日志里出声', async () => {
    const dir = tmpDir()
    const dbAction = await seed(dir)
    const seen = []
    const orig = console.warn
    console.warn = (...a) => seen.push(a.join(' '))
    try {
      const rows = await dbAction('bookmarks', 'find', { _limit: 999999 })
      assert.equal(rows.length, N, '硬上限 10000 高于本用例的数据量，不该被砍')
      assert.ok(
        seen.some(m => /超过硬上限/.test(m)),
        '截断没有告警 —— 静默截断正是 #22 要消灭的东西'
      )
    } finally {
      console.warn = orig
    }
    cleanup(dir)
  })
})

// ── 反证：旧代码在同一种库上确实只给出 1000 条 ──────────────────
//
// 不复用 git HEAD —— 修复一提交，HEAD 就变成修好的版本，这条反证会自己失效
// （ISSUES #49 踩过这个坑）。所以这里把旧版那条 SQL **照抄**下来跑。
// 旧代码原文（git show 历史版本 src/app/lib/sqlite.js，find 分支的 else）：
//     // 默认最多返回 1000 条，防止全表扫描撑爆内存
//     sql += ' LIMIT ?'; params.push(1000)

test('🔴 反证：旧版那条 `LIMIT 1000` 在同一份数据上只返回 1000 条', async () => {
  const dir = tmpDir()
  const dbAction = await seed(dir)

  // 旧代码在 `find({})` 时拼出来的 SQL，一字不差
  const raw = new DatabaseSync(mainDbFile(dir), { readOnly: true })
  const oldRows = raw.prepare('SELECT * FROM `bookmarks` LIMIT ?').all(1000)
  raw.close()

  assert.equal(
    oldRows.length,
    1000,
    '前提失效：旧 SQL 没有截断到 1000，那 #22 就不是这个问题'
  )

  // 而且截断掉的那些记录是真实存在的 —— 不是库里本来就只有 1000 条
  const rows = await dbAction('bookmarks', 'find', {})
  assert.equal(rows.length, N)
  const oldIds = new Set(oldRows.map(r => r._id))
  const dropped = rows.filter(r => !oldIds.has(r._id))
  assert.equal(dropped.length, N - oldRows.length, '旧版实际丢掉的条数')
  assert.ok(dropped.length > 0, '旧版一条都没丢？那这条反证没意义')
  cleanup(dir)
})
