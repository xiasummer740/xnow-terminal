/**
 * 升级包完整性校验（ISSUES #4）
 *
 * 原来的流程是：下载完 → 拼一个 bat → `start /wait "x.exe" /S` 静默装。
 * **全程不校验任何东西**，而安装包优先从三方镜像（r2 / sourceforge / gh-proxy）
 * 下载。镜像被投毒、或传输被截断，都会把"任意 exe"或"半个 exe"静默装进用户机器。
 *
 * 期望值取自 GitHub release 里的 latest.yml —— electron-builder 发布时自动生成，
 * 带 sha512 和 size。**必须从 GitHub 取，不能从镜像取**：否则投毒的镜像只要
 * 同时端出一份配套的假 yml，就能自圆其说，校验等于没做。
 *
 * 这里只放纯逻辑（解析 + 算哈希），网络和安装编排留在 download-upgrade.js，
 * 这样解析和哈希可以单元测试。
 */

const fs = require('fs')
const { createHash } = require('crypto')

// sha512 是 64 字节，base64 后固定 88 字符
const SHA512_B64_LEN = 88

function stripQuote (s) {
  return String(s).trim().replace(/^['"]|['"]$/g, '')
}

/**
 * 解析 latest.yml，取出指定文件的 { url, sha512, size }
 *
 * 结构是 electron-builder 固定生成的：
 *   version: 1.2.3
 *   files:
 *     - url: X.exe
 *       sha512: <base64>
 *       size: 12345
 *   path: X.exe
 *   sha512: <base64>
 *
 * 不引 yaml 依赖：第三方依赖不随打包产物走，引进来就是运行时 undefined 的隐患。
 * **解析不出来一律返回 null**，调用方按"校验不可用"处理（拒绝静默安装），绝不猜。
 *
 * @param {string} text latest.yml 内容
 * @param {string} fileName 期望匹配的文件名（缺省取第一条）
 * @returns {{url: string, sha512: string, size: number}|null}
 */
function parseLatestYml (text, fileName) {
  if (typeof text !== 'string' || !text.trim()) {
    return null
  }
  const items = []
  let cur = null
  for (const line of text.split(/\r?\n/)) {
    const urlMatch = line.match(/^\s*-\s*url:\s*(.+?)\s*$/)
    if (urlMatch) {
      cur = { url: stripQuote(urlMatch[1]) }
      items.push(cur)
      continue
    }
    if (!cur) {
      continue
    }
    // `\s+` 要求缩进，因此顶层的 `sha512:` / `path:` 不会被算进上面那条记录
    const shaMatch = line.match(/^\s+sha512:\s*(.+?)\s*$/)
    if (shaMatch) {
      cur.sha512 = stripQuote(shaMatch[1])
      continue
    }
    const sizeMatch = line.match(/^\s+size:\s*(\d+)\s*$/)
    if (sizeMatch) {
      cur.size = Number(sizeMatch[1])
    }
  }

  // 精确按文件名取。取不到就返回 null（而不是退回第一条）——
  // 宁可不装，也不拿另一个文件的哈希去放行。
  const hit = fileName
    ? items.find(item => item.url === fileName)
    : items[0]
  if (!hit) {
    return null
  }
  if (!hit.sha512 || hit.sha512.length !== SHA512_B64_LEN) {
    return null
  }
  if (!Number.isInteger(hit.size) || hit.size <= 0) {
    return null
  }
  return { url: hit.url, sha512: hit.sha512, size: hit.size }
}

/**
 * 流式算文件 sha512（base64）。用流是因为安装包 100MB+，不能整个读进内存。
 */
function sha512File (filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha512')
    const stream = fs.createReadStream(filePath)
    stream.on('error', reject)
    stream.on('data', chunk => hash.update(chunk))
    stream.on('end', () => resolve(hash.digest('base64')))
  })
}

/**
 * 校验落盘的安装包
 *
 * 先比大小再比哈希：大小不符能秒判（截断的下载最典型），不必白读 100MB。
 *
 * @returns {Promise<{ok: boolean, reason?: string}>}
 */
async function verifyUpgradeFile (filePath, expected) {
  if (!expected || !expected.sha512) {
    return { ok: false, reason: '没有可用的期望校验值（latest.yml 未取到或解析失败）' }
  }
  let stat
  try {
    stat = await fs.promises.stat(filePath)
  } catch (err) {
    return { ok: false, reason: `安装包不存在：${err.message}` }
  }
  if (expected.size && stat.size !== expected.size) {
    return { ok: false, reason: `大小不符（期望 ${expected.size}，实际 ${stat.size}）` }
  }
  let actual
  try {
    actual = await sha512File(filePath)
  } catch (err) {
    return { ok: false, reason: `读取安装包失败：${err.message}` }
  }
  if (actual !== expected.sha512) {
    return { ok: false, reason: `sha512 不匹配（期望 ${expected.sha512.slice(0, 12)}…，实际 ${actual.slice(0, 12)}…）` }
  }
  return { ok: true }
}

module.exports = { parseLatestYml, sha512File, verifyUpgradeFile }
