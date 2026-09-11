/**
 * 本机 WS 服务的来源校验 + token 比对（ISSUES #3）
 *
 * 为什么需要来源校验：
 * 服务只监听 127.0.0.1，但**网页不受同源策略限制就能往本机端口发 WebSocket**（WS 不走 CORS 预检）。
 * 用户随便打开一个恶意站点，那个站点的 JS 就能连 ws://127.0.0.1:<端口>/... ，
 * 此时唯一的门槛就是 URL 里的 token。Origin 校验是这类本机 WS 服务的标准第二道锁：
 * 浏览器发起 WS 一定会带 Origin，站点自己的 Origin 不可能是回环地址，直接拒掉。
 *
 * 回环来源才放行（应用自身在开发/正式下都从 127.0.0.1 加载）；
 * **没有 Origin 头的放行** —— 那是非浏览器客户端（脚本/命令行），仍受 token 约束，
 * 卡掉它们只会误伤正常工具，不会提高安全性。
 */

const { timingSafeEqual } = require('crypto')

function isLoopbackOrigin (origin) {
  if (!origin) {
    return true
  }
  try {
    const { hostname } = new URL(origin)
    return ['127.0.0.1', 'localhost', '::1', '[::1]'].includes(hostname)
  } catch (e) {
    // Origin 解析不了 = 不是正常的浏览器 Origin，按不可信处理
    return false
  }
}

/**
 * 定长比较，避免用 !== 比 token 时的逐字节短路泄露信息。
 * 长度不同直接判否（长度本身不是秘密）。
 */
function tokenEquals (given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string') {
    return false
  }
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  if (a.length !== b.length) {
    return false
  }
  return timingSafeEqual(a, b)
}

module.exports = { isLoopbackOrigin, tokenEquals }
