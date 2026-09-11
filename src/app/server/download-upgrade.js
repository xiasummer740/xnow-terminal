/**
 * download upgrade class — with multi-mirror fallback
 */

const fs = require('fs')
const { resolve } = require('path')
const { spawn } = require('child_process')
const _ = require('../lib/lodash.js')
const rp = require('axios')
const { tempDir, isWin } = require('../common/runtime-constants')
const installSrc = require('../lib/install-src')
const { fsExport } = require('../lib/fs')
const { createProxyAgent } = require('../lib/proxy-agent')
const { openFile, rmrf } = fsExport
const log = require('../common/log')
const globalState = require('./global-state')
const { parseLatestYml, verifyUpgradeFile } = require('./upgrade-verify')

rp.defaults.proxy = false

function getUrl (url, mirror) {
  if (mirror === 'gh-proxy') {
    return `https://electerm-mirror.html5beta.com/${url}`
  }
  if (mirror === 'sourceforge') {
    const arr = url.split('/')
    const len = arr.length
    return `https://master.dl.sourceforge.net/project/electerm.mirror/${arr[len - 2]}/${arr[len - 1]}?viasf=1`
  } else if (mirror === 'r2') {
    return `https://pub-3a40c788aa6548eb91ed27a48ec6a9b1.r2.dev/r/${url.split('/').pop()}`
  } else {
    return url
  }
}

/**
 * Fetch release info from GitHub API (same endpoint the version check uses).
 */
async function getReleaseInfo (filter, agent) {
  const url = 'https://api.github.com/repos/xiasummer740/xnow-terminal/releases/latest'
  const conf = {
    url,
    timeout: 15000,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'XNOW-Terminal',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  }
  if (agent) {
    conf.httpsAgent = agent
  }
  const res = await rp(conf)
  const assets = res.data.assets.filter(filter)
  if (!assets.length) return null
  const asset = assets[0]
  // latest.yml 是 electron-builder 发布时生成的校验清单（sha512 + size）。
  // 只认 GitHub 上这一份 —— 镜像可以提供安装包，但不能提供"期望值"（ISSUES #4）。
  const ymlAsset = res.data.assets.find(a => a.name === 'latest.yml')
  return {
    name: asset.name,
    size: asset.size,
    browser_download_url: asset.browser_download_url,
    html_url: res.data.html_url,
    checksumUrl: ymlAsset && ymlAsset.browser_download_url
  }
}

/**
 * 取 latest.yml 并解析出该安装包的期望 sha512 + size。
 * 取不到/解析不了返回 null，调用方按"无法校验"处理。
 */
async function getExpectedIntegrity (checksumUrl, fileName, agent) {
  if (!checksumUrl) {
    log.warn('升级', '该 release 没有 latest.yml 资源，无法校验安装包')
    return null
  }
  try {
    const res = await rp({
      url: checksumUrl,
      timeout: 15000,
      responseType: 'text',
      transformResponse: [d => d],
      httpsAgent: agent
    })
    return parseLatestYml(res.data, fileName)
  } catch (err) {
    log.warn('升级', '获取 latest.yml 失败:', err.message)
    return null
  }
}

/**
 * Try to download from a given mirror URL.
 * Returns the read stream on success, null on failure.
 */
async function tryDownload (remotePath, httpsAgent) {
  try {
    const res = await rp({
      url: remotePath,
      httpsAgent,
      responseType: 'stream',
      timeout: 30000
    })
    return res.data
  } catch (_) {
    return null
  }
}

class Upgrade {
  constructor (options) {
    this.options = options
  }

  async init () {
    const { id, ws, proxy, mirror } = this.options
    const agent = createProxyAgent(proxy)
    const filter = (r) => {
      if (isWin) {
        // 优先 NSIS 安装器（支持静默安装），兜底 tar.gz
        return r.name.endsWith('-installer.exe') || r.name.endsWith(installSrc)
      }
      return r.name.endsWith(installSrc)
    }
    const releaseInfo = await getReleaseInfo(filter, agent).catch((err) =>
      this.onError(err, id, ws)
    )
    if (!releaseInfo) {
      return
    }
    const localPath = resolve(tempDir, releaseInfo.name)
    const { size } = releaseInfo
    this.id = id
    this.localPath = localPath
    this.htmlUrl = releaseInfo.html_url
    // 先拿期望值：拿到就能在安装前卡一道，拿不到也不阻断下载
    // （用户在墙内可能下得了镜像、取不到 GitHub，此时降级为手动安装）
    this.expected = await getExpectedIntegrity(releaseInfo.checksumUrl, releaseInfo.name, agent)
    if (this.expected) {
      log.info('升级', '已取得校验清单，期望 sha512:', this.expected.sha512.slice(0, 12) + '…')
    }
    await rmrf(localPath).catch(log.error)

    // ── Multi-mirror fallback ──────────────────────────────────────
    // Order: selected mirror → GitHub direct → send fatal error
    const mirrorUrls = [
      getUrl(releaseInfo.browser_download_url, mirror), // user's chosen mirror (e.g. r2)
      releaseInfo.browser_download_url // GitHub direct fallback
    ]

    let readSteam = null
    for (const url of mirrorUrls) {
      readSteam = await tryDownload(url, agent)
      if (readSteam) {
        log.info('升级', '下载地址：', url)
        break
      }
    }

    if (!readSteam) {
      // All mirrors failed — send a fatal error with download link
      this.onFatalError(id, ws, releaseInfo.html_url)
      return
    }

    const writeSteam = fs.createWriteStream(localPath)

    let count = 0

    this.pausing = false

    this.onData = _.throttle((count) => {
      if (this.onDestroy) {
        return
      }

      ws.s({
        id: 'upgrade:data:' + id,
        data: Math.floor((count * 100) / size)
      })
    }, 1000)

    readSteam.on('data', (chunk) => {
      const res = writeSteam.write(chunk)
      if (res) {
        count += chunk.length
        this.onData(count)
      } else {
        readSteam.pause()
        writeSteam.once('drain', () => {
          count += chunk.length
          this.onData(count)
          if (!this.pausing) {
            readSteam.resume()
          }
        })
      }
    })

    readSteam.on('close', () => {
      // 注意：连接中断也会触发 close，所以"下完了"不等于"下对了"——
      // 必须先过 onDownloaded 的校验才能装（ISSUES #4）
      writeSteam.end('', () => this.onDownloaded(id, ws))
    })

    readSteam.on('error', (err) => this.onError(err, id, ws))

    this.readSteam = readSteam
    this.writeSteam = writeSteam
    this.ws = ws
    this.destroy = this.destroy.bind(this)
  }

