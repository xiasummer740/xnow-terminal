/**
 * 全局日志系统
 * - 写入 os.tmpdir() + '/xnow-debug.log'
 * - 自动轮转（最大 5MB，超了截断保留后半段）
 * - 异常自动捕获，带完整调用栈
 * - 操作时间线（仅开发版，Phase 2 使用）
 */

const fs = require('fs')
const path = require('path')
const os = require('os')
const { isDev } = require('../common/runtime-constants')

const LOG_FILE = path.join(os.tmpdir(), 'xnow-debug.log')
const MAX_SIZE = 5 * 1024 * 1024 // 5MB

// ─── 核心写入 ──────────────────────────────────────────────────────────────────

function write (level, msg, extra) {
  try {
    const ts = new Date().toISOString()
    let line = `[${ts}] [${level}] ${msg}`
    if (extra != null) {
      line += ' ' + (typeof extra === 'string' ? extra : JSON.stringify(extra))
    }
    line += '\n'

    // 文件超限 → 截断（保留后半段，丢弃旧日志）
    try {
      const stat = fs.statSync(LOG_FILE)
      if (stat.size > MAX_SIZE) {
        const content = fs.readFileSync(LOG_FILE, 'utf-8')
        const half = content.slice(Math.floor(content.length / 2))
        const nextLine = half.indexOf('\n')
        const kept = nextLine >= 0 ? half.slice(nextLine + 1) : half
        fs.writeFileSync(LOG_FILE, `[${ts}] [TRUNCATED] log file exceeded ${MAX_SIZE} bytes, dropped old entries\n${kept}`)
      }
    } catch (_) {}

    fs.appendFileSync(LOG_FILE, line, 'utf-8')
  } catch (_) {}
}

// ─── 公开 API ──────────────────────────────────────────────────────────────────

function info (msg, data) { write('INFO', msg, data) }

function warn (msg, data) { write('WARN', msg, data) }

function error (err, context) {
  const msg = (err && err.message) || String(err)
  const stack = (err && err.stack) ? '\n' + err.stack : ''
  const ctx = context ? '\ncontext: ' + (typeof context === 'string' ? context : JSON.stringify(context)) : ''
  write('ERROR', msg, stack + ctx)
}

/**
 * 操作时间线（仅开发版）
 * Phase 2 用此方法记录用户操作，正式版静默跳过
 */
function timeline (action, detail) {
  if (!isDev) return
  write('TIMELINE', action, detail)
}

function getLogPath () { return LOG_FILE }

module.exports = { info, warn, error, timeline, getLogPath }
