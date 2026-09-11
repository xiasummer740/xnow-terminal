/**
 * AI Agent 文件工具的路径闸门（ISSUES #2）
 *
 * 这个函数挡在 readLocalFile / writeLocalFile / listDirectory / grepFiles 前面，
 * 而那几个能力能被渲染进程通过 IPC 桥直接调用（AI Agent 也会调），
 * 所以它挡不住的后果是：任意读本机文件 + 任意写（含开机自启目录）→ 持久化。
 *
 * 原实现只做了「resolve 之后拿字符串前缀比对」，实测有 6 个口子（temp/probe-pathsafe.js）：
 *   1. `\\?\C:\Windows\...` 设备路径 —— path.resolve 会把 `\\?\` 前缀**原样带过去**（实测），
 *      于是 resolve 出来仍是 `\\?\C:\Windows\...`，永远匹配不上 `c:\windows\` 前缀
 *   2. `~/.ssh/id_rsa` 私钥目录不在名单里
 *   3. `Startup` 开机自启目录不在名单里（可写 → 开机执行）
 *   4. `~/.xnow-terminal/.xnow-storage-key`（本应用自己的降级加密密钥）不在名单里
 *   5. `C:\Program Files (x86)\` 匹配不上 `C:\Program Files\`（差一个空格）
 *   6. 盘符写死 `C:` —— Windows 装在 D 盘就整条失效
 */

const { resolve: pathResolve, dirname, basename } = require('path')
const fs = require('fs')
const os = require('os')

const isWin = process.platform === 'win32'

// 检测路径遍历攻击（原始输入先粗筛一道，resolve 还会再收敛一次）
const PATH_TRAVERSAL_RE = /(?:^|[\\/])\.\.[\\/]/

// Win32 设备命名空间前缀，必须剥掉再比对，否则见文件头第 1 条
const WIN_UNC_RE = /^[\\/]{2}[?.][\\/]UNC[\\/]/i
const WIN_DEVICE_RE = /^[\\/]{2}[?.][\\/]/

/**
 * 按真实落点解析路径（符号链接/目录联接能指向别处，纯字符串比对挡不住）。
 *
 * 目标不存在时（例如 writeLocalFile 要建新文件）往上找最近的已存在祖先，
 * 取它的真实落点再把剩下的段接回去。
 * 注意**不能只取祖先**：`~/.gnupg` 这种还不存在的目录会收敛成 `~`，
 * 家目录就整个进了敏感名单，用户自己项目全被拦（写测试时实测踩到过）。
 */
function realpathDeep (resolved) {
  try {
    return fs.realpathSync.native(resolved)
  } catch (e) {}
  let head = resolved
  const tail = []
  for (;;) {
    const parent = dirname(head)
    if (parent === head) {
      return resolved
    }
    tail.unshift(basename(head))
    head = parent
    try {
      return pathResolve(fs.realpathSync.native(head), ...tail)
    } catch (e) {}
  }
}

/**
 * 把路径收敛成可比对的规范形式：
 * 剥设备前缀 → resolve（收敛 .. 与分隔符）→ 解析符号链接 → 统一小写
 */
function canonicalPath (targetPath) {
  let p = targetPath
  if (p.includes('\0')) {
    return null
  }
  // \\?\UNC\server\share → \\server\share
  const unc = p.match(WIN_UNC_RE)
  if (unc) {
    p = '\\\\' + p.slice(unc[0].length)
  } else if (WIN_DEVICE_RE.test(p)) {
    p = p.slice(4)
  }
  const resolved = realpathDeep(pathResolve(p))
  return isWin ? resolved.toLowerCase() : resolved
}

function buildBlockedDirs () {
  const dirs = []
  const add = (p) => {
    if (p) {
      dirs.push(canonicalPath(p))
    }
  }
  // 系统目录从环境变量取，不能写死盘符（否则 Windows 装在 D 盘就失效）
  add(process.env.SystemRoot || process.env.windir)
  add(process.env.ProgramFiles)
  add(process.env['ProgramFiles(x86)'])
  add(process.env.ProgramData)
  add(process.env.CommonProgramFiles)
  if (isWin) {
    // 兜底：环境变量缺失时常见的默认位置
    add('C:\\Windows')
    add('C:\\Program Files')
    add('C:\\Program Files (x86)')
    add('C:\\ProgramData')
  } else {
    for (const p of ['/etc', '/sys', '/proc', '/dev', '/boot', '/root', '/var']) {
      add(p)
    }
  }
  // 用户级敏感目录：私钥、开机自启、各家云凭证、本应用自己的加密密钥
  const home = os.homedir()
  if (home) {
    for (const p of ['.ssh', '.gnupg', '.aws', '.xnow-terminal']) {
      add(pathResolve(home, p))
    }
    // Windows 每用户开机自启目录
    add(pathResolve(home, 'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup'))
  }
  return dirs.filter(Boolean)
}

// 目录名单只跟环境有关，算一次就够
let _blocked = null
function blockedDirs () {
  if (_blocked === null) {
    _blocked = buildBlockedDirs()
  }
  return _blocked
}

/**
 * @param {string} targetPath 待检查的路径（来自渲染进程，按不可信处理）
 * @returns {boolean} 允许访问返回 true
 */
function isPathSafe (targetPath) {
  if (typeof targetPath !== 'string' || !targetPath) {
    return false
  }
  if (PATH_TRAVERSAL_RE.test(targetPath)) {
    return false
  }
  const resolved = canonicalPath(targetPath)
  if (!resolved) {
    return false
  }
  for (const p of blockedDirs()) {
    // 比对孩子本身或它的子路径，避免 C:\WindowsX 被误判成 C:\Windows 的子路径
    if (resolved === p || resolved.startsWith(p.endsWith('\\') || p.endsWith('/') ? p : p + (isWin ? '\\' : '/'))) {
      return false
    }
  }
  return true
}

module.exports = { isPathSafe, canonicalPath }
