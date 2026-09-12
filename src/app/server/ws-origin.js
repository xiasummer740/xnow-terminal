/**
 * 本机服务的来源校验 + token 比对（ISSUES #3 的 WS 侧、#29 的 HTTP 侧）
 *
 * 为什么需要来源校验：
 * 服务只监听 127.0.0.1，但**网页不受同源策略限制就能往本机端口发 WebSocket**（WS 不走 CORS 预检），
 * 也不能只看"它连的是 127.0.0.1"就放行 —— **DNS rebinding** 能让攻击者的域名解析到
 * 127.0.0.1，于是攻击者页面的 JS 就以自己的域名打到了本机端口（HTTP 侧同理，
 * 而且 HTTP 响应它还能**读**）。用户随便打开一个恶意站点就能走到这一步。
 * 所以两道锁：Origin 挡住"站点自己的来源"，Host 挡住"用域名解析过来的请求"。
 *
 * 回环来源才放行（应用自身在开发/正式下都从 127.0.0.1 加载）；
 * **没有 Origin 头的放行** —— 那是非浏览器客户端（脚本/命令行），仍受 token 约束，
 * 卡掉它们只会误伤正常工具，不会提高安全性。
 *
 * ⚠️ 这里是本机服务**唯一一份**回环名单：WS 侧（dispatch-center / session-server）
 * 和 HTTP 侧（server.js）都从这里取，避免两份名单各自演化后出现"一边放一边挡"。
 * 前提是 `config.host` 保持默认的 127.0.0.1；哪天真要开放到局域网，
 * 这张名单和两处校验都得一起改（那时 Origin 会是局域网地址，现在会被拒）。
 */

const { timingSafeEqual } = require('crypto')

// 唯一的回环名单：Origin 和 Host 两侧共用，防止漂移
const LOOPBACK_HOSTS = ['127.0.0.1', 'localhost', '::1', '[::1]']

function isLoopbackOrigin (origin) {
  if (!origin) {
    return true
  }
  try {
    const { hostname } = new URL(origin)
    return LOOPBACK_HOSTS.includes(hostname)
  } catch (e) {
    // Origin 解析不了 = 不是正常的浏览器 Origin，按不可信处理
    return false
  }
}

/**
 * 校验 HTTP 的 Host 头（ISSUES #29）。
 *
 * 和 isLoopbackOrigin 有一条**关键的不对称**：没有 Origin 头要放行（非浏览器客户端），
 * 但**没有 Host 头要拒绝** —— HTTP/1.1 规定请求必须带 Host，正常客户端不会漏。
 * 这条不对称正是挡住 DNS rebinding 的地方：攻击者页面用 attacker.com 打过来时
 * Host 就是 `attacker.com:<端口>`，名字不在名单里 → 拒。
 *
 * @param {string} host 原始 Host 头，可能带端口（`127.0.0.1:5570`、`[::1]:5570`）
 * @returns {boolean}
 */
function isLoopbackHost (host) {
  if (typeof host !== 'string' || !host.trim()) {
    return false
  }
  const h = host.trim().toLowerCase()
  // 剥掉端口：`[::1]:5570` → `[::1]`；`127.0.0.1:5570` → `127.0.0.1`
  const ipv6 = /^(\[[^\]]+\])(?::\d+)?$/.exec(h)
  const name = ipv6 ? ipv6[1] : h.replace(/:\d+$/, '')
  return LOOPBACK_HOSTS.includes(name)
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

module.exports = { isLoopbackOrigin, isLoopbackHost, tokenEquals }
