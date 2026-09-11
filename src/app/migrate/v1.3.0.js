/**
 * upgrade database to v1.3.0
 * migrate old file based db to nedb
 */

const { resolve } = require('path')
const { dbAction, tables } = require('./nedb-instance')
const { appPath } = require('../common/app-props')
const userConfigPath = resolve(appPath, 'electerm-user-config.json')
const savePath = resolve(appPath, 'electerm-localstorage.json')
const { existsSync, unlinkSync, writeFileSync } = require('fs')
const log = require('../common/log')
const _ = require('../lib/lodash.js')
const { userConfigId } = require('../common/constants')
const { updateDBVersion } = require('./version-upgrade')

async function loadArr (arr, name) {
  await dbAction(name, 'insert', arr.map(d => {
    const { id, ...rest } = d
    return {
      _id: id,
      ...rest
    }
  })).catch(log.error)
}

function shouldLoadAsArray (key, value) {
  return tables.includes(key) && _.isArray(value) && value.length && value[0].id
}

async function migrateData () {
  const exist = existsSync(savePath)
  if (!exist) {
    return false
  }
  log.log('开始迁移数据')
  let json = {}
  try {
    json = require(savePath)
  } catch (e) {
    log.error(e)
    log.error('加载 JSON 数据失败')
  }
  const keys = Object.keys(json)
  for (const k of keys) {
    const v = json[k]
    const _id = k.startsWith('laststate')
      ? k.split('.')[1]
      : k
    const db = k.startsWith('laststate')
      ? 'lastStates'
      : 'data'
    if (k === 'themes') {
      const vs = Object.values(v)
      for (const vv of vs) {
        const { id, ...rest } = vv
        await dbAction('terminalThemes', 'insert', {
          _id: id,
          ...rest
        }).catch(log.error)
      }
    } else if (shouldLoadAsArray(k, v)) {
      await loadArr(v, k)
    } else {
      await dbAction(db, 'insert', {
        _id,
        value: v
      }).catch(log.error)
    }
  }
  await writeFileSync(savePath + '.backup', JSON.stringify(json))
  await unlinkSync(savePath)
  log.log('完成迁移数据')
}

async function migrateUserConfig () {
  const exist = existsSync(userConfigPath)
  if (!exist) {
    return false
  }
  log.log('开始迁移用户配置')
  let uf = {}
  try {
    uf = require(userConfigPath)
  } catch (e) {
    log.error(e)
    log.error('加载用户配置失败')
  }
  await dbAction('data', 'update', {
    _id: userConfigId
  }, {
    _id: userConfigId,
    value: uf
  }, {
    upsert: true
  }).catch(log.error)
  log.log('完成迁移用户配置')
}

module.exports = async () => {
  const versionTo = '1.3.0'
  log.info(`开始：升级到 v${versionTo}`)
  await migrateData()
  await migrateUserConfig()
  await updateDBVersion(versionTo)
  log.info(`完成：升级到 v${versionTo}`)
}
