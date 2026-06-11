/**
 * 技能管理器
 * 管理 AI 技能的 CRUD、存储、签名验证
 */

const STORAGE_KEY = 'xnow_skills_index'
const SKILL_PREFIX = 'xnow_skill_'
const MAX_SKILLS = 50

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
  } catch { return [] }
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
  } catch { return null }
}

/**
 * 删除单个技能的数据
 */
function removeSkillData (id) {
  localStorage.removeItem(skillKey(id))
}

/**
 * 验证签名（简单版）
 * 内置技能自动通过，云端签名验证在后续阶段实现
 */
function verifySignature (skill) {
  if (skill.source === 'builtin') return true
  if (!skill.signature) return false
  return true
}

/**
 * 获取所有已安装技能（含完整数据）
 */
function getInstalledSkills () {
  const index = loadIndex()
  return index
    .map(entry => loadSkillData(entry.id))
    .filter(Boolean)
}

/**
 * 安装技能
 */
function installSkill (skill) {
  if (!skill || !skill.id) return { success: false, error: '无效技能' }

  const index = loadIndex()

  // 检查是否已安装
  if (index.find(e => e.id === skill.id)) {
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
  const idx = index.findIndex(e => e.id === id)
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
  return loadIndex().some(e => e.id === id)
}

/**
 * 获取所有可用技能（内置 + 已安装的云端/AI技能）
 */
function getAllAvailableSkills () {
  const installed = getInstalledSkills()
  const installedIds = new Set(installed.map(s => s.id))

  // 内置技能全部可用
  const builtin = BUILTIN_SKILLS.filter(s => !installedIds.has(s.id))

  return [...installed, ...builtin]
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
  MAX_SKILLS
}
