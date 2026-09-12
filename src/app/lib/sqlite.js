/**
 * sqlite api wrapper
 * Updated to use two database files: one for 'data' table, one for others
 * Accepts appPath and defaultUserName as parameters to avoid electron dependency
 */

const { resolve } = require('path')
const fs = require('fs')
const uid = require('../common/uid')
const { DatabaseSync } = require('node:sqlite')

// Tables whose stored data values should be encrypted at rest
const ENC_TABLES = new Set(['bookmarks', 'profiles', 'data', 'history', 'terminalCommandHistory', 'aiChatHistory'])

// Within the 'data' table, only this specific record is encrypted
const DATA_ENC_ID = 'userConfig'

// Prefix added to stored strings to mark them as encrypted
const ENC_PREFIX = 'enc:'

// find 传了 _limit 时的硬上限。超过就截断，但会打日志 —— 见 dbAction 的 find 分支
const MAX_FIND_LIMIT = 10000

// 解密失败的记录：暂存其原始密文，写回时原样恢复，避免用空对象覆盖造成永久丢失
// key = `${dbName} ${_id}`
const decryptFailedRaw = new Map()

/**
 * 自动备份数据库文件（每天一次，保留 30 天）
 */
function autoBackup (dbFolder, mainDbPath, dataDbPath) {
  const BACKUP_RETENTION_DAYS = 30
  const backupDir = resolve(dbFolder, 'backups')
  try {
    const today = new Date().toISOString().slice(0, 10)
    const backupMain = resolve(backupDir, `xnow-${today}.db`)

    // 只备份主库（xnow.db）即可，数据变动都在主库
    if (fs.existsSync(mainDbPath) && !fs.existsSync(backupMain)) {
      fs.mkdirSync(backupDir, { recursive: true })
      fs.copyFileSync(mainDbPath, backupMain)
      console.log(`[db-backup] 数据库已备份: ${backupMain}`)
    }

    // 清理过期备份
    const now = Date.now()
    const maxAge = BACKUP_RETENTION_DAYS * 86400000
    if (fs.existsSync(backupDir)) {
      for (const f of fs.readdirSync(backupDir)) {
        const fp = resolve(backupDir, f)
        try {
          const stat = fs.statSync(fp)
          if (stat.isFile() && now - stat.mtimeMs > maxAge) {
            fs.unlinkSync(fp)
            console.log(`[db-backup] 清理过期备份: ${f}`)
          }
        } catch (_) { /* 跳过无法访问的文件 */ }
      }
    }
  } catch (e) {
    console.warn('[db-backup] 自动备份失败:', e.message)
  }
}

