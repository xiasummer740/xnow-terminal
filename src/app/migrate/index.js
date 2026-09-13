/**
 * common data upgrade process
 * It will check current version in db and check version in package.json,
 * run every upgrade script one by one
 */

const { packInfo } = require('../common/app-props')
const { version: packVersion } = packInfo
const { resolve } = require('path')
const fs = require('fs')
const log = require('../common/log')
const compare = require('../common/version-compare')
const { dbAction } = require('./nedb-instance')
const _ = require('../lib/lodash.js')
const { updateDBVersion } = require('./version-upgrade')
const emptyVersion = '0.0.0'
const versionQuery = {
  _id: 'version'
}

async function getDBVersion () {
  const version = await dbAction('data', 'findOne', versionQuery)
    .then(doc => {
      return doc ? doc.value : emptyVersion
    })
    .catch(e => {
      log.error(e)
      return emptyVersion
    })
  return version
}

/**
 * get upgrade versions should be run as version upgrade
 */
async function getUpgradeVersionList () {
  const version = await getDBVersion()
  const list = fs.readdirSync(__dirname)
  return list.filter(f => {
    const vv = f.replace('.js', '').replace('v', '')
    return /^v\d/.test(f) && compare(vv, version) > 0 && compare(vv, packVersion) <= 0
  }).sort((a, b) => {
    return compare(a, b)
  })
}
async function versionShouldUpgrade () {
  const dbVersion = await getDBVersion()
  log.info('数据库版本：', dbVersion)
  return compare(dbVersion, packVersion) < 0
}

async function shouldUpgrade () {
  const shouldUpgradeVersion = await versionShouldUpgrade()
  if (!shouldUpgradeVersion) {
    return false
  }
  const dbVersion = await getDBVersion()
  log.info('数据库版本', dbVersion)
  if (dbVersion === emptyVersion) {
    // 账本是空的（ISSUES #41）。原来这里直接 return false 就完了：版本号永远不写，
    // 于是每次启动都重走一遍这个判断，永远静默跳过，用户侧毫无痕迹。
    //
    // 「跳过历史迁移脚本」这个决定本身是对的 —— 本模块只在 migrate-1-to-2 里被调用，
    // 那时数据正从 nedb 搬进 sqlite，已经是新格式了，重放那些给上古格式写的脚本
    // （v1.3.0 甚至要读 electerm-user-config.json）反而危险。真实安装/升级走的是
    // upgrade/index.js，那边同一个分支会 initData() 后把版本号盖上。
    // 所以这里不改决定，只把版本号补上：账本不再空着，状态在日志里看得见。
    log.warn(
      '数据库版本账本为空（非全新安装），跳过历史迁移脚本，直接把版本号盖到',
      packVersion
    )
    await updateDBVersion(packVersion)
    return false
  }
  const list = await getUpgradeVersionList()
  if (_.isEmpty(list)) {
    await updateDBVersion(packVersion)
    return false
  }
  return {
    dbVersion,
    packVersion
  }
}

async function doUpgrade () {
  const list = await getUpgradeVersionList()
  log.info('正在升级...')
  for (const v of list) {
    const p = resolve(__dirname, v)
    const run = require(p)
    await run()
  }
  log.info('升级结束')
}

exports.checkDbUpgrade = shouldUpgrade
exports.doUpgrade = doUpgrade
