/**
 * upgrade database to v1.32.36
 */

const { dbAction } = require('./nedb-instance')
const { updateDBVersion } = require('./version-upgrade')
const log = require('../common/log')
const { buildSshTunnels } = require('../common/build-ssh-tunnel')

async function fixBookmarks () {
  log.info('开始更新书签 SSH 隧道配置')
  const arr = await dbAction('bookmarks', 'find', {})
  const len = arr.length
  let i = 0
  log.info('书签数量：', len)
  for (const b of arr) {
    log.info(i + 1, b._id, b.sshTunnel ? '有 sshTunnel' : '无 sshTunnel')
    if (b.sshTunnel) {
      const sshTunnels = buildSshTunnels(b)
      delete b.sshTunnel
      delete b.sshTunnelRemotePort
      delete b.sshTunnelLocalPort
      await dbAction('bookmarks', 'update', {
        _id: b._id
      }, {
        ...b,
        sshTunnels
      })
    }
    i = i + 1
  }
}

async function fixAll () {
  await fixBookmarks()
}

module.exports = async () => {
  const versionTo = '1.32.36'
  log.info(`开始：升级到 v${versionTo}`)
  await fixAll()
  await updateDBVersion(versionTo)
  log.info(`完成：升级到 v${versionTo}`)
}
