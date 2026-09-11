/**
 * handle sync with WebDAV server
 */

const log = require('../common/log')
const rp = require('axios')
const { createProxyAgent } = require('../lib/proxy-agent')

rp.defaults.proxy = false

/**
 * Create an axios client for WebDAV operations
 */
function createClient (serverUrl, username, password, proxy, skipVerify = false) {
  const https = require('https')

  const proxyAgent = createProxyAgent(proxy)
  let conf
  if (proxyAgent) {
    if (skipVerify) {
      // apply skipVerify through the proxy
      const Cls = proxy.startsWith('http')
        ? require('https-proxy-agent').HttpsProxyAgent
        : require('socks-proxy-agent').SocksProxyAgent
      conf = { httpsAgent: new Cls(proxy, { keepAlive: true, rejectUnauthorized: false }) }
    } else {
      conf = { httpsAgent: proxyAgent }
    }
  } else if (skipVerify) {
    conf = { httpsAgent: new https.Agent({ rejectUnauthorized: false }) }
  } else {
    conf = { proxy: false }
  }

  const auth = Buffer.from(`${username}:${password}`).toString('base64')

  return rp.create({
    ...conf,
    baseURL: serverUrl,
    headers: {
      Authorization: `Basic ${auth}`,
      'Content-Type': 'application/json; charset=utf-8'
    },
    // do not throw on non-2xx so we can log status codes
    validateStatus: () => true
  })
}

/**
 * Ensure directory exists on WebDAV server
 */
async function ensureDir (client, dirPath) {
  log.info(`[WebDAV] 确保目录：${dirPath}`)
  const res = await client.request({
    method: 'MKCOL',
    url: dirPath
  })
  log.info(`[WebDAV] 确保目录：${dirPath} -> ${res.status}`)
  // 201 created, 405 already exists, 200 ok
  if (res.status !== 201 && res.status !== 405 && res.status !== 200) {
    throw new Error(`MKCOL ${dirPath} returned ${res.status}: ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`)
  }
}

/**
 * Upload a file to WebDAV server
 */
async function uploadFile (client, filePath, content) {
  log.info(`[WebDAV] 上传文件：${filePath}`)
  const body = typeof content === 'string' ? content : JSON.stringify(content)
  const res = await client.request({
    method: 'PUT',
    url: filePath,
    data: body,
    headers: {
      'Content-Type': 'application/json; charset=utf-8'
    }
  })
  log.info(`[WebDAV] 上传文件：${filePath} -> ${res.status}`)
  if (res.status >= 200 && res.status < 300) {
    return { success: true }
  }
  const msg = `PUT ${filePath} 返回 ${res.status}：${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`
  log.error(`[WebDAV] ${msg}`)
  return { error: { message: msg } }
}

/**
 * Download a file from WebDAV server
 */
async function downloadFile (client, filePath) {
  log.info(`[WebDAV] 下载文件：${filePath}`)
  const res = await client.request({
    method: 'GET',
    url: filePath
  })
  log.info(`[WebDAV] 下载文件：${filePath} -> ${res.status}`)
  if (res.status === 404) {
    return null
  }
  if (res.status >= 200 && res.status < 300) {
    return typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  }
  const msg = `GET ${filePath} 返回 ${res.status}：${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}`
  log.error(`[WebDAV] ${msg}`)
  return { error: { message: msg } }
}

/**
 * Test connection to WebDAV server
 */
async function test (serverUrl, username, password, proxy, skipVerify) {
  const client = createClient(serverUrl, username, password, proxy, skipVerify)
  try {
    log.info(`[WebDAV] 测试：探测 ${serverUrl}`)
    const res = await client.request({
      method: 'PROPFIND',
      url: '/',
      headers: {
        Depth: '0'
      }
    })
    log.info(`[WebDAV] 测试：PROPFIND / -> ${res.status}`)
    if (res.status === 207 || res.status === 200) {
      return { success: true, status: res.status }
    }
    return { error: { message: `WebDAV server returned ${res.status}: ${typeof res.data === 'string' ? res.data : JSON.stringify(res.data)}` } }
  } catch (err) {
    log.error('[WebDAV] 测试错误：', err.message)
    log.error('[WebDAV] 测试错误堆栈：', err.stack)
    return { error: { message: err.message } }
  }
}

