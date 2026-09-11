const { dbAction } = require('./db')
const defaultSetting = require('../common/config-default')
const getPort = require('./get-port')
const { userConfigId, userNoEncryptConfigId } = require('../common/constants')
const { generateWsToken } = require('../common/ws-token')
const globalState = require('./glob-state')

exports.getConfig = async (inited) => {
  const userConfig = await dbAction('data', 'findOne', {
    _id: userConfigId
  }) || {}
  const requireAuth = userConfig.hashedPassword
  delete userConfig._id
  delete userConfig.host
  delete userConfig.terminalTypes
  delete userConfig.tokenElecterm
  delete userConfig.hashedPassword
  delete userConfig.salt
  const port = inited
    ? globalState.get('config').port
    : await getPort()
  const config = {
    ...defaultSetting,
    ...userConfig,
    requireAuth,
    port,
    // WS 鉴权 token 单独用强随机，不用给 ID 的短 uid（ISSUES #3）
    tokenElecterm: inited ? globalState.get('config').tokenElecterm : generateWsToken()
  }
  return {
    userConfig,
    config
  }
}

exports.getDbConfig = async () => {
  const userConfig = await dbAction('data', 'findOne', {
    _id: userConfigId
  }) || {}
  return userConfig
}

exports.getUserConfigNoEnc = async () => {
  const userConfig = await dbAction('data', 'findOne', {
    _id: userNoEncryptConfigId
  }) || {}
  return userConfig
}
