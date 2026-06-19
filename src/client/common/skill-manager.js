/* global localStorage */
/**
 * 技能管理器
 * 管理 AI 技能的 CRUD、存储、签名验证
 */

const STORAGE_KEY = 'xnow_skills_index'
const SKILL_PREFIX = 'xnow_skill_'
const MAX_SKILLS = 50

const DRAFTS_KEY = 'xnow_skill_drafts_index'
const DRAFT_PREFIX = 'xnow_skill_draft_'
const MAX_DRAFTS = 20

// 内置技能列表（随 APP 发布）
const BUILTIN_SKILLS = [
  {
    id: 'xnow-skill-backup',
    name: '一键备份',
    version: '1.0.0',
    author: 'xnow-team',
    category: '运维工具',
    description: 'SSH 连接后一键打包备份服务器关键目录',
    prompt: `## 一键备份技能
当你被要求备份服务器时：
1. 确认 SSH 连接正常
2. 使用 tar 打包指定目录
3. 确认备份文件生成`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-log-analyzer',
    name: '日志分析',
    version: '1.0.0',
    author: 'xnow-team',
    category: '运维工具',
    description: '扫描 Nginx/Apache 日志统计 IP、状态码、请求频率',
    prompt: `## 日志分析技能
当你被要求分析服务器日志时：
1. 确认日志文件路径（默认 /var/log/nginx/access.log）
2. 使用 awk/grep 统计 IP 访问频率、状态码分布
3. 找出异常请求和错误率最高的端点
4. 输出统计结果和分析建议`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-site-monitor',
    name: '网站监控',
    version: '1.0.0',
    author: 'xnow-team',
    category: '监控工具',
    description: '定时检测网站 HTTP 状态码和响应时间',
    prompt: `## 网站监控技能
当你被要求监控网站状态时：
1. 使用 curl 检测目标 URL 的 HTTP 状态码
2. 记录响应时间
3. 对比多次检测结果判断稳定性
4. 出现 5xx 或超时时给出告警`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-batch-deploy',
    name: '批量部署',
    version: '1.0.0',
    author: 'xnow-team',
    category: '部署工具',
    description: '向多台服务器分发文件、执行远程命令',
    prompt: `## 批量部署技能
当你被要求批量部署时：
1. 确认目标服务器列表
2. 使用 scp/rsync 分发文件
3. 在每台服务器上执行部署命令
4. 逐台验证部署结果`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-port-scan',
    name: '端口扫描',
    version: '1.0.0',
    author: 'xnow-team',
    category: '安全工具',
    description: '扫描服务器开放端口，识别服务类型',
    prompt: `## 端口扫描技能
当你被要求扫描端口时：
1. 使用 nc/ss/iptables 等工具检测端口开放状态
2. 识别端口对应的常见服务
3. 标记高危端口（如 22/3306/6379 暴露公网）
4. 给出安全加固建议`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-code-review',
    name: 'AI 代码审查',
    version: '1.0.0',
    author: 'xnow-team',
    category: 'AI工具',
    description: '读取本地代码文件，AI 自动审查并给出修复建议',
    prompt: `## AI 代码审查技能
当你被要求审查代码时：
1. 读取目标代码文件
2. 检查：逻辑正确性、安全漏洞、性能瓶颈、代码风格
3. 列出每个问题及其严重级别
4. 给出具体的修复建议和示例代码`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-health-check',
    name: '系统体检',
    version: '1.0.0',
    author: 'xnow-team',
    category: '运维工具',
    description: '一键检查服务器 CPU/内存/磁盘/网络/进程状态',
    prompt: `## 系统体检技能
当你被要求检查服务器状态时：
1. 执行 \`uptime\` 查看负载和运行时间
2. 执行 \`free -h\` 查看内存使用
3. 执行 \`df -h\` 查看磁盘使用
4. 执行 \`top -bn1 | head -10\` 查看进程 TOP
5. 执行 \`ss -tlnp\` 查看监听端口
6. 汇总输出，标注异常项（如磁盘>80%、内存不足等）`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-perf-diagnose',
    name: '性能诊断',
    version: '1.0.0',
    author: 'xnow-team',
    category: '运维工具',
    description: '分析 CPU/内存/磁盘 IO 瓶颈，定位性能问题',
    prompt: `## 性能诊断技能
当你被要求排查性能问题时：
1. 执行 \`top -bn1\` 看 CPU 占用 TOP 进程
2. 执行 \`vmstat 1 3\` 看 CPU 队列和 IO 等待
3. 如果 IO 高，执行 \`iostat -x 1 3\` 看磁盘 IO
4. 执行 \`free -h\` 检查内存是否不足
5. 执行 \`dmesg | tail -20\` 检查内核错误
6. 汇总定位到瓶颈（CPU/内存/IO/网络）`,
    tools: [],
    source: 'builtin'
  },
  {
    id: 'xnow-skill-security-audit',
    name: '安全巡检',
    version: '1.0.0',
    author: 'xnow-team',
    category: '安全工具',
    description: '检查常见安全配置问题：SSH/防火墙/权限/漏洞',
    prompt: `## 安全巡检技能
当你被要求安全检查时：
1. 检查 SSH 配置：\`grep -E "PermitRootLogin|PasswordAuthentication" /etc/ssh/sshd_config\`
2. 检查防火墙：\`iptables -L -n\` 或 \`ufw status\`
3. 检查可疑登录：\`last -10\` 和 \`lastb -10\`
4. 检查 SUID 文件：\`find / -perm -4000 2>/dev/null\`
5. 检查监听端口：\`ss -tlnp\`
6. 标记每项的风险等级并给出加固建议`,
    tools: [],
    source: 'builtin'
  }
]