  /**
   * 下载结束 → 先校验完整性，过关才进入安装（ISSUES #4）
   *
   * 两种失败要分开对待，不能一刀切：
   *   - **有期望值但对不上** → 文件是坏的或被人换过，删掉，且绝不打开
   *   - **压根取不到期望值** → 只是"没能证明它是好的"，文件未必有问题，保留下来
   *     交给用户手动装（手动 = 用户自己确认，跟静默装不是一回事）
   */
  async onDownloaded (id, ws) {
    if (this.onDestroy) return
    const localPath = this.localPath

    if (!this.expected) {
      log.warn('[upgrade] 无法取得校验清单，不做静默安装，改为手动安装:', localPath)
      this.manualInstall(id, ws, localPath)
      return
    }

    const { ok, reason } = await verifyUpgradeFile(localPath, this.expected)
    if (!ok) {
      log.error('[upgrade] 安装包校验未通过，拒绝安装:', reason)
      await rmrf(localPath).catch(log.error)
      this.onFatalError(id, ws, this.htmlUrl, 'CHECKSUM_MISMATCH')
      return
    }
    log.info('[upgrade] 安装包校验通过（sha512 + size 与 latest.yml 一致）')
    this.onEnd(id, ws)
  }

  /**
   * 打开文件让用户自己装（静默安装的降级路径，也是非 Windows 平台的正常路径）
   */
  manualInstall (id, ws, localPath) {
    openFile(localPath)
    process.send({ showFileInFolder: localPath })
    ws.s({ id: 'upgrade:end:' + id })
  }

  onEnd (id, ws) {
    if (this.onDestroy) return
    const localPath = this.localPath

    if (isWin && localPath.endsWith('.exe')) {
      // ── Windows NSIS：静默安装（已过校验）────────────────
      log.info('[upgrade] 校验通过，启动静默安装:', localPath)
      try {
        // id 来自客户端消息，直接拼进文件名会被 `../` 跳出 tempDir
        const batPath = resolve(tempDir, `xnow-update-${String(id).replace(/[^\w-]/g, '')}.bat`)
        const batContent = [
          '@echo off',
          'ping 127.0.0.1 -n 4 > nul 2>&1',
          `start "" /wait "${localPath}" /S`,
          `del "${localPath}" > nul 2>&1`,
          'del "%~f0" > nul 2>&1'
        ].join('\r\n')
        fs.writeFileSync(batPath, batContent, 'utf8')
        spawn(batPath, [], { detached: true, stdio: 'ignore' }).unref()
        // 通知主进程退出应用，批处理脚本稍后执行静默安装
        process.send({ quitAndInstall: true })
        ws.s({ id: 'upgrade:end:' + id })
      } catch (err) {
        // 静默安装准备失败 → 回退到手动安装
        log.error('[upgrade] 静默安装准备失败，回退到手动安装:', err.message)
        this.manualInstall(id, ws, localPath)
      }
    } else {
      // ── 其他平台/格式：打开文件让用户手动安装 ────────────
      this.manualInstall(id, ws, localPath)
    }
  }

  onError (err, id, ws) {
    ws.s({
      wid: 'upgrade:err:' + id,
      error: {
        message: err.message,
        stack: err.stack
      }
    })
  }

  /**
   * All mirrors exhausted — send a fatal error that the UI will
   * render as a manual download link.
   * CHECKSUM_MISMATCH 也走这里：都给用户一个去官网重新下载的出口。
   */
  onFatalError (id, ws, downloadUrl, message = 'ALL_MIRRORS_FAILED') {
    ws.s({
      wid: 'upgrade:err:' + id,
      error: {
        message,
        downloadUrl
      }
    })
  }

  pause () {
    this.pausing = true
    this.readSteam.pause()
  }

  resume () {
    this.pausing = false
    this.readSteam.resume()
  }

  destroy () {
    this.onDestroy = true
    this.readSteam && this.readSteam.destroy()
    this.ws && this.ws.close()
    globalState.removeUpgradeInst(this.id)
  }

  // end
}

exports.Upgrade = Upgrade
// 供验证脚本走真实网络校验 latest.yml 的解析（temp/verify-issue4.js）
exports.getReleaseInfo = getReleaseInfo
exports.getExpectedIntegrity = getExpectedIntegrity
