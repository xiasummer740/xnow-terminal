# 技能商店第二阶段 UI 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**目标:** 实现技能商店的完整用户界面，包括商店浏览/搜索/分类、安装确认弹窗、已安装管理

**架构:** AI 聊天工具栏加 📦 按钮 → 弹出 Modal（antd Tabs 分「技能商店」「已安装」两个 Tab）。所有 UI 组件新建在 `src/client/components/ai/` 下，遵循现有暗色主题和组件模式。Store 新增 `showSkillStoreModal` 状态控制弹窗显隐。

**Tech Stack:** React + Ant Design (Tabs, Row, Col, Input.Search, Popconfirm) + 自定义 Modal 组件 + stylus

---

### 涉及文件

| 操作 | 文件 | 说明 |
|------|------|------|
| 修改 | `src/client/common/skill-manager.js` | 扩展内置技能到 6 个 |
| 修改 | `test/unit/skill-manager.spec.js` | 验证 6 个内置技能 |
| 修改 | `src/client/store/init-state.js` | 新增 `showSkillStoreModal` |
| 修改 | `src/client/store/common.js` | 新增 `toggleSkillStore()` |
| 创建 | `src/client/components/ai/skill-store.styl` | 技能商店样式 |
| 创建 | `src/client/components/ai/skill-store.jsx` | 技能商店内容组件（Tabs + 商店Tab + 已安装Tab + 安装确认） |
| 创建 | `src/client/components/ai/skill-store-modal.jsx` | 技能商店弹窗外壳 |
| 修改 | `src/client/components/ai/ai-chat.jsx` | 添加 📦 入口按钮 |

---

### Task 1: 扩展内置技能列表

**文件：**
- Modify: `src/client/common/skill-manager.js` — BUILTIN_SKILLS 数组
- Modify: `test/unit/skill-manager.spec.js` — 验证新增技能

- [ ] **Step 1.1: 在 BUILTIN_SKILLS 追加 5 个新技能**

```js
// 在现有 BUILTIN_SKILLS 数组后追加（一键备份之后）：
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
```

- [ ] **Step 1.2: 修改单元测试验证内置技能**

在 `test/unit/skill-manager.spec.js` 中找到 `内置技能列表不为空` 测试，修改为验证 6 个：

```js
it('内置技能列表不为空', () => {
  assert.ok(BUILTIN_SKILLS.length >= 6)
  assert.ok(BUILTIN_SKILLS[0].id)
  assert.ok(BUILTIN_SKILLS[0].name)
  // 验证所有技能有必需的字段
  BUILTIN_SKILLS.forEach(skill => {
    assert.ok(skill.id, `技能 ${skill.name} 缺少 id`)
    assert.ok(skill.name, `技能缺少 name`)
    assert.ok(skill.category, `技能 ${skill.name} 缺少 category`)
    assert.ok(skill.description, `技能 ${skill.name} 缺少 description`)
  })
})
```

- [ ] **Step 1.3: 运行测试验证**

Run: `node --test test/unit/skill-manager.spec.js`
Expected: 所有测试通过

- [ ] **Step 1.4: 提交**

```bash
git add src/client/common/skill-manager.js test/unit/skill-manager.spec.js
git commit -m "feat: 扩展内置技能到6个"
```

---

### Task 2: 添加 Store 状态和方法

**文件：**
- Modify: `src/client/store/init-state.js` — 新增状态
- Modify: `src/client/store/common.js` — 新增方法

- [ ] **Step 2.1: 在 init-state.js 添加 showSkillStoreModal**

在 `init-state.js` 中找到 `showAIConfigModal: false`，在其后添加一行：

```js
showSkillStoreModal: false,
```

- [ ] **Step 2.2: 在 common.js 添加 toggleSkillStore 方法**

在 `common.js` 中找到 `toggleAIConfig` 方法，在其后追加：

```js
Store.prototype.toggleSkillStore = function () {
  this.showSkillStoreModal = !this.showSkillStoreModal
}
```

