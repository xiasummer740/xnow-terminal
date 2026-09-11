/**
 * for new user, they do not have old json db
 * just need init db
 */

const { dbAction } = require('../lib/db')
const log = require('../common/log')
const defaults = require('./db-defaults')

async function initData () {
  log.info('开始：初始化数据库')
  for (const conf of defaults) {
    const {
      db, data
    } = conf
    await dbAction(db, 'insert', data).catch(log.error)
  }
  log.info('结束：初始化数据库')
}

module.exports = initData
