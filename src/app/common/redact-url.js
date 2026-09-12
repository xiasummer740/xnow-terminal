/**
 * 日志脱敏：把连接串里的密码换成 `***`（ISSUES #43）
 *
 * 深链接的 URL 形如 `ssh://user:password@host`，而三个入口（macOS 的 `open-url`、
 * 已运行时的 `second-instance` 命令行、启动时的 argv）都把**原始串**直接写进日志。
 * 于是明文密码躺在日志文件里 —— 而用户报障时第一件事就是把日志贴出来。
 *
 * 只做一件事：把密码挡掉。**用户名有意保留** —— 排查连接问题需要知道连的是谁，
 * 密码则任何情况下都不需要出现在日志里。
 *
 * 覆盖的三种形态（都被 parse-quick-connect 真正支持，见下面的用例）：
 *   ① 带协议：  ssh://user:pass@host      → ssh://user:***@host
 *   ② 不带协议：user:pass@host:22         → user:***@host:22
 *   ③ 查询参数：ssh://host?password=pass  → ssh://host?password=***
 *
 * ② 容易被漏掉 —— 只按 `scheme://` 写正则会**静默放过**这种最常见的简写，
 * 那比不做脱敏更糟（会以为已经安全了）。
 */

/**
 * `user:password@` 部分，协议前缀可选。
 * 末尾的 `(?=\S)` 是防误伤：要求 `@` 后面真的跟着主机名，
 * 免得把 `key:value@` 这类普通文本也吞掉。
 */
const USERINFO_RE = /(?:[\w+.-]+:\/\/)?([^\s/@:]+):[^\s/@]*@(?=\S)/g

/** 查询参数里叫 password / passwd / pwd / pass 的，值一律盖掉 */
const QUERY_PASSWORD_RE = /([?&](?:password|passwd|pwd|pass)=)[^&\s]*/gi

/** `user:password@host` → `user:***@host`；非字符串原样返回 */
function redactCreds (text) {
  if (typeof text !== 'string') return text
  return text
    .replace(USERINFO_RE, (match, user) => {
      // 协议前缀（如果有）要原样留着，只换掉密码
      const prefixMatch = match.match(/^[\w+.-]+:\/\//)
      return (prefixMatch ? prefixMatch[0] : '') + user + ':***@'
    })
    .replace(QUERY_PASSWORD_RE, '$1***')
}

/** 命令行参数数组是常见形态（`second-instance` 的 commandLine 就是数组） */
function redactCredsList (list) {
  return Array.isArray(list) ? list.map(redactCreds) : redactCreds(list)
}

module.exports = { redactCreds, redactCredsList }
