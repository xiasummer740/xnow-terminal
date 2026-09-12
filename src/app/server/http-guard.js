/**
 * 回环 HTTP 服务的 Host / Origin 闸门（ISSUES #29）
 *
 * 单独成文件是为了能**被真实跑起来测**：server.js 在模块顶层就 `runServer()`，
 * 没法 require 进测试。把它拆出来，测试可以把这个**生产用的中间件原文**
 * 挂到一个真 express 实例上发真请求，而不是另写一份等价实现。
 * （同类先例：lib/path-safe.js、lib/ssrf-guard.js、common/dangerous-command.js）
 *
 * 为什么服务只听 127.0.0.1 还不够 —— **DNS rebinding**：
 * 攻击者把自己的域名解析到 127.0.0.1，用户打开那个页面后，页面 JS 就以
 * `http://attacker.com:<端口>` 打到了本机服务。在服务看来来源是"本机"，实际是别人。
 * 和 WS 不同，HTTP 的响应**还能被读走**。
 *
 * 为什么 Origin 挡不住、必须靠 Host：
 * 同源请求浏览器压根不发 Origin；而 Host 无论怎么解析都如实反映地址栏里的域名，
 * 是这种攻击唯一的破绽。所以两条口子分开定规则：
 *
 *   · Host   —— **缺失也拒**。HTTP/1.1 强制要求带 Host，正常客户端不会漏；
 *               这条"缺失即拒"正是 DNS rebinding 的封堵点。
 *   · Origin —— **有才校验、无则放**。非浏览器客户端（脚本/命令行）不带 Origin，
 *               卡掉只会误伤正常工具；真浏览器发跨站请求一定带，照样拦得住。
 *
 * 放行名单只有一份，在 ws-origin.js 里，WS 侧和这里共用，防止两边漂移。
 */

const log = require('../common/log')
const { isLoopbackHost, isLoopbackOrigin } = require('./ws-origin')

/**
 * 挂在所有路由**之前**才有用（放后面等于没加）
 */
function httpGuard (req, res, next) {
  if (!isLoopbackHost(req.headers.host)) {
    log.warn('服务端', '拒绝非回环 Host 的请求：', req.headers.host, req.method, req.url)
    return res.status(403).send('forbidden')
  }
  if (!isLoopbackOrigin(req.headers.origin)) {
    log.warn('服务端', '拒绝非回环 Origin 的请求：', req.headers.origin, req.method, req.url)
    return res.status(403).send('forbidden')
  }
  next()
}

module.exports = httpGuard
