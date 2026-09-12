/**
 * 自定义 CSS 的净化（ISSUES #48）
 *
 * 威胁不在"用户自己填了一段 CSS"，而在**同步**：
 * `customCss` 列在 `src/client/store/sync.js` 的 `configSyncKeys` 里
 * （第 723 行），也就是**远端同步源可以决定这段 CSS 是什么**。
 * 而它是经 `style.innerHTML` 直接进 DOM 的。
 *
 * 为什么只挡"远程 url()"、不做完整 CSS 白名单：
 * 注入点是 `<style>` 元素。按 HTML 规范它是 raw text 元素，
 * innerHTML 走的是 RAWTEXT 词法状态 —— 往里塞 `</style><script>` 只会变成
 * 一段字面 CSS 文本，脚本根本不执行。所以能用它干的事只剩一件：
 * **让浏览器去取一个外部资源**，而那正好就是 url() 的活。
 *
 * 为什么放行 data: / blob: / 相对路径，拦掉 http(s) 不算"误伤"：
 * 用户自己设的背景图就是这几种形态（上传的图走 data:）。
 * 而远程 http(s) 的图**本来也加载不出来** —— 主窗口的 CSP 写着
 * `img-src 'self' data: blob:` / `font-src 'self' data:`
 * （见 `src/app/lib/create-window.js`），远程资源一律被 CSP 挡下。
 * 也就是说拦它不会让任何"今天本来能用"的写法失效；
 * 拦它的意义是别把这件事单独押在 CSP 那一个开关上 ——
 * CSP 是会话级的，改起来离这段代码很远，容易在别处被顺手放宽。
 */

// url( 后面可能带引号，也可能不带；里面不允许出现引号或右括号
const URL_RE = /url\(\s*(['"]?)([^'")]*)\1\s*\)/gi

// 有 scheme 的才可能是远程（http: / https: / file: / ftp: / 各种自定义协议）
const SCHEME_RE = /^[a-z][a-z0-9+.-]*:/i

const ALLOWED_SCHEMES = new Set(['data:', 'blob:'])

function replaceUrl (whole, quote, raw) {
  const value = raw.trim()
  if (!value || !SCHEME_RE.test(value)) {
    // 相对路径、锚点、空值：保持原样
    return whole
  }
  const scheme = value.slice(0, value.indexOf(':') + 1).toLowerCase()
  // 'none' 是合法的 CSS 值，整条声明会变成"没有背景"，不会连带毁掉后面几条
  return ALLOWED_SCHEMES.has(scheme) ? whole : 'none'
}

/**
 * @param {string} css 原始自定义 CSS
 * @returns {string} 可以安全塞进 <style> 的 CSS
 */
export function safeCustomCss (css) {
  return (css || '')
    // @import 是既有的老防线，保留：换成 # 让这条声明直接失效，
    // 又不像整条删除那样可能把前后两条规则粘到一起
    .replace(/@import/gi, '#')
    .replace(URL_RE, replaceUrl)
}
