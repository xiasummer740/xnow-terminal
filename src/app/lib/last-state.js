/**
 * set/get app last state
 */

const { dbAction } = require('./db')
const log = require('../common/log')
let count = 0
const set = (key, value) => {
  count = count + 1
  if (count > 100) {
    count = 0
    // 签名是 dbAction(dbName, op, ...args)，原来只传了一个参数：
    // dbName 变成了 'compactDatafile'、op 变成 undefined → sqlite 抛
    // `Table compactDatafile does not exist`、NeDB 取到 undefined 方法报错，
    // 于是**每写满 100 次就刷一条错误日志，而压缩从来没发生过**（ISSUES #38）
    dbAction('lastStates', 'compactDatafile').catch(log.error)
  }
  return dbAction('lastStates', 'update', {
    _id: key
  }, {
    _id: key,
    value
  }, {
    upsert: true
  })
}

const get = async (key) => {
  const res = await dbAction('lastStates', 'findOne', {
    _id: key
  })
    .catch(e => {
      log.error(e)
      log.error('获取最后状态出错')
    })
  return res ? res.value : null
}

const clear = (key) => {
  const q = key
    ? { _id: key }
    : {}
  return dbAction('lastStates', 'remove', q)
}

module.exports = {
  set,
  get,
  clear
}
