/**
 * user-controll.json controll
 */

const { dbAction } = require('./db')
const { userConfigId, userNoEncryptConfigId } = require('../common/constants')
const { getDbConfig } = require('./get-config')
const globalState = require('./glob-state')

const configNoEncryptFields = ['allowMultiInstance']

function hasNoEncryptFields (userConfig) {
  for (const f of configNoEncryptFields) {
    if (f in userConfig) {
      return true
    }
  }
  return false
}

/**
 * 落库那一段：**读旧值 → 合并 → 写回**，中间隔着 `await getDbConfig()`。
 * 拆出来是为了能整段串进下面的链里 —— 关键是「读」必须发生在锁内
 * （见 saveUserConfig 的说明），不能读完了再排队。
 */
async function writeConfig (userConfig) {
  const q = {
    _id: userConfigId
  }
  const conf = await getDbConfig()
  if (hasNoEncryptFields(userConfig)) {
    const q1 = {
      _id: userNoEncryptConfigId
    }
    const noEncryptConfig = {}
    for (const f of configNoEncryptFields) {
      if (f in userConfig) {
        noEncryptConfig[f] = userConfig[f]
      }
    }
    await dbAction('data', 'update', q1, noEncryptConfig, {
      upsert: true
    })
  }
  return dbAction('data', 'update', q, {
    ...q,
    ...conf,
    ...userConfig
  }, {
    upsert: true
  })
}

// 保存串行化用的链（ISSUES #50）。
//
// 原来是各存各的：A 读旧值 → (await) → B 读旧值 → A 写回 → **B 用自己读到的旧值
// 把 A 刚写的盖回去**。丢的恰好是"不在自己这次 payload 里"的那些字段。
//
// 什么情况下会并发：`watch.js` 的 debounce 到点触发一次保存，同一时刻
// `flushConfigSave()`（退出路径，#49 加的）又发一次 —— 关窗那一刻就能撞上。
// 所以 #49 的 flush 让这条竞态更容易发生，不是无关的两件事。
//
// 修法：把「读-改-写」整体串成一条链。**读**在锁内，读到的必然是上一次写的结果，
// 于是合并的基础不再过期。
let saveChain = Promise.resolve()

exports.saveUserConfig = (userConfig) => {
  // 同步部分不进锁：它不碰数据库，而且谁后写谁就是最终状态（内存语义本来就该如此）。
  // 剔除这些字段是因为它们由 getConfig 现算，落库没意义还会过期。
  delete userConfig.host
  delete userConfig.terminalTypes
  delete userConfig.tokenElecterm
  delete userConfig.server
  delete userConfig.port
  globalState.update('config', userConfig)

  // 前一次失败也要继续跑（`.then(f, f)`）—— 否则一次写库异常会把后续保存全卡死，
  // 那比原来丢字段更糟。saveChain 自己再接一个吞掉结果的 .then，避免未处理拒绝。
  const p = saveChain.then(
    () => writeConfig(userConfig),
    () => writeConfig(userConfig)
  )
  saveChain = p.then(() => {}, () => {})
  return p
}