// 权限分级
const PERMISSION_LEVELS = {
  'exec:cmd': { label: '执行命令', risk: 'high' },
  'fs:read': { label: '读取文件', risk: 'medium' },
  'fs:write': { label: '写入文件', risk: 'high' },
  'network:fetch': { label: '网络请求', risk: 'medium' },
  'terminal:control': { label: '终端控制', risk: 'low' }
}

/**
 * 从 localStorage 加载已安装技能索引
 */
function loadIndex () {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 保存技能索引到 localStorage
 */
function saveIndex (list) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(list))
}

/**
 * 获取技能完整的 localStorage key
 */
function skillKey (id) {
  return SKILL_PREFIX + id
}

/**
 * 从 localStorage 加载草案索引
 */
function loadDraftIndex () {
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * 保存草案索引到 localStorage
 */
function saveDraftIndex (list) {
  localStorage.setItem(DRAFTS_KEY, JSON.stringify(list))
}

/**
 * 获取草案完整的 localStorage key
 */
function draftKey (id) {
  return DRAFT_PREFIX + id
}

/**
 * 保存单个技能的完整数据
 */
function saveSkillData (skill) {
  try {
    localStorage.setItem(skillKey(skill.id), JSON.stringify(skill))
    return true
  } catch (e) {
    console.error('[skill-manager] save error:', e.message)
    return false
  }
}

/**
 * 加载单个技能的完整数据
 */
function loadSkillData (id) {
  try {
    const raw = localStorage.getItem(skillKey(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

/**
 * 删除单个技能的数据
 */
function removeSkillData (id) {
  localStorage.removeItem(skillKey(id))
}

/**
 * 保存单个草案的完整数据
 */
function saveDraftData (draft) {
  try {
    localStorage.setItem(draftKey(draft.id), JSON.stringify(draft))
    return true
  } catch (e) {
    console.error('[skill-manager] saveDraft error:', e.message)
    return false
  }
}

/**
 * 删除单个草案的数据
 */
function removeDraftData (id) {
  localStorage.removeItem(draftKey(id))
}

/**
 * 验证签名（简单版）
 * 内置技能自动通过，AI生成技能自动通过，云端签名验证在后续阶段实现
 */
function verifySignature (skill) {
  if (skill.source === 'builtin' || skill.source === 'ai_generated' || skill.source === 'imported') return true
  if (!skill.signature) return false
  return true
}

/**
 * 获取所有已安装技能（含完整数据）
 */
function getInstalledSkills () {
  const index = loadIndex()
  return index.map((entry) => loadSkillData(entry.id)).filter(Boolean)
}

/**
 * 安装技能
 */
function installSkill (skill) {
  if (!skill || !skill.id) return { success: false, error: '无效技能' }

  const index = loadIndex()

  // 检查是否已安装
  if (index.find((e) => e.id === skill.id)) {
    return { success: false, error: '技能已安装' }
  }

  // 检查数量上限
  if (index.length >= MAX_SKILLS) {
    return { success: false, error: '技能数量已达上限' }
  }

  // 验证签名
  if (!verifySignature(skill)) {
    return { success: false, error: '签名验证失败' }
  }

  // 保存完整数据
  skill.installedAt = Date.now()
  if (!saveSkillData(skill)) {
    return { success: false, error: '存储失败' }
  }

  // 更新索引
  index.push({ id: skill.id, name: skill.name, version: skill.version })
  saveIndex(index)

  return { success: true }
}

/**
 * 卸载技能
 */
function uninstallSkill (id) {
  const index = loadIndex()
  const idx = index.findIndex((e) => e.id === id)
  if (idx === -1) return { success: false, error: '技能未安装' }

  removeSkillData(id)
  index.splice(idx, 1)
  saveIndex(index)

  return { success: true }
}

/**
 * 检查技能是否已安装
 */
function isInstalled (id) {
  return loadIndex().some((e) => e.id === id)
}

/**
 * 获取所有可用技能（内置 + 已安装的云端/AI技能）
 */
function getAllAvailableSkills () {
  const installed = getInstalledSkills()
  const installedIds = new Set(installed.map((s) => s.id))

  // 内置技能全部可用
  const builtin = BUILTIN_SKILLS.filter((s) => !installedIds.has(s.id))

  return [...installed, ...builtin]
}

function saveDraft (draft) {
  if (!draft || !draft.name) return { success: false, error: '无效草案' }

  const index = loadDraftIndex()

  // 超出上限时淘汰最旧的
  if (index.length >= MAX_DRAFTS) {
    const oldest = index.reduce((a, b) => ((a.createdAt || 0) < (b.createdAt || 0) ? a : b))
    removeDraftData(oldest.id)
    const idx = index.indexOf(oldest)
    if (idx !== -1) index.splice(idx, 1)
  }

  draft.draftStatus = 'pending'
  draft.draftCreatedAt = draft.draftCreatedAt || Date.now()

  if (!saveDraftData(draft)) {
    return { success: false, error: '存储失败' }
  }

  index.push({
    id: draft.id,
    name: draft.name,
    version: draft.version,
    category: draft.category,
    createdAt: draft.draftCreatedAt
  })
  saveDraftIndex(index)

  return { success: true }
}

function getDrafts () {
  const index = loadDraftIndex()
  return index
    .map((entry) => {
      try {
        const raw = localStorage.getItem(draftKey(entry.id))
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    })
    .filter(Boolean)
}

function getDraftById (id) {
  try {
    const raw = localStorage.getItem(draftKey(id))
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function approveDraft (id) {
  const draft = getDraftById(id)
  if (!draft) return { success: false, error: '草案不存在' }

  delete draft.draftStatus
  delete draft.draftCreatedAt
  delete draft.relatedTask

  const result = installSkill(draft)
  if (result.success) {
    removeDraftData(id)
    const index = loadDraftIndex()
    const idx = index.findIndex((e) => e.id === id)
    if (idx !== -1) {
      index.splice(idx, 1)
      saveDraftIndex(index)
    }
  }
  return result
}

function rejectDraft (id) {
  removeDraftData(id)
  const index = loadDraftIndex()
  const idx = index.findIndex((e) => e.id === id)
  if (idx !== -1) {
    index.splice(idx, 1)
    saveDraftIndex(index)
  }
  return { success: true }
}

function hasSimilarSkill (draft) {
  const allNames = [
    ...BUILTIN_SKILLS.map((s) => s.name),
    ...getInstalledSkills().map((s) => s.name),
    ...getDrafts().map((s) => s.name)
  ]
  return allNames.some(
    (name) => name === draft.name || name.includes(draft.name) || draft.name.includes(name)
  )
}

export {
  installSkill,
  uninstallSkill,
  isInstalled,
  getInstalledSkills,
  getAllAvailableSkills,
  verifySignature,
  BUILTIN_SKILLS,
  PERMISSION_LEVELS,
  MAX_SKILLS,
  saveDraft,
  getDrafts,
  getDraftById,
  approveDraft,
  rejectDraft,
  hasSimilarSkill
}