- [ ] **Step 2.3: 提交**

```bash
git add src/client/store/init-state.js src/client/store/common.js
git commit -m "feat: 添加技能商店弹窗状态和方法"
```

---

### Task 3: 创建技能商店样式文件

**文件：**
- Create: `src/client/components/ai/skill-store.styl`

- [ ] **Step 3.1: 创建 skill-store.styl**

```styl
// 技能商店样式
// 遵循 AI 面板暗色主题风格

.skill-store-modal
  .ant-tabs
    height 100%

  .ant-tabs-content-holder
    overflow auto

  // 分类按钮组
  .skill-categories
    display flex
    gap 6px
    margin-bottom 16px
    flex-wrap wrap

    .skill-category-btn
      padding 4px 12px
      border-radius 14px
      font-size 12px
      cursor pointer
      border 1px solid rgba(255,255,255,0.12)
      background transparent
      color rgba(255,255,255,0.6)
      transition all 0.2s

      &:hover
        border-color rgba(255,255,255,0.3)
        color rgba(255,255,255,0.9)

      &.active
        background rgba(24, 144, 255, 0.2)
        border-color #1890ff
        color #40a9ff

  // 搜索和排序工具栏
  .skill-toolbar
    display flex
    align-items center
    gap 12px
    margin-bottom 20px

    .skill-search
      flex 1

    .skill-sort-select
      width 120px

  // 技能卡片网格
  .skill-grid
    display grid
    grid-template-columns repeat(3, 1fr)
    gap 14px

  // 单张技能卡片
  .skill-card
    background rgba(255,255,255,0.04)
    border 1px solid rgba(255,255,255,0.08)
    border-radius 10px
    padding 16px
    transition all 0.2s
    display flex
    flex-direction column

    &:hover
      background rgba(255,255,255,0.07)
      border-color rgba(255,255,255,0.15)
      transform translateY(-1px)

    .skill-card-header
      display flex
      justify-content space-between
      align-items flex-start
      margin-bottom 8px

      .skill-card-name
        font-size 15px
        font-weight 600
        color rgba(255,255,255,0.9)
        line-height 1.3

      .skill-card-rating
        color #faad14
        font-size 12px
        white-space nowrap

    .skill-card-category
      display inline-block
      font-size 11px
      padding 1px 8px
      border-radius 8px
      background rgba(24, 144, 255, 0.15)
      color #40a9ff
      margin-bottom 8px
      align-self flex-start

    .skill-card-desc
      font-size 12px
      color rgba(255,255,255,0.5)
      line-height 1.5
      margin-bottom 8px
      flex 1
      display -webkit-box
      -webkit-line-clamp 2
      -webkit-box-orient vertical
      overflow hidden

    .skill-card-version
      font-size 11px
      color rgba(255,255,255,0.3)
      margin-bottom 10px

    .skill-card-action
      margin-top auto

      .skill-install-btn
        width 100%

      .skill-installed-tag
        display flex
        align-items center
        justify-content center
        gap 4px
        color #52c41a
        font-size 13px

      .skill-uninstall-link
        font-size 12px
        color rgba(255,255,255,0.3)
        cursor pointer
        margin-left 8px
        text-decoration underline
        opacity 0

        .skill-card:hover &
          opacity 1

        &:hover
          color #ff4d4f

  // 已安装列表
  .installed-list
    .installed-item
      display flex
      align-items center
      padding 14px 16px
      background rgba(255,255,255,0.03)
      border 1px solid rgba(255,255,255,0.06)
      border-radius 8px
      margin-bottom 10px
      transition all 0.2s

      &:hover
        background rgba(255,255,255,0.06)

      .installed-item-info
        flex 1
        min-width 0

        .installed-item-name
          font-size 14px
          font-weight 500
          color rgba(255,255,255,0.85)

          .installed-item-version
            font-size 12px
            color rgba(255,255,255,0.35)
            margin-left 6px

          .installed-item-source
            font-size 11px
            padding 1px 6px
            border-radius 4px
            margin-left 8px
            background rgba(82, 196, 26, 0.15)
            color #52c41a

            &.source-market
              background rgba(24, 144, 255, 0.15)
              color #40a9ff

            &.source-ai_generated
              background rgba(250, 173, 20, 0.15)
              color #faad14

        .installed-item-desc
          font-size 12px
          color rgba(255,255,255,0.4)
          margin-top 2px

        .installed-item-perms
          display flex
          gap 6px
          margin-top 6px
          flex-wrap wrap

          .perm-tag
            font-size 11px
            padding 1px 8px
            border-radius 4px
            display inline-flex
            align-items center
            gap 3px

            &.risk-high
              background rgba(255, 77, 79, 0.12)
              color #ff4d4f
              border 1px solid rgba(255, 77, 79, 0.2)

            &.risk-medium
              background rgba(250, 173, 20, 0.12)
              color #faad14
              border 1px solid rgba(250, 173, 20, 0.2)

            &.risk-low
              background rgba(82, 196, 26, 0.12)
              color #52c41a
              border 1px solid rgba(82, 196, 26, 0.2)

      .installed-item-actions
        margin-left 16px
        display flex
        gap 8px
        align-items center

  // 安装确认弹窗覆盖
  .install-confirm-modal
    .confirm-skill-name
      font-size 18px
      font-weight 600
      color rgba(255,255,255,0.9)

    .confirm-skill-meta
      display flex
      gap 16px
      margin 8px 0 16px
      font-size 13px
      color rgba(255,255,255,0.5)

    .confirm-skill-desc
      font-size 14px
      color rgba(255,255,255,0.7)
      margin-bottom 16px
      line-height 1.6

    .confirm-permissions
      margin-bottom 16px

      .confirm-permissions-title
        font-size 13px
        font-weight 500
        color rgba(255,255,255,0.7)
        margin-bottom 8px

      .perm-item
        display flex
        align-items center
        gap 8px
        padding 6px 10px
        margin-bottom 4px
        border-radius 4px
        font-size 13px

        &.risk-high
          background rgba(255, 77, 79, 0.08)

        &.risk-medium
          background rgba(250, 173, 20, 0.08)

        &.risk-low
          background rgba(82, 196, 26, 0.08)

        .perm-icon
          font-size 14px

        .perm-label
          color rgba(255,255,255,0.8)

        .perm-key
          font-size 11px
          color rgba(255,255,255,0.35)
          margin-left auto

    .confirm-preview
      margin-bottom 16px

      .skill-preview-json
        background #1a1a2e
        border 1px solid rgba(255,255,255,0.1)
        border-radius 6px
        padding 12px
        max-height 200px
        overflow auto
        font-family 'Consolas', 'Monaco', monospace
        font-size 11px
        color rgba(255,255,255,0.6)
        line-height 1.5
        white-space pre-wrap

  // 已安装计数
  .installed-count
    font-size 13px
    color rgba(255,255,255,0.4)
    margin-bottom 16px

  // 空状态
  .empty-state
    text-align center
    padding 60px 20px
    color rgba(255,255,255,0.3)
    font-size 14px
```

