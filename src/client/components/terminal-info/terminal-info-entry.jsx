/**
 * 【零引用 · 有意保留】ISSUES #34 —— 别当废代码删。
 * 一次「拆 entry 组件做懒加载」重构的产物，调用方始终没切过来。
 * 祥哥 2026-09-13 拍板：全部保留，不删。
 * 详见 ISSUES.md #34。
 */
import { lazy, Suspense } from 'react'

const TerminalInfo = lazy(() => import('./terminal-info'))

export default function TerminalInfoEntry (props) {
  return (
    <Suspense fallback={null}>
      <TerminalInfo {...props} />
    </Suspense>
  )
}
