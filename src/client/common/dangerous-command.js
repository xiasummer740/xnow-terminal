/**
 * AI 高危终端命令检测（ISSUES #19）
 *
 * ⚠️ 先说清楚这个函数的**性质**：返回 true 不是"拦住"，而是"弹个确认框让用户点头"。
 * 所以**漏判 = 零确认直接执行**，误判 = 用户多点一下。这个不对称决定了
 * 下面所有取舍都偏向"宁可多问一句"。
 *
 * 原来这里是一串 `^` 锚定的正则，只匹配**整条命令的行首**（`agent-tools.js:31-55`），
 * 实测漏掉的情况：
 *   `sudo rm -rf /` / `cd / && rm -rf /`  危险操作不在行首就溜过去了
 *   `rm -rf ~/`                          目标目录压根不在名单里（名单只有 `/` 和 `/*`）
 *   `curl x | bash`                      下载即执行，不在名单里
 *   `cat ~/.ssh/id_rsa`                  读私钥，不在名单里
 *
 * 所以这里做四件事：
 *   1. 按 `;` `&&` `||` `|` 换行拆段，逐段判 —— 危险操作在第 3 段也拦得住
 *   2. 每段先剥掉 `sudo` / `doas` / `env` / `nohup` 这类包装前缀再判
 *   3. 补齐"一整片删光"的目标（`~` `$HOME` `/home`…）和 Windows 的删除形态
 *   4. 补两类新形态：**下载即执行**、**读凭证**
 *
 * 但也要克制。`echo "rm -rf /"` 这种不该报 —— 误报多了用户会形成
 * "看到框就点确认"的习惯，闸门等于没有。所以段内判定仍然是**行首锚定**的：
 * `echo rm -rf /` 的行首是 `echo`，不命中。
 */

// 危险操作可以出现在任意一段，只匹配行首等于只拦最简单的那种。
// `||` `&&` 要排在 `|` `&` 前面，否则会被拆成两半。
const SEPARATOR = /\|\||&&|[;&|\n]/

// `sudo rm -rf /` 里危险的不是 sudo —— 剥掉前缀再看，否则加个 sudo 就绕过去了
const WRAPPERS = new Set(['sudo', 'doas', 'env', 'nohup', 'time', 'nice', 'xargs', 'command'])
// sudo 自己**取值**的旗标：`sudo -u root rm -rf /` 里 `-u root` 是 sudo 的，不是 rm 的，
// 得连值一起剥掉，否则剩下的 `-u root rm -rf /` 不认。不取值的（-E -H -i…）剥旗标即可。
const WRAPPER_TAKES_VALUE = new Set(['-u', '-g', '-p', '-c', '-h', '-r', '-t'])

// 「把一整片删光」的目标。注意只收**整片**：`rm -rf /home/user/junk` 是正常清理，
// `rm -rf /home` 才是不归路。
// `${home}` 这种写法在普通字符串字面量里会被 lint 当成模板表达式（no-template-curly-in-string），
// 所以拆开拼
const BRACED_HOME = '$' + '{home}'

const WIDE_TARGETS = new Set([
  '/', '/*', '*',
  '~', '~/', '~/*',
  '$home', BRACED_HOME, '$home/*', `${BRACED_HOME}/*`,
  '/home', '/home/*', '/etc', '/usr', '/var', '/boot', '/bin', '/lib', '/opt', '/root',
  'c:', 'c:\\', 'c:/*'
])

/** 递归 + 强制删除，且目标是「一整片」—— 这是跑路级，不是清理子目录 */
function isWideRm (seg) {
  const m = /^rm\s+(.*)$/.exec(seg)
  if (!m) return false
  const parts = m[1].trim().split(/\s+/)
  // -rf / -fr / -r -f / --recursive --force 都要认
  const flags = parts.filter(p => p.startsWith('-')).join('')
  if (!flags.includes('r') || !flags.includes('f')) return false
  return parts.some(p => {
    if (p.startsWith('-')) return false
    // 末尾斜杠去重：`/` 是特例，去掉就空了，补回来
    return WIDE_TARGETS.has(p.replace(/\/+$/, '') || '/')
  })
}