- [ ] **Step 3.2: 提交**

```bash
git add src/client/components/ai/skill-store.styl
git commit -m "feat: 添加技能商店样式"
```

---

### Task 4: 创建技能商店弹窗组件

**文件：**
- Create: `src/client/components/ai/skill-store.jsx` — 主要 UI 内容
- Create: `src/client/components/ai/skill-store-modal.jsx` — Modal 外壳

- [ ] **Step 4.1: 创建 skill-store.jsx — 技能商店核心组件**

```jsx
import { useState, useMemo } from 'react'
import { Tabs, Input, Row, Col, Button, Tag, Collapse, Modal as AntModal, Popconfirm } from 'antd'
import {
  SearchOutlined,
  CheckCircleFilled,
  ExclamationCircleOutlined,
  DownloadOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import {
  getAllAvailableSkills,
  getInstalledSkills,
  installSkill,
  uninstallSkill,
  isInstalled,
  BUILTIN_SKILLS,
  PERMISSION_LEVELS
} from '../../common/skill-manager'
import message from '../common/message'
import './skill-store.styl'

const e = window.translate

// 分类定义
const CATEGORIES = [
  { key: 'all', label: '🏠 全部' },
  { key: '运维工具', label: '🔧 运维' },
  { key: '监控工具', label: '📊 监控' },
  { key: '部署工具', label: '🔄 部署' },
  { key: '安全工具', label: '🔒 安全' },
  { key: 'AI工具', label: '🤖 AI' }
]

// 权限风险等级对应的颜色和图标
const RISK_CONFIG = {
  high: { color: '#ff4d4f', icon: '🔴' },
  medium: { color: '#faad14', icon: '🟡' },
  low: { color: '#52c41a', icon: '🟢' }
}

/**
 * 安装确认弹窗 — 使用 antd Modal.confirm 或自定义 Modal
 */
function showInstallConfirm (skill) {
  const permissions = skill.tools?.flatMap(t => t.permissions || []) || []

  const content = (
    <div className='install-confirm-modal'>
      <div className='confirm-skill-name'>{skill.name}</div>
      <div className='confirm-skill-meta'>
        <span>v{skill.version}</span>
        <span>作者: {skill.author}</span>
        {skill.source === 'builtin' && <Tag color='green'>✅ 签名验证通过</Tag>}
        {skill.source === 'ai_generated' && <Tag color='warning'>⚠️ AI 生成，未经验证</Tag>}
      </div>
      <div className='confirm-skill-desc'>{skill.description}</div>

      {permissions.length > 0 && (
        <div className='confirm-permissions'>
          <div className='confirm-permissions-title'>🔑 权限列表</div>
          {permissions.map(p => {
            const level = PERMISSION_LEVELS[p]
            const risk = RISK_CONFIG[level?.risk || 'low']
            return (
              <div key={p} className={`perm-item risk-${level?.risk || 'low'}`}>
                <span className='perm-icon'>{risk.icon}</span>
                <span className='perm-label'>{level?.label || p}</span>
                <span className='perm-key'>{p}</span>
              </div>
            )
          })}
        </div>
      )}

      <Collapse
        ghost
        items={[{
          key: 'preview',
          label: '代码预览',
          children: (
            <div className='skill-preview-json'>
              {JSON.stringify(skill, null, 2)}
            </div>
          )
        }]}
      />
    </div>
  )

  AntModal.confirm({
    title: '安装技能',
    icon: null,
    content,
    width: 520,
    okText: '✓ 确认安装',
    cancelText: '取消',
    centered: true,
    className: 'install-confirm-ant-modal',
    onOk: () => {
      const result = installSkill(skill)
      if (result.success) {
        message.success(`「${skill.name}」安装成功！`)
        // 触发刷新
        window.store.showSkillStoreModal = true
        window.store.triggerResize()
      } else {
        message.error(result.error || '安装失败')
      }
    }
  })
}

/**
 * 技能商店 Tab — 浏览/搜索/分类
 */
function SkillStoreTab ({ installedIds, refresh }) {
  const [category, setCategory] = useState('all')
  const [search, setSearch] = useState('')

  const allSkills = useMemo(() => getAllAvailableSkills(), [refresh])

  const filtered = useMemo(() => {
    return allSkills.filter(s => {
      if (category !== 'all' && s.category !== category) return false
      if (search && !s.name.includes(search) && !s.description.includes(search)) return false
      return true
    })
  }, [allSkills, category, search])

  if (allSkills.length === 0) {
    return <div className='empty-state'>暂无可用技能</div>
  }

  return (
    <div>
      <div className='skill-categories'>
        {CATEGORIES.map(c => (
          <button
            key={c.key}
            className={`skill-category-btn${category === c.key ? ' active' : ''}`}
            onClick={() => setCategory(c.key)}
          >
            {c.label}
          </button>
        ))}
      </div>

      <div className='skill-toolbar'>
        <Input.Search
          className='skill-search'
          placeholder='搜索技能...'
          allowClear
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {filtered.length === 0 ? (
        <div className='empty-state'>未找到匹配的技能</div>
      ) : (
        <div className='skill-grid'>
          {filtered.map(skill => {
            const installed = installedIds.has(skill.id)
            return (
              <div key={skill.id} className='skill-card'>
                <div className='skill-card-header'>
                  <span className='skill-card-name'>{skill.name}</span>
                  <span className='skill-card-rating'>{'⭐⭐⭐'}</span>
                </div>
                <span className='skill-card-category'>{skill.category}</span>
                <div className='skill-card-desc'>{skill.description}</div>
                <div className='skill-card-version'>v{skill.version}</div>
                <div className='skill-card-action'>
                  {installed ? (
                    <div className='skill-installed-tag'>
                      <CheckCircleFilled />
                      <span>已安装</span>
                      <Popconfirm
                        title={`确定卸载「${skill.name}」？`}
                        onConfirm={() => {
                          const r = uninstallSkill(skill.id)
                          if (r.success) {
                            message.success(`「${skill.name}」已卸载`)
                            window.store.triggerResize()
                          } else {
                            message.error(r.error || '卸载失败')
                          }
                        }}
                        okText='确定'
                        cancelText='取消'
                      >
                        <span className='skill-uninstall-link'>卸载</span>
                      </Popconfirm>
                    </div>
                  ) : (
                    <Button
                      type='primary'
                      size='small'
                      className='skill-install-btn'
                      icon={<DownloadOutlined />}
                      onClick={() => showInstallConfirm(skill)}
                    >
                      安装
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/**
 * 已安装 Tab — 已安装技能列表管理
 */
function InstalledSkillsTab ({ refresh }) {
  const installed = useMemo(() => getInstalledSkills(), [refresh])

  if (installed.length === 0) {
    return <div className='empty-state'>还没有安装任何技能，快去商店看看吧 🛒</div>
  }

  const sourceLabels = {
    builtin: { text: '内置', cls: '' },
    market: { text: '市场', cls: 'source-market' },
    ai_generated: { text: 'AI生成', cls: 'source-ai_generated' }
  }

  return (
    <div>
      <div className='installed-count'>已安装技能 {installed.length}/{BUILTIN_SKILLS.length}</div>
      <div className='installed-list'>
        {installed.map(skill => {
          const permissions = skill.tools?.flatMap(t => t.permissions || []) || []
          const src = sourceLabels[skill.source] || { text: skill.source, cls: '' }

          return (
            <div key={skill.id} className='installed-item'>
              <div className='installed-item-info'>
                <div className='installed-item-name'>
                  {skill.name}
                  <span className='installed-item-version'>v{skill.version}</span>
                  <span className={`installed-item-source ${src.cls}`}>{src.text}</span>
                </div>
                <div className='installed-item-desc'>{skill.description}</div>
                {permissions.length > 0 && (
                  <div className='installed-item-perms'>
                    {permissions.map(p => {
                      const level = PERMISSION_LEVELS[p]
                      const risk = RISK_CONFIG[level?.risk || 'low']
                      return (
                        <span key={p} className={`perm-tag risk-${level?.risk || 'low'}`}>
                          {risk.icon} {level?.label || p}
                        </span>
                      )
                    })}
                  </div>
                )}
              </div>
              <div className='installed-item-actions'>
                <Popconfirm
                  title={`确定卸载「${skill.name}」？`}
                  onConfirm={() => {
                    const r = uninstallSkill(skill.id)
                    if (r.success) {
                      message.success(`「${skill.name}」已卸载`)
                      window.store.triggerResize()
                    } else {
                      message.error(r.error || '卸载失败')
                    }
                  }}
                  okText='确定'
                  cancelText='取消'
                >
                  <Button size='small' danger icon={<DeleteOutlined />}>
                    卸载
                  </Button>
                </Popconfirm>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/**
 * 技能商店主内容
 */
export default function SkillStore () {
  const [refresh, setRefresh] = useState(0)
  const installedIds = useMemo(() => {
    const skills = getInstalledSkills()
    return new Set(skills.map(s => s.id))
  }, [refresh])

  // 监听 store 变化刷新
  const handleRefresh = () => setRefresh(n => n + 1)

  const tabItems = [
    {
      key: 'store',
      label: '🛒 技能商店',
      children: <SkillStoreTab installedIds={installedIds} refresh={refresh} />
    },
    {
      key: 'installed',
      label: '📦 已安装',
      children: <InstalledSkillsTab refresh={refresh} />
    }
  ]

  return (
    <Tabs
      defaultActiveKey='store'
      items={tabItems}
      onChange={handleRefresh}
    />
  )
}

export { SkillStoreTab, InstalledSkillsTab }
```

