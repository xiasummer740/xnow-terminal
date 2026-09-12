/**
 * SSRF 防护：判断一个地址是不是"不该被主进程去请求"的（ISSUES #31）
 *
 * 背景：主进程有两条发请求的路径，**用途完全不同**，所以策略也不能一样 ——
 *   · `webFetchPage` —— AI 抓网页用，URL 来自 AI 输出/模型上下文，**完全不可信**，
 *     这是真正要防 SSRF 的那条 → 用 `isPrivateHost()`，内网一律不放行
 *   · `httpFetch`    —— netdata / 哪吒监控用，地址是**用户自己配的服务器**，
 *     本来就可能是 192.168.x.x 这种内网机 → 内网必须放行，
 *     只挡"任何监控都不可能指向"的那几段（链路本地 / 保留段 / 云元数据域名）
 *
 * 原来那版的漏洞（实测）：
 *   · `[::ffff:127.0.0.1]` 放行 —— IPv6 映射写法没认出来
 *   · `169.254.169.254` 放行 —— 云元数据地址段压根没覆盖（**这是最要命的一条**）
 *   · `127.0.0.1.nip.io` 放行 —— 域名指向内网，纯字符串比对看不出来，要查 DNS
 *
 * 关于"URL 解析器已经帮我们做了什么"：`new URL()` 会把 `2130706433`、
 * `0x7f000001`、`127.1`、`0177.0.0.1` 这些写法**统一归一化成 `127.0.0.1`**，
 * 所以不用自己做进制/缩写还原。但 IPv6 它**会重写成十六进制**
 * （`[::ffff:169.254.169.254]` → `::ffff:a9fe:a9fe`），这一步得自己拆。
 */

const dns = require('dns')

/** 云元数据域名：拿到它就是拿到云主机的临时凭证 */
const METADATA_HOSTS = [
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'metadata'
]

/** URL.hostname 对 IPv6 会带方括号，统一剥掉 */
function normalizeHostname (hostname) {
  let h = String(hostname == null ? '' : hostname).trim().toLowerCase()
  if (h.startsWith('[') && h.endsWith(']')) h = h.slice(1, -1)
  // 去掉 FQDN 末尾的点：example.com. 和 example.com 是同一台
  if (h.endsWith('.')) h = h.slice(0, -1)
  return h
}

function ipv4Parts (h) {
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (!m) return null
  const parts = m.slice(1, 5).map(Number)
  if (parts.some(n => n > 255)) return null
  return parts
}

/**
 * 把 IPv6 映射写法还原成 IPv4：`::ffff:1.2.3.4` 和 `::ffff:a9fe:a9fe` 都还原。
 * 十六进制那种是 `new URL()` 归一化后的样子，所以必须认。
 */
function ipv4FromMapped (h) {
  const m = h.match(/^::ffff:([0-9a-f:.]+)$/)
  if (!m) return null
  const rest = m[1]
  if (ipv4Parts(rest)) return rest
  const p = rest.split(':')
  if (p.length !== 2) return null
  const a = parseInt(p[0], 16)
  const b = parseInt(p[1], 16)
  if (Number.isNaN(a) || Number.isNaN(b)) return null
  return [a >> 8, a & 0xff, b >> 8, b & 0xff].join('.')
}

/** IPv4 是否属于"内网/保留/链路本地"（RFC1918 + 环回 + 169.254 + 保留段 + 组播） */
function isPrivateIpv4 (h) {
  const p = ipv4Parts(h)
  if (!p) return false
  const [a, b] = p
  if (a === 0) return true // 0.0.0.0/8
  if (a === 10) return true // 10/8
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64/10 CGNAT
  if (a === 127) return true // 环回
  if (a === 169 && b === 254) return true // 链路本地 + 云元数据 169.254.169.254
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16/12
  if (a === 192 && b === 168) return true // 192.168/16
  if (a === 192 && b === 0) return true // 192.0.0/24 保留
  if (a === 198 && (b === 18 || b === 19)) return true // 198.18/15 基准测试
  if (a >= 224) return true // 组播 224/4 + 保留 240/4
  return false
}

