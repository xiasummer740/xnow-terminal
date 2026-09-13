/**
 * 【零引用 · 有意保留】ISSUES #34 —— 别当废代码删。
 * 继承自上游 electerm，删掉只会在将来合并上游时多出无谓冲突（与 #51 同一口径）。
 * 祥哥 2026-09-13 拍板：全部保留，不删。
 * 详见 ISSUES.md #34。
 */
export default function onDrop (e, batch, onDropElem) {
  e.preventDefault()
  const { target } = e
  if (!target) {
    return
  }
  let currentElement = target
  while (currentElement) {
    if (currentElement.classList && currentElement.classList.contains('tab')) {
      return
    }
    currentElement = currentElement.parentElement
  }
  const fromTab = JSON.parse(e.dataTransfer.getData('fromFile'))
  if (!onDropElem || !fromTab || fromTab.batch === batch) {
    return
  }
  const { store } = window
  const { tabs } = store
  const t = tabs.find(t => t.id === fromTab.id)
  if (!t) {
    return
  }
  t.batch = batch
}
