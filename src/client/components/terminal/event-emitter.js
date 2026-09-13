/**
 * 【零引用 · 有意保留】ISSUES #34 —— 别当废代码删。
 * 继承自上游 electerm，删掉只会在将来合并上游时多出无谓冲突（与 #51 同一口径）。
 * 祥哥 2026-09-13 拍板：全部保留，不删。
 * 详见 ISSUES.md #34。
 */
export default class EventEmitter {
  constructor () {
    this._events = {}
  }

  on (event, listener) {
    if (!this._events[event]) {
      this._events[event] = []
    }
    this._events[event].push(listener)
    return this
  }

  off (event, listener) {
    if (!this._events[event]) return this
    this._events[event] = this._events[event].filter(l => l !== listener)
    return this
  }

  emit (event, ...args) {
    if (!this._events[event]) return false
    this._events[event].forEach(listener => {
      listener(...args)
    })
    return true
  }
}