/**
 * Upload electerm data to WebDAV server
 */
async function upload (serverUrl, username, password, data, proxy, skipVerify) {
  const client = createClient(serverUrl, username, password, proxy, skipVerify)
  const basePath = '/electerm'

  try {
    log.info(`[WebDAV] 上传：开始，目标 ${serverUrl}${basePath}`)
    log.info(`[WebDAV] 上传：数据字段 = [${Object.keys(data).join(', ')}]`)

    // Ensure electerm directory exists
    await ensureDir(client, basePath)

    // Upload each file
    for (const [filename, content] of Object.entries(data)) {
      const filePath = `${basePath}/${filename}`
      const result = await uploadFile(client, filePath, content)
      if (result.error) {
        return { error: { message: `Failed to upload ${filename}: ${result.error.message}` } }
      }
    }

    log.info('[WebDAV] 上传完成')
    return { success: true }
  } catch (err) {
    log.error('[WebDAV] 上传错误：', err.message)
    log.error('[WebDAV] 上传错误堆栈：', err.stack)
    return { error: { message: err.message } }
  }
}

/**
 * Download electerm data from WebDAV server
 */
async function download (serverUrl, username, password, proxy, skipVerify) {
  const client = createClient(serverUrl, username, password, proxy, skipVerify)
  const basePath = '/electerm'

  try {
    log.info(`[WebDAV] 下载：从 ${serverUrl}${basePath} 开始`)

    const result = {
      files: {}
    }

    const fileList = [
      'settings.json',
      'bookmarks.json',
      'bookmarkGroups.json',
      'terminalThemes.json',
      'quickCommands.json',
      'profiles.json',
      'addressBookmarks.json',
      'workspaces.json',
      'userConfig.json',
      'electerm-status.json',
      'settings.order.json',
      'bookmarks.order.json',
      'bookmarkGroups.order.json',
      'terminalThemes.order.json',
      'quickCommands.order.json',
      'profiles.order.json',
      'addressBookmarks.order.json',
      'workspaces.order.json'
    ]

    for (const filename of fileList) {
      const filePath = `${basePath}/${filename}`
      const content = await downloadFile(client, filePath)
      if (content && typeof content === 'string') {
        result.files[filename] = {
          content
        }
        log.info(`[WebDAV] 下载：已获取 ${filename}（${content.length} 字符）`)
      }
    }

    log.info(`[WebDAV] 下载完成，共获取 ${Object.keys(result.files).length} 个文件`)
    return result
  } catch (err) {
    log.error('[WebDAV] 下载错误：', err.message)
    log.error('[WebDAV] 下载错误堆栈：', err.stack)
    return { error: { message: err.message } }
  }
}

/**
 * Main WebDAV sync handler
 */
async function doWebdavSync (func, args, token, proxy) {
  log.info(`[WebDAV] doWebdavSync：功能=${func}`)

  // token format: serverUrl####username####password
  const parts = token ? token.split('####') : []
  const serverUrl = parts[0] || ''
  const username = parts[1] || ''
  const password = parts[2] || ''
  const skipVerify = parts[3] === 'true'

  log.info(`[WebDAV] 服务地址=${serverUrl}，用户名=${username}`)

  if (!serverUrl) {
    const msg = '未配置 WebDAV 服务器地址'
    log.error(`[WebDAV] ${msg}`)
    return { error: { message: msg } }
  }

  try {
    switch (func) {
      case 'test':
        return await test(serverUrl, username, password, proxy, skipVerify)
      case 'upload':
        return await upload(serverUrl, username, password, args[0], proxy, skipVerify)
      case 'download':
        return await download(serverUrl, username, password, proxy, skipVerify)
      default: {
        const msg = `未知的 WebDAV 操作：${func}`
        log.error(`[WebDAV] ${msg}`)
        return { error: { message: msg } }
      }
    }
  } catch (err) {
    log.error('[WebDAV] 同步错误：', err.message)
    log.error('[WebDAV] 同步错误堆栈：', err.stack)
    return { error: { message: err.message } }
  }
}

module.exports = doWebdavSync
