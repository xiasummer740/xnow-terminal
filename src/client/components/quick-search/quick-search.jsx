/**
 * 全局快速搜索 — Ctrl+P 打开，搜书签/历史/命令
 */
import { useState, useEffect, useRef, useMemo } from 'react'
import { Modal, Input, List, Tag } from 'antd'
import { SearchOutlined, BookOutlined, ClockCircleOutlined, ThunderboltOutlined } from '@ant-design/icons'
import './quick-search.styl'

export default function QuickSearch () {
  const [open, setOpen] = useState(false)
  const [keyword, setKeyword] = useState('')
  const inputRef = useRef(null)

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault()
        setOpen(true)
        setTimeout(() => inputRef.current?.focus(), 100)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const results = useMemo(() => {
    if (!keyword.trim()) return []
    const k = keyword.toLowerCase()
    const items = []

    // 搜索书签
    const bookmarks = window.store.bookmarks || []
    for (const b of bookmarks) {
      const title = (b.title || '').toLowerCase()
      const host = (b.host || '').toLowerCase()
      if (title.includes(k) || host.includes(k)) {
        items.push({
          key: 'bm-' + b.id,
          type: 'bookmark',
          label: b.title || `${b.username || ''}@${b.host}`,
          desc: b.host + (b.port ? ':' + b.port : ''),
          action: () => { setOpen(false); window.store.onSelectBookmark(b.id) },
          icon: <BookOutlined />
        })
      }
    }

    // 搜索历史
    const history = window.store.history || []
    for (const h of history) {
      const title = (h.title || '').toLowerCase()
      const host = (h.host || '').toLowerCase()
      if (title.includes(k) || host.includes(k)) {
        items.push({
          key: 'hist-' + h.id,
          type: 'history',
          label: h.title || `${h.username || ''}@${h.host}`,
          desc: h.host || '',
          action: () => { setOpen(false); window.store.onSelectBookmark(h.id) },
          icon: <ClockCircleOutlined />
        })
      }
    }

    // 搜索快速命令
    const qm = window.store.quickCommands || window.store.currentQuickCommands || []
    for (const q of qm) {
      const name = (q.name || '').toLowerCase()
      const cmd = (q.cmd || '').toLowerCase()
      if (name.includes(k) || cmd.includes(k)) {
        items.push({
          key: 'qm-' + q.id,
          type: 'command',
          label: q.name || q.cmd,
          desc: q.cmd,
          action: () => { setOpen(false); window.store.runQuickCommand(q) },
          icon: <ThunderboltOutlined />
        })
      }
    }

    return items.slice(0, 30)
  }, [keyword])

  return (
    <Modal
      open={open}
      onCancel={() => { setOpen(false); setKeyword('') }}
      footer={null}
      width={560}
      className='quick-search-modal'
      closable={false}
      maskClosable
      destroyOnClose
    >
      <Input
        ref={inputRef}
        prefix={<SearchOutlined style={{ color: '#888' }} />}
        placeholder='搜索书签、历史、命令...'
        value={keyword}
        onChange={e => setKeyword(e.target.value)}
        size='large'
        bordered={false}
        style={{ fontSize: 16 }}
      />
      {results.length > 0 && (
        <List
          className='quick-search-list'
          dataSource={results}
          renderItem={item => (
            <List.Item
              onClick={item.action}
              className='quick-search-item'
            >
              <span className='qs-icon'>{item.icon}</span>
              <div className='qs-content'>
                <div className='qs-label'>{item.label}</div>
                <div className='qs-desc'>{item.desc}</div>
              </div>
              <Tag color={item.type === 'bookmark' ? 'blue' : item.type === 'history' ? 'purple' : 'orange'}>
                {item.type === 'bookmark' ? '书签' : item.type === 'history' ? '历史' : '命令'}
              </Tag>
            </List.Item>
          )}
        />
      )}
      {keyword && results.length === 0 && (
        <div style={{ padding: 24, textAlign: 'center', color: '#888' }}>无匹配结果</div>
      )}
    </Modal>
  )
}
