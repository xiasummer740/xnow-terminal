import { useState, useMemo } from 'react'
import { Tabs, Input, Button, Tag, Collapse, Modal as AntModal, Popconfirm } from 'antd'
import {
  SearchOutlined,
  CheckCircleFilled,
  CheckCircleOutlined,
  DownloadOutlined,
  DeleteOutlined
} from '@ant-design/icons'
import {
  getAllAvailableSkills,
  getInstalledSkills,
  installSkill,
  uninstallSkill,
  BUILTIN_SKILLS,
  PERMISSION_LEVELS,
  getDrafts,
  approveDraft,
  rejectDraft
} from '../../common/skill-manager'
import message from '../common/message'
import './skill-store.styl'

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
 * 安装确认弹窗
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
 * 待审核 Tab — 待确认的 AI 生成技能草案
 */
function PendingSkillsTab ({ refresh }) {
  const drafts = useMemo(() => getDrafts(), [refresh])

  if (drafts.length === 0) {
    return <div className='empty-state'>没有待审核的技能草案</div>
  }

  const categoryColors = {
    '运维工具': 'blue',
    '监控工具': 'cyan',
    '部署工具': 'geekblue',
    '安全工具': 'red',
    'AI工具': 'purple'
  }

  return (
    <div>
      <div className='installed-count'>待审核技能 {drafts.length}</div>
      <div className='installed-list'>
        {drafts.map(draft => {
          const timeStr = draft.draftCreatedAt
            ? new Date(draft.draftCreatedAt).toLocaleString('zh-CN')
            : ''

          return (
            <div key={draft.id} className='installed-item'>
              <div className='installed-item-info'>
                <div className='installed-item-name'>
                  {draft.name}
                  <span className='installed-item-version'>{draft.category ? ` [${draft.category}]` : ''}</span>
                  <span className='installed-item-source source-ai_generated'>AI生成</span>
                </div>
                <div className='installed-item-desc'>{draft.description}</div>
                {timeStr && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>
                    生成于 {timeStr}
                  </div>
                )}
              </div>
              <div className='installed-item-actions' style={{ gap: 6 }}>
                <Button
                  size='small'
                  type='primary'
                  icon={<CheckCircleOutlined />}
                  onClick={() => {
                    const result = approveDraft(draft.id)
                    if (result.success) {
                      message.success(`「${draft.name}」已加入技能库！`)
                      window.store.triggerResize()
                    } else {
                      message.error(result.error || '安装失败')
                    }
                  }}
                >
                  加入技能库
                </Button>
                <Popconfirm
                  title={`确定忽略「${draft.name}」？`}
                  onConfirm={() => {
                    rejectDraft(draft.id)
                    message.info(`已忽略「${draft.name}」`)
                    window.store.triggerResize()
                  }}
                  okText='确定'
                  cancelText='取消'
                >
                  <Button size='small' danger icon={<DeleteOutlined />}>
                    忽略
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
    },
    {
      key: 'pending',
      label: '📋 待审核',
      children: <PendingSkillsTab refresh={refresh} />
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

export { SkillStoreTab, InstalledSkillsTab, PendingSkillsTab }