/** IPv6 是否属于内网/链路本地/环回 */
function isPrivateIpv6 (h) {
  const mapped = ipv4FromMapped(h)
  if (mapped) return isPrivateIpv4(mapped)
  if (h === '::1' || h === '::') return true
  if (/^f[cd]/.test(h)) return true // fc00::/7 唯一本地地址
  if (/^fe[89ab]/.test(h)) return true // fe80::/10 链路本地
  return false
}

/** 云元数据域名？ */
function isMetadataHost (h) {
  return METADATA_HOSTS.includes(h)
}

/**
 * 严格判定：内网 / 环回 / 链路本地 / 保留段 / 云元数据。
 * 给 `webFetchPage`（AI 抓网页）用 —— 那条路径不该碰任何内网资源。
 */
function isPrivateHost (hostname) {
  const h = normalizeHostname(hostname)
  if (!h) return true // 空主机名一律拒绝，别猜
  if (h === 'localhost' || h.endsWith('.localhost')) return true
  if (isMetadataHost(h)) return true
  if (ipv4Parts(h)) return isPrivateIpv4(h)
  if (h.includes(':')) return isPrivateIpv6(h)
  return false
}

/**
 * 窄判定：只挡"任何监控功能都不可能指向"的地址 ——
 * 链路本地（含云元数据）/ 保留段 / 组播 / 元数据域名。
 *
 * **有意放行 RFC1918 与环回**：netdata / 哪吒监控的地址是用户配的，
 * 本来就可能指向 192.168.x.x 甚至本机。把它们也挡掉 = 直接砍掉功能。
 * 所以这里牺牲一点严格性，换功能不被误伤。
 */
function isLinkLocalOrReserved (hostname) {
  const h = normalizeHostname(hostname)
  if (!h) return true
  if (isMetadataHost(h)) return true
  const p = ipv4Parts(h)
  if (p) {
    const [a, b] = p
    if (a === 0) return true
    if (a === 169 && b === 254) return true
    if (a >= 224) return true
    return false
  }
  if (h.includes(':')) {
    const mapped = ipv4FromMapped(h)
    if (mapped) return isLinkLocalOrReserved(mapped)
    if (/^fe[89ab]/.test(h)) return true // fe80::/10
    return false
  }
  return false
}

/**
 * 域名指向内网吗？（要查 DNS）
 *
 * 为什么必须查：`127.0.0.1.nip.io` 这种公开域名**解析结果就是 127.0.0.1**，
 * 纯字符串比对永远看不出来 —— 而它正是实测里成功绕过的那一种。
 *
 * @param {function} predicate 判定单个 IP 是否要拦
 * @returns {Promise<boolean>} 解析不出来时返回 false（放行）——
 *   解析失败的话后面的请求本身也连不上，不会造成"实际能打通却被放过"，
 *   反而如果这里 fail-closed，DNS 抖一下就会误伤正常请求。
 */
async function hostnameResolvesTo (hostname, predicate) {
  const h = normalizeHostname(hostname)
  if (!h || ipv4Parts(h) || h.includes(':')) return false // 已经是 IP 字面量，字符串判定管过了
  try {
    const addrs = await dns.promises.lookup(h, { all: true, verbatim: true })
    return addrs.some(a => predicate(a.address))
  } catch (e) {
    return false
  }
}

/** 给 webFetchPage 用：域名解析到任何内网地址都拦 */
function resolvesToPrivate (hostname) {
  return hostnameResolvesTo(hostname, isPrivateHost)
}

/** 给 httpFetch 用：只拦解析到链路本地/保留段的（云元数据绕过就堵在这） */
function resolvesToLinkLocalOrReserved (hostname) {
  return hostnameResolvesTo(hostname, isLinkLocalOrReserved)
}

module.exports = {
  isPrivateHost,
  isLinkLocalOrReserved,
  resolvesToPrivate,
  resolvesToLinkLocalOrReserved,
  // 下面这些导出是为了能单独测边界，正常调用用不到
  normalizeHostname,
  ipv4FromMapped,
  isPrivateIpv4,
  isPrivateIpv6
}
