/**
 * 用系统浏览器打开外链，并限制协议（ISSUES #1）
 *
 * 不能无脑 shell.openExternal：`file://` 会打开/执行本机文件，
 * Windows 上还有一批协议处理器（ms-msdt: / search-ms: / shell: 等）
 * 可以被拿来当作本地执行的入口。
 *
 * 只放行浏览器本该处理的常规协议，其余一律拒绝并留日志。
 */

const { shell } = require('electron')

const SAFE_PROTOCOLS = new Set([
  'http:',
  'https:',
  'ftp:',
  'ftps:',
  'mailto:',
  'tel:'
])

function isSafeExternalUrl (url) {
  try {
    return SAFE_PROTOCOLS.has(new URL(url).protocol)
  } catch (e) {
    return false
  }
}

/**
 * @returns {boolean} 是否真的交给了系统浏览器
 */
function safeOpenExternal (url) {
  if (!isSafeExternalUrl(url)) {
    console.warn(
      '[安全] 拒绝用系统浏览器打开非白名单协议的链接:',
      String(url).slice(0, 120)
    )
    return false
  }
  shell.openExternal(url).catch(() => {})
  return true
}

module.exports = {
  safeOpenExternal,
  isSafeExternalUrl
}
