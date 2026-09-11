/**
 * fs in child process
 */

const { fsExport: fs } = require('../lib/fs')
const fsFunctions = require('../common/fs-functions')
const log = require('../common/log')

// 只认名单里的名字（ISSUES #3）。
// 原来直接 fs[func]，func 完全由客户端消息决定 —— 既能摸到原型链成员
// （constructor / __proto__ / toString），也能调名单外的 fs/promises 函数。
const allowed = new Set(fsFunctions)

function handleFs (ws, msg) {
  const { id, args, func } = msg
  if (!allowed.has(func)) {
    log.warn('拒绝未登记的文件操作:', func)
    ws.s({
      id,
      error: {
        message: `不允许的文件操作: ${func}`
      }
    })
    return
  }
  fs[func](...args)
    .then(data => {
      ws.s({
        id,
        data
      })
    })
    .catch(err => {
      ws.s({
        id,
        error: {
          message: err.message,
          stack: err.stack
        }
      })
    })
}

module.exports = handleFs