function createDb (appPath, defaultUserName, { enc, dec } = {}) {
  const appDataPath = process.env.DATA_PATH || resolve(appPath, 'xnow-terminal')

  if (!fs.existsSync(appDataPath)) {
    fs.mkdirSync(appDataPath, { recursive: true })
  }

  // Define database folder and paths for two database files
  const dbFolder = resolve(appDataPath, 'users', defaultUserName)
  const mainDbPath = resolve(dbFolder, 'xnow.db')
  const dataDbPath = resolve(dbFolder, 'xnow_data.db')

  // Ensure parent directory exists
  if (!fs.existsSync(dbFolder)) {
    fs.mkdirSync(dbFolder, { recursive: true })
  }
  // Create two database instances
  const mainDb = new DatabaseSync(mainDbPath)
  const dataDb = new DatabaseSync(dataDbPath)

  // 自动备份：每天首次启动时备份数据库（保留 30 天）
  autoBackup(dbFolder, mainDbPath, dataDbPath)

  const tables = [
    'bookmarks',
    'bookmarkGroups',
    'addressBookmarks',
    'terminalThemes',
    'lastStates',
    'data',
    'quickCommands',
    'log',
    'dbUpgradeLog',
    'profiles',
    'workspaces',
    'history',
    'terminalCommandHistory',
    'aiChatHistory',
    'autoRunWidgets'
  ]

  // Create tables in appropriate databases
  for (const table of tables) {
    if (table === 'data') {
      dataDb.exec(`CREATE TABLE IF NOT EXISTS \`${table}\` (_id TEXT PRIMARY KEY, data TEXT)`)
    } else {
      mainDb.exec(`CREATE TABLE IF NOT EXISTS \`${table}\` (_id TEXT PRIMARY KEY, data TEXT)`)
    }
  }

  // Helper function to get the appropriate database for a table
  function getDatabase (dbName) {
    return dbName === 'data' ? dataDb : mainDb
  }

  /**
   * Encrypt a plain JSON string for storage.
   * Returns the original string when encryption is not configured.
   */
  function encryptData (jsonStr) {
    if (!enc) return jsonStr
    return ENC_PREFIX + enc(jsonStr)
  }

  /**
   * Decrypt a stored string back to plain JSON.
   * Returns the original string when decryption is not configured or the
   * value was stored without encryption.
   */
  function decryptData (stored) {
    if (!dec || !stored) return stored
    if (!stored.startsWith(ENC_PREFIX)) return stored
    return dec(stored.slice(ENC_PREFIX.length))
  }

  function shouldEncForRow (dbName, id) {
    if (dbName === 'data') return id === DATA_ENC_ID
    return ENC_TABLES.has(dbName)
  }

  function toDoc (row, dbName) {
    if (!row) return null
    const shouldDec = dec && shouldEncForRow(dbName, row._id)
    const raw = shouldDec ? decryptData(row.data) : row.data
    let r = {}
    try {
      r = JSON.parse(raw || '{}')
    } catch (e) {
      // 解密失败（safeDecrypt 解不开时会原样返回密文 v2:safe:...，无法 JSON.parse）
      // 这里只能当空记录返回，否则整个列表都读不出来。
      // 但必须把原始密文记下来：上层（watch 同步 / 用户编辑）一旦把它写回，
      // 没有这层兜底就会用 {} 覆盖掉密文，数据永久消失（ISSUES #8）
      if (raw && raw.includes('v2:safe:')) {
        const key = `${dbName}\u0000${row._id}`
        decryptFailedRaw.set(key, row.data)
        console.error(
          `[db] 记录 ${dbName}/${row._id} 解密失败（系统加密密钥已变？），` +
          '本次读为空，但已保留原始密文，写回时会原样恢复'
        )
      } else {
        console.error(`Error parsing JSON for row ${row._id}:`, e.message)
      }
    }
    return {
      ...r,
      _id: row._id
    }
  }

  function toRow (doc, dbName) {
    const _id = doc._id || doc.id || uid()
    // 解密失败的记录：原样写回密文，绝不用空对象覆盖（ISSUES #8）
    const savedRaw = decryptFailedRaw.get(`${dbName}\u0000${_id}`)
    if (savedRaw !== undefined) {
      return {
        _id,
        data: savedRaw
      }
    }
    const copy = { ...doc }
    delete copy._id
    delete copy.id
    const jsonStr = JSON.stringify(copy)
    return {
      _id,
      data: enc && shouldEncForRow(dbName, _id) ? encryptData(jsonStr) : jsonStr
    }
  }

  async function dbAction (dbName, op, ...args) {
    if (op === 'compactDatafile') {
      return
    }
    if (!tables.includes(dbName)) {
      throw new Error(`Table ${dbName} does not exist`)
    }

    // Get the appropriate database for this table
    const db = getDatabase(dbName)

    if (op === 'find') {
      const query = args[0] || {}
      const { _limit, _skip } = query
      let sql = `SELECT * FROM \`${dbName}\``
      const params = []
      if (query._id) {
        sql += ' WHERE _id = ?'
        params.push(query._id)
      }
      if (typeof _limit === 'number') {
        // 显式要多少给多少，只在超过硬上限时截断 —— 但**截断要出声**。
        // 原来这里是静默 Math.min(..., 10000)，跟下面那个默认 1000 是同一类毛病。
        const wanted = Math.max(1, _limit)
        if (wanted > MAX_FIND_LIMIT) {
          console.warn(
            `find(${dbName}) 请求 ${wanted} 条，超过硬上限 ${MAX_FIND_LIMIT}，已截断`
          )
        }
        sql += ' LIMIT ?'
        params.push(Math.min(wanted, MAX_FIND_LIMIT))
      } else if (typeof _skip === 'number') {
        // 只要 OFFSET、不要 LIMIT 时必须补一个 `LIMIT -1`：
        // SQLite 的 OFFSET 只能挂在 LIMIT 后面，单写 OFFSET 是语法错误
        // （`SELECT * FROM t OFFSET 2` → near "2": syntax error）。
        // 改 #22 之前 LIMIT 永远会被加上，所以这个坑是我这次才露出来的。
        sql += ' LIMIT -1'
      }
      // 不传 _limit = 要**全部**（ISSUES #22）。
      //
      // 原来这里是 `LIMIT 1000`，而 NeDB 那侧（nedb.js find 分支）把 args 原样丢给
      // NeDB，没有这个上限 —— 同一个 find({}) 在两个后端返回的行数不一样。
      // 而 Node >= 22 走的就是 sqlite（见 db.js 的后端选择），所以这是线上路径。
      // 全项目**没有任何调用方**传 _limit，也就是说每一次 find 都吃这个默认值：
      //   · app/lib/ipc.js exportAllBookmarks —— 备份被静默截断，
      //     写出去的 totalBookmarks=1000 是假的，第 1000 条之后根本没进备份文件
      //   · client/common/db.js find() —— 前端列表第 1000 条之后看不见，也就删不掉
      //   · vps-dashboard-subscription.jsx —— 同上
      // （迁移脚本不受影响：它们读的是 nedb-instance，读写都在 NeDB 侧。）
      // 所以默认不加 LIMIT，与 NeDB 对齐。要分页的调用方自己传 _limit。
      //
      // 代价（得说清楚，别假装没有）：这 1000 条原本也顺带当了内存护栏。
      // 启动时 load-data.js 会对 dbNames 里每个表调 fetchInitData → find({})，
      // 其中 history / terminalCommandHistory / aiChatHistory 是**无上限增长**的表
      // （ISSUES #23）。实测单行约 1.1KB，10 万行 ≈ 110MB 全进渲染进程，
      // 这是真实存在的风险，不是理论值。
      // 但正确的解法是让那三张表别无限长（#23），或在真正的列表调用方显式分页 ——
      // 而不是全局加一个"悄悄少给你数据"的默认值：备份丢数据是**数据丢失**，
      // 内存占用是**性能问题**，两害相权，不能让前者假装成后者被掩盖。
      if (typeof _skip === 'number') {
        sql += ' OFFSET ?'
        params.push(Math.max(0, _skip))
      }
      const stmt = db.prepare(sql)
      const rows = stmt.all(...params)
      return (rows || []).map(row => toDoc(row, dbName)).filter(Boolean)
    } else if (op === 'findOne') {
      const query = args[0] || {}
      const sql = `SELECT * FROM \`${dbName}\` WHERE _id = ? LIMIT 1`
      const params = [query._id]
      const stmt = db.prepare(sql)
      const row = stmt.get(...params)
      return toDoc(row, dbName)
    } else if (op === 'insert') {
      const inserts = Array.isArray(args[0]) ? args[0] : [args[0]]
      const inserted = []
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const doc of inserts) {
          const { _id, data } = toRow(doc, dbName)
          const stmt = db.prepare(`INSERT OR REPLACE INTO \`${dbName}\` (_id, data) VALUES (?, ?)`)
          stmt.run(_id, data)
          inserted.push({ ...doc, _id })
        }
        db.exec('COMMIT')
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
      return Array.isArray(args[0]) ? inserted : inserted[0]
    } else if (op === 'remove') {
      const query = args[0] || {}
      const sql = `DELETE FROM \`${dbName}\` WHERE _id = ?`
      const params = [query._id]
      const stmt = db.prepare(sql)
      const res = stmt.run(...params)
      return res.changes
    } else if (op === 'update') {
      const query = args[0]
      const updateObj = args[1]
      const options = args[2] || {}
      const { upsert = false } = options
      const qid = query._id || query.id
      db.exec('BEGIN IMMEDIATE')
      try {
        const newData = updateObj.$set || updateObj
        const { _id, data } = toRow({
          _id: qid,
          ...newData
        }, dbName)
        let stmt
        let res
        if (upsert) {
          stmt = db.prepare(`REPLACE INTO \`${dbName}\` (_id, data) VALUES (?, ?)`)
          res = stmt.run(_id, data)
        } else {
          stmt = db.prepare(`UPDATE \`${dbName}\` SET data = ? WHERE _id = ?`)
          res = stmt.run(data, qid)
        }
        db.exec('COMMIT')
        return res.changes
      } catch (e) {
        db.exec('ROLLBACK')
        throw e
      }
    }
  }

  return {
    dbAction,
    tables
  }
}

module.exports = {
  createDb
}