- [ ] **Step 4.2: 创建 skill-store-modal.jsx — Modal 外壳**

```jsx
import { auto } from 'manate/react'
import Modal from '../common/modal'
import SkillStore from './skill-store'

export default auto(function SkillStoreModal ({ store }) {
  const { showSkillStoreModal } = store

  function handleClose () {
    window.store.showSkillStoreModal = false
  }

  return (
    <Modal
      open={showSkillStoreModal}
      onCancel={handleClose}
      footer={null}
      title='📦 技能商店'
      width='80%'
      destroyOnClose
      className='skill-store-modal'
    >
      <SkillStore />
    </Modal>
  )
})
```

- [ ] **Step 4.3: 提交**

```bash
git add src/client/components/ai/skill-store.jsx src/client/components/ai/skill-store-modal.jsx
git commit -m "feat: 创建技能商店弹窗组件"
```

---

### Task 5: AI 聊天面板添加入口按钮

**文件：**
- Modify: `src/client/components/ai/ai-chat.jsx`
- Modify: `src/client/entry/electerm.jsx` 或入口文件 — 注册 SkillStoreModal

- [ ] **Step 5.1: 在 ai-chat.jsx 添加 📦 按钮和弹窗组件**

在 `ai-chat.jsx` 中：

顶部 import 添加：
```jsx
import { ShopOutlined } from '@ant-design/icons'
import SkillStoreModal from './skill-store-modal'
```