// 行首锚定的单段模式
const SEGMENT_PATTERNS = [
  // Linux
  /^mkfs/,
  /^dd\b.*of=\/dev\//, // 直接往块设备写
  /^>\s*\/dev\/(sd|hd|nvme|disk)/, // 覆写块设备
  /^(reboot|shutdown|poweroff|halt|init)\b/,
  // Windows
  /^format\s+[a-z]:/,
  /^diskpart\b/,
  /^bcdedit\b/,
  /^reg\s+delete\b/,
  /^vssadmin\s+delete\b/, // 删卷影副本 = 断掉回滚后路
  /^del\b.*\/s\b/,
  /^(rd|rmdir)\b.*\/s\b/
]

// 「下载即执行」——跑什么完全不可控，而且这形态**拆段反而看不出来**
// （`curl x | bash` 拆开是 `curl x` 和 `bash`，每段都人畜无害）
const PIPE_TO_SHELL = /(^|[\s;&|])(curl|wget|fetch|iwr|irm|invoke-webrequest|invoke-restmethod)\b[\s\S]*\|[\s\S]*\b(bash|sh|zsh|dash|ksh|fish|python3?|perl|ruby|node|iex|invoke-expression)\b/

// 读凭证 —— 私钥/云凭证被读出来之后下一步就是外发，值得先问一句。
// 行首锚定：`echo "cat id_rsa"` 不该报（那只是打印一行字）
const READ_CREDENTIALS = /^(cat|type|less|more|head|tail|xxd|od|strings|base64|cp|mv|scp|rsync|tar|zip|curl|wget|nc|ncat|grep|rg|awk|sed|find|get-content|gc)\b/
// `(?!\.pub)` 是必须的：`cp ~/.ssh/id_rsa.pub authorized_keys` 是再正常不过的操作
const CREDENTIAL_FILES = /(^|[^\w.])id_(rsa|ed25519|ecdsa|dsa)(?!\.pub)|\.aws\/credentials|\.netrc|\.pgpass|\.git-credentials|\.npmrc|\.docker\/config\.json|\.kube\/config|credentials-vault/

/** 剥掉包装前缀（含 sudo 自己的旗标），留下真正要判的那条命令 */
function stripWrappers (seg) {
  const parts = seg.split(/\s+/)
  let i = 0
  while (i < parts.length) {
    const p = parts[i]
    if (WRAPPERS.has(p)) { i++; continue }
    // 只在开头剥旗标：剥到第一个真命令就停，否则 `rm -rf /` 的 -rf 会被吃掉
    if (i > 0 && /^\w+=/.test(p)) { i++; continue } // env VAR=x cmd
    if (i > 0 && p.startsWith('-')) {
      i += WRAPPER_TAKES_VALUE.has(p) ? 2 : 1
      continue
    }
    break
  }
  return parts.slice(i).join(' ')
}

function normalizeSegment (seg) {
  return stripWrappers(seg.trim().toLowerCase())
}

/**
 * @param {string} cmd 待执行的命令
 * @returns {boolean} true = 需要用户确认后才执行
 */
export function isDangerousCommand (cmd) {
  if (typeof cmd !== 'string') return false
  const full = cmd.trim().toLowerCase()
  if (!full) return false

  if (PIPE_TO_SHELL.test(full)) return true

  return full
    .split(SEPARATOR)
    .map(normalizeSegment)
    .filter(Boolean)
    .some(seg =>
      isWideRm(seg) ||
      SEGMENT_PATTERNS.some(p => p.test(seg)) ||
      (READ_CREDENTIALS.test(seg) && CREDENTIAL_FILES.test(seg))
    )
}
