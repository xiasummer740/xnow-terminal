import { useEffect, useRef, useCallback } from 'react'

export default function AppDrag (props) {
  const isDraggingRef = useRef(false)

  function isDragTarget (el) {
    let cur = el
    while (cur && cur.classList) {
      if (cur.classList.contains('no-drag')) return false
      if (cur.classList.contains('app-drag') ||
          cur.classList.contains('tabs-inner') ||
          cur.classList.contains('tabs-wrapper')) return true
      cur = cur.parentElement
    }
    return false
  }

  function canOperate (e) {
    const { target } = e
    if (!isDragTarget(target)) {
      window.pre.runSync('windowMove', false)
      return false
    }
    return true
  }

  // 文档级 mousedown 监听，支持面板标题栏等外部 app-drag 元素
  const docMouseDown = useCallback(function (e) {
    if (e.button !== 0) return
    if (isDragTarget(e.target)) {
      isDraggingRef.current = true
      window.pre.runSync('windowMove', true)
    }
  }, [])

  const docMouseUp = useCallback(function (e) {
    if (isDraggingRef.current) {
      isDraggingRef.current = false
      window.pre.runSync('windowMove', false)
    }
  }, [])

  useEffect(() => {
    if (window.store.shouldSendWindowMove) {
      document.addEventListener('mousedown', docMouseDown)
      document.addEventListener('mouseup', docMouseUp)
      return () => {
        document.removeEventListener('mousedown', docMouseDown)
        document.removeEventListener('mouseup', docMouseUp)
      }
    }
    // Mac/Linux：右键菜单关闭
    window.addEventListener('contextmenu', docMouseUp)
    return () => {
      window.removeEventListener('contextmenu', docMouseUp)
    }
  }, [])

  function onMouseDown (e) {
    if (e.button !== 0) return
    if (canOperate(e)) {
      isDraggingRef.current = true
      window.pre.runSync('windowMove', true)
    }
  }

  function onDoubleClick (e) {
    e.stopPropagation()
    if (!canOperate(e)) return
    const { isMaximized } = window.store
    if (isMaximized) {
      window.pre.runGlobalAsync('unmaximize')
    } else {
      window.pre.runGlobalAsync('maximize')
    }
  }

  const props0 = {
    className: 'app-drag',
    onDoubleClick
  }
  if (window.store.shouldSendWindowMove) {
    Object.assign(props0, { onMouseDown })
  } else {
    props0.style = { WebkitAppRegion: 'drag' }
  }
  return <div {...props0}>{props.children}</div>
}
