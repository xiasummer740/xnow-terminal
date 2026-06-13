/**
 * download upgrade class — with multi-mirror fallback
 */

const fs = require('fs')
const { resolve } = require('path')
const { spawn } = require('child_process')
const _ = require('../lib/lodash.js')
const rp = require('axios')
const { packInfo, tempDir, isWin } = require('../common/runtime-constants')
const installSrc = require('../lib/install-src')
const { fsExport } = require('../lib/fs')
const { createProxyAgent } = require('../lib/proxy-agent')
const { openFile, rmrf } = fsExport
const log = require('../common/log')
const globalState = require('./global-state')

rp.defaults.proxy = false

function getUrl(url, mirror) {
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
async function getReleaseInfo(filter, agent) {
  const url = 'https://api.github.com/repos/xiasummer740/xnow-terminal/releases/latest'
  const conf = {
    url,
    timeout: 15000,
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': 'XNOW-Terminal',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  }
  if (agent) {
    conf.httpsAgent = agent
  }
  const res = await rp(conf)
  const assets = res.data.assets.filter(filter)
  if (!assets.length) return null
  const asset = assets[0]
  return {
    name: asset.name,
    size: asset.size,
    browser_download_url: asset.browser_download_url,
    html_url: res.data.html_url,
  }
}

/**
 * Try to download from a given mirror URL.
 * Returns the read stream on success, null on failure.
 */
async function tryDownload(remotePath, httpsAgent) {
  try {
    const res = await rp({
      url: remotePath,
      httpsAgent,
      responseType: 'stream',
      timeout: 30000,
    })
    return res.data
  } catch (_) {
    return null
  }
}

class Upgrade {
  constructor(options) {
    this.options = options
  }

  async init() {
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
      this.onError(err, id, ws),
    )
    if (!releaseInfo) {
      return
    }
    const localPath = resolve(tempDir, releaseInfo.name)
    const { size } = releaseInfo
    this.id = id
    this.localPath = localPath
    await rmrf(localPath).catch(log.error)

    // ── Multi-mirror fallback ──────────────────────────────────────
    // Order: selected mirror → GitHub direct → send fatal error
    const mirrorUrls = [
      getUrl(releaseInfo.browser_download_url, mirror), // user's chosen mirror (e.g. r2)
      releaseInfo.browser_download_url, // GitHub direct fallback
    ]

    let readSteam = null
    for (const url of mirrorUrls) {
      readSteam = await tryDownload(url, agent)
      if (readSteam) {
        log.info('upgrade', 'downloading from', url)
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
        data: Math.floor((count * 100) / size),
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
      writeSteam.end('', () => this.onEnd(id, ws))
    })

    readSteam.on('error', (err) => this.onError(err, id, ws))

    this.readSteam = readSteam
    this.writeSteam = writeSteam
    this.ws = ws
    this.destroy = this.destroy.bind(this)
  }

  onEnd(id, ws) {
    if (this.onDestroy) return
    const localPath = this.localPath

    if (isWin && localPath.endsWith('.exe')) {
      // ── Windows NSIS：静默安装 ────────────────────────────
      log.info('[upgrade] 下载完成，启动静默安装:', localPath)
      try {
        const batPath = resolve(tempDir, `xnow-update-${id}.bat`)
        const batContent = [
          '@echo off',
          `ping 127.0.0.1 -n 4 > nul 2>&1`,
          `start "" /wait "${localPath}" /S`,
          `del "${localPath}" > nul 2>&1`,
          `del "%~f0" > nul 2>&1`,
        ].join('\r\n')
        fs.writeFileSync(batPath, batContent, 'utf8')
        spawn(batPath, [], { detached: true, stdio: 'ignore' }).unref()
        // 通知主进程退出应用，批处理脚本稍后执行静默安装
        process.send({ quitAndInstall: true })
        ws.s({ id: 'upgrade:end:' + id })
      } catch (err) {
        // 静默安装准备失败 → 回退到手动安装
        log.error('[upgrade] 静默安装准备失败，回退到手动安装:', err.message)
        openFile(localPath)
        process.send({ showFileInFolder: localPath })
        ws.s({ id: 'upgrade:end:' + id })
      }
    } else {
      // ── 其他平台/格式：打开文件让用户手动安装 ────────────
      openFile(localPath)
      process.send({ showFileInFolder: localPath })
      ws.s({
        id: 'transfer:end:' + id,
        data: this.dir,
      })
    }
  }

  onError(err, id, ws) {
    ws.s({
      wid: 'upgrade:err:' + id,
      error: {
        message: err.message,
        stack: err.stack,
      },
    })
  }

  /**
   * All mirrors exhausted — send a fatal error that the UI will
   * render as a manual download link.
   */
  onFatalError(id, ws, downloadUrl) {
    ws.s({
      wid: 'upgrade:err:' + id,
      error: {
        message: 'ALL_MIRRORS_FAILED',
        downloadUrl,
      },
    })
  }

  pause() {
    this.pausing = true
    this.readSteam.pause()
  }

  resume() {
    this.pausing = false
    this.readSteam.resume()
  }

  destroy() {
    this.onDestroy = true
    this.readSteam && this.readSteam.destroy()
    this.ws && this.ws.close()
    globalState.removeUpgradeInst(this.id)
  }

  // end
}

exports.Upgrade = Upgrade
