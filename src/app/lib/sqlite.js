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

/**
 * 自动备份数据库文件（每天一次，保留 30 天）
 */
function autoBackup (dbFolder, mainDbPath, dataDbPath) {
  const BACKUP_RETENTION_DAYS = 30
  const backupDir = resolve(dbFolder, 'backups')
  try {
    const today = new Date().toISOString().slice(0, 10)
    const backupMain = resolve(backupDir, `xnow-${today}.db`)
    const backupData = resolve(backupDir, `xnow_data-${today}.db`)

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
      // 当 safeStorage 解密失败时，加密原文 (v2:safe:...) 无法 JSON.parse
      // 静默忽略，当该字段不存在处理
      if (raw && raw.includes('v2:safe:')) {
        r = {}
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
        sql += ' LIMIT ?'
        params.push(Math.min(Math.max(1, _limit), 10000))
      } else {
        // 默认最多返回 1000 条，防止全表扫描撑爆内存
        sql += ' LIMIT ?'
        params.push(1000)
      }
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
