/**
 * migrate from NeDB (v1) to SQLite (v2)
 */

const { resolve } = require('path')
const { existsSync, renameSync } = require('fs')
const { appPath, defaultUserName } = require('../common/app-props')
const log = require('../common/log')

const reso = (name) => {
  return resolve(appPath, 'electerm', 'users', defaultUserName, `electerm.${name}.nedb`)
}

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
  'profiles'
]

/**
 * Check if migration from v1 (NeDB) to v2 (SQLite) is needed
 * @returns {boolean} true if migration is needed
 */
function checkMigrate () {
  if (process.versions.node < '22.0.0') {
    return false
  }
  // Check if any NeDB files exist
  for (const table of tables) {
    const nedbPath = reso(table)
    if (existsSync(nedbPath)) {
      return true
    }
  }
  return false
}

/**
 * Migrate all data from NeDB to SQLite and backup NeDB files
 */
async function migrate () {
  log.info('开始从 NeDB (v1) 迁移到 SQLite (v2)...')
  // nedb-instance: raw nedb without enc/dec (legacy data was never encrypted)
  const { dbAction: nedbDbAction } = require('./nedb-instance')
  // 写入侧必须和读的那侧用同一对 enc/dec（ISSUES #21）。
  //
  // 原来这里是 `createSqlite(appPath, defaultUserName)` —— 第三个参数没传，
  // 于是 sqlite.js 里 `enc` 是 undefined，toRow 的 `enc && shouldEncForRow(...)`
  // 短路成 false，**整库原样明文落盘**。书签里存着 SSH 密码，就是明文密码。
  //
  // 原来的理由是「safeStorage 在 IPC/迁移上下文里跨重启不可靠，等用户下次编辑时
  // 自然会加密」—— 这个理由站不住：
  //   1. 只有用户**再手工编辑过**的那几条会被重新加密，没碰过的永远明文
  //   2. safeEncrypt 本身就有三级兜底（safeStorage → 本机密钥 AES-256-GCM
  //      → 带标记的不安全存储），见 safe-storage.js。就算系统级真的不可用，
  //      也会落到第二级**照样加密**，而不是干脆不加密
  // 所以这里直接复用 db.js 用的那对函数，读写同源，不会出现"写得进读不出"。
  const { appPath, defaultUserName } = require('../common/app-props')
  const { createDb: createSqlite } = require('../lib/sqlite')
  const { safeEncrypt, safeDecrypt } = require('../lib/safe-storage')
  const { dbAction: sqliteDbAction } = createSqlite(
    appPath,
    defaultUserName,
    { enc: safeEncrypt, dec: safeDecrypt }
  )
  const {
    checkDbUpgrade,
    doUpgrade
  } = require('./index')
  if (await checkDbUpgrade()) {
    await doUpgrade()
  }

  // Migrate data from each table
  for (const table of tables) {
    const nedbPath = reso(table)

    if (existsSync(nedbPath)) {
      log.info(`正在迁移表：${table}`)

      // Read all data from NeDB (unencrypted legacy data)
      const nedbData = await nedbDbAction(table, 'find', {})

      if (nedbData && nedbData.length > 0) {
        log.info(`在 ${table} 中找到 ${nedbData.length} 条记录`)

        // Insert/update data into SQLite via db.js so enc/dec is applied
        for (const record of nedbData) {
          // Ensure record has an _id field
          const recordId = record._id || record.id
          if (!recordId) {
            log.warn(`表 ${table} 中的记录没有 _id 或 id 字段，已跳过：`, record)
            continue
          }
          // Use update with upsert option to handle existing records gracefully
          await sqliteDbAction(table, 'update',
            { _id: recordId },
            { $set: record },
            { upsert: true }
          )
        }

        log.info(`已成功从 ${table} 迁移 ${nedbData.length} 条记录`)
      } else {
        log.info(`表 ${table} 为空，无需迁移`)
      }

      // Rename NeDB file to .bak
      const backupPath = nedbPath + '.bak'
      try {
        renameSync(nedbPath, backupPath)
        log.info(`已将 ${nedbPath} 备份为 ${backupPath}`)
      } catch (renameError) {
        log.error(`备份 ${nedbPath} 出错：`, renameError)
      }
    } else {
      log.info(`表 ${table} 对应的 NeDB 文件不存在，已跳过`)
    }
  }

  log.info('已成功完成从 NeDB 到 SQLite 的迁移')
  return true
}

module.exports = {
  checkMigrate,
  migrate
}
