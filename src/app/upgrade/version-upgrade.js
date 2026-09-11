/**
 * upgrade db version
 */

/**
 * common data upgrade process
 * It will check current version in db and check version in package.json,
 * run every upgrade script one by one
 */

const log = require('../common/log')
const { dbAction } = require('../lib/db')

async function updateDBVersion (toVersion) {
  const versionQuery = {
    _id: 'version'
  }
  log.info('将数据库版本升级到', toVersion)
  await dbAction('data', 'update', versionQuery, {
    ...versionQuery,
    value: toVersion
  }, {
    upsert: true
  })
    .catch(e => {
      log.error(e)
      log.error('升级数据库版本出错', toVersion)
    })
  await dbAction('dbUpgradeLog', 'insert', {
    time: Date.now(),
    toVersion
  })
    .catch(e => {
      log.error(e)
      log.error('插入 dbUpgradeLog 出错', toVersion)
    })
}

exports.updateDBVersion = updateDBVersion
