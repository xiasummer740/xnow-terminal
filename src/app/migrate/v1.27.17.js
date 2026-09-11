/**
 * upgrade database to v1.27.7
 */

const { userConfigId } = require('../common/constants')
const { dbAction } = require('./nedb-instance')
const { updateDBVersion } = require('./version-upgrade')
const log = require('../common/log')
const { buildProxyString } = require('../lib/build-proxy')

async function fixConf () {
  log.info('开始更新全局代理配置')
  const q = {
    _id: userConfigId
  }
  const conf = await dbAction('data', 'findOne', q)
  if (!conf) {
    return
  }
  const proxy = buildProxyString(conf)
  if (proxy) {
    conf.proxy = proxy
  }
  const props = [
    'proxyPort', 'proxyType', 'proxyIp', 'proxyUsername', 'proxyPassword'
  ]
  for (const p of props) {
    delete conf[p]
  }
  await dbAction('data', 'update', q, {
    ...q,
    ...conf
  })
}

async function fixBookmarks () {
  log.info('开始更新书签代理配置')
  const arr = await dbAction('bookmarks', 'find', {})
  const len = arr.length
  let i = 0
  log.info('书签数量：', len)
  for (const b of arr) {
    const proxy = buildProxyString(b.proxy || {})
    log.info(i + 1, b._id, proxy)
    await dbAction('bookmarks', 'update', {
      _id: b._id
    }, {
      ...b,
      proxy
    })
    i = i + 1
  }
}

async function fixAll () {
  await fixConf()
  await fixBookmarks()
}

module.exports = async () => {
  const versionTo = '1.27.17'
  log.info(`开始：升级到 v${versionTo}`)
  await fixAll()
  await updateDBVersion(versionTo)
  log.info(`完成：已升级到 v${versionTo}`)
}