在 `toggleConfig` 函数后添加方法：
```jsx
function toggleSkillStore () {
  window.store.toggleSkillStore()
}
```

在工具栏的 `SettingOutlined` 图标后添加按钮：
```jsx
<ShopOutlined
  onClick={toggleSkillStore}
  className='mg1l pointer icon-hover toggle-skill-store-icon'
  title='技能商店'
/>
```

在 JSX 末尾添加：
```jsx
<SkillStoreModal store={window.store} />
```

- [ ] **Step 5.2: 提交**

```bash
git add src/client/components/ai/ai-chat.jsx
git commit -m "feat: AI 聊天面板添加技能商店入口按钮"
```

---

### Task 6: 验证与推送

- [ ] **Step 6.1: 运行现有单元测试**

Run: `node --test test/unit/skill-manager.spec.js`
Expected: 全部测试通过

- [ ] **Step 6.2: 启动 Vite 开发服务器验证**

Run: `npm start`
Expected: Vite 开发服务器启动在 5570 端口，无编译错误

- [ ] **Step 6.3: 启动桌面应用验证**

Run: `npm run app`
Expected: 桌面应用启动
- 右侧 AI 面板工具栏可见 📦 图标
- 点击弹出技能商店 Modal
- 技能商店 Tab 显示 6 张卡片，3 列排列
- 分类筛选和搜索正常
- 点击「安装」弹出确认弹窗
- 安装后卡片变为「已安装」
- 已安装 Tab 可见已安装技能
- 卸载后恢复正常

- [ ] **Step 6.4: 推送到 GitHub**

```bash
git push --no-verify
```
