/**
 * 渲染进程日志系统
 * - window.onerror → 写日志
 * - unhandledrejection → 写日志
 * - 通过 IPC writeLog 转发到主进程写文件
 *
 * 只需要 import 此文件即可自动生效
 * 正式版也保持（崩溃捕获不依赖 isDev）
 */

const writeLog = (msg) => {
  try {
    if (window.pre && window.pre.runGlobalAsync) {
      window.pre.runGlobalAsync('writeLog', msg)
    }
  } catch (_) {}
}

// ─── 全局异常捕获 ──────────────────────────────────────────────────────────────

window.addEventListener('error', (event) => {
  const err = event.error || event
  const msg = err.message || String(err)
  const stack = err.stack ? '\n' + err.stack : ''
  const filename = event.filename || ''
  const lineno = event.lineno || ''
  writeLog(`[RENDER_ERROR] ${msg} (${filename}:${lineno})${stack}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason = event.reason
  const msg = reason?.message || String(reason)
  const stack = reason?.stack ? '\n' + reason.stack : ''
  writeLog(`[RENDER_PROMISE_REJECTION] ${msg}${stack}`)
})

// 开发版标记
if (window.et && window.et.isDev) {
  writeLog('[LOGGER] renderer logger initialized (dev mode)')
}
