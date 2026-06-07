/**
 * node fetch in server side
 */

const { createProxyAgent } = require('../lib/proxy-agent')

function fetch(options) {
  const rp = require('axios')
  rp.defaults.proxy = false
  return rp(options)
    .then((res) => {
      return { data: res.data, status: res.status }
    })
    .catch((error) => {
      let message = error.message
      let code = 'NETWORK_ERROR'
      if (error.response) {
        if (error.response.status === 403) {
          message = 'API 请求过于频繁（GitHub 限频），请过几分钟再试'
          code = 'RATE_LIMITED'
        } else if (error.response.status === 404) {
          message = '检查更新地址不存在'
          code = 'NOT_FOUND'
        } else {
          message = `请求失败 (HTTP ${error.response.status})`
          code = 'HTTP_ERROR'
        }
      } else if (error.code === 'ECONNREFUSED') {
        message = '无法连接到更新服务器'
        code = 'CONNECTION_REFUSED'
      } else if (error.code === 'ETIMEDOUT' || error.code === 'ESOCKETTIMEDOUT') {
        message = '请求超时，请检查网络连接'
        code = 'TIMEOUT'
      }
      return { error: message, code }
    })
}

async function wsFetchHandler(ws, msg) {
  const { id, options, proxy } = msg
  const agent = createProxyAgent(proxy)
  if (agent) {
    options.httpsAgent = agent
  }
  const res = await fetch(options)
  if (res.error) {
    ws.s({
      error: res.error,
      code: res.code,
      id,
    })
  } else {
    ws.s({
      data: res.data,
      id,
    })
  }
}

module.exports = wsFetchHandler
