/**
 * 客户端**允许**远程调用的升级操作方法名（ISSUES #4）
 *
 * `upgrade-func` 的处理是 `inst[func](...args)`，func 由客户端消息决定。
 * 不加限制的话，客户端可以直接 `func: 'onEnd'` —— 一步跨过下载后的完整性校验，
 * 直接写 bat 静默安装。**闸门能被绕过就不算闸门。**
 *
 * 与客户端 `common/upgrade.js` 用的 `window.pre.transferKeys`（`server/transfer.js`）
 * 是同一组名字：客户端就照着那个列表发。改这里要同步想清楚，
 * 加进来的方法等于开给本机 WS 客户端。
 */
module.exports = [
  'pause',
  'resume',
  'destroy'
]
