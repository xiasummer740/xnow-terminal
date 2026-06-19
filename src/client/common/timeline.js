/**
 * 操作时间线日志（仅开发版记录，正式版静默跳过）
 *
 * 用法：
 *   import tl from '../common/timeline.js'
 *   tl('面板开关', 'AI面板打开')
 *
 * 内部通过 IPC writeTimeline 转发到主进程 logger.timeline
 */

export default function timeline (action, detail) {
  try {
    if (window.pre && window.pre.runGlobalAsync) {
      window.pre.runGlobalAsync('writeTimeline', { action, detail })
    }
  } catch (_) {}
}
