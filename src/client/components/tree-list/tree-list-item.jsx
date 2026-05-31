/**
 * tree list for bookmarks
 */

import { memo } from 'react'
import { createTitleTag } from '../../common/create-title'
import classnames from 'classnames'
import highlight from '../common/highlight'
import uid from '../../common/uid'
import { LinkOutlined } from '@ant-design/icons'

function areEqual (prevProps, nextProps) {
  const prevSelected = prevProps.selectedItemId === prevProps.item.id
  const nextSelected = nextProps.selectedItemId === nextProps.item.id
  const prevSearchSelected = Boolean(prevProps.searchSelected)
  const nextSearchSelected = Boolean(nextProps.searchSelected)

  return prevProps.isGroup === nextProps.isGroup &&
    prevProps.parentId === nextProps.parentId &&
    prevProps.staticList === nextProps.staticList &&
    prevProps.keyword === nextProps.keyword &&
    prevSelected === nextSelected &&
    prevSearchSelected === nextSearchSelected &&
    prevProps.item.id === nextProps.item.id &&
    prevProps.itemLevel === nextProps.itemLevel &&
    prevProps.itemColor === nextProps.itemColor &&
    prevProps.itemDescription === nextProps.itemDescription &&
    prevProps.itemLabel === nextProps.itemLabel
}

function TreeListItem (props) {
  const onSelect = (e) => {
    props.onSelect(e)
  }

  const onDragOver = e => {
    props.onDragOver(e)
  }

  const onDragStart = e => {
    props.onDragStart(e)
  }

  const onDragEnter = e => {
    props.onDragEnter(e)
  }

  const onDragLeave = e => {
    props.onDragLeave(e)
  }

  const onDrop = e => {
    props.onDrop(e)
  }

  const {
    item,
    isGroup,
    selectedItemId
  } = props
  const cls = classnames(
    {
      selected: selectedItemId === item.id,
      'search-selected': props.searchSelected
    },
    'tree-item',
    {
      'is-category': isGroup,
      level2: item.level === 2
    }
  )
  const tag = isGroup ? '' : createTitleTag(item)
  const colorTag = isGroup && item.color
    ? (
      <span
        className='category-color-tag'
        style={{
          backgroundColor: item.color
        }}
      />
      )
    : null
  const title = isGroup
    ? item.title
    : props.itemLabel
  const titleAll = title + (item.description ? ' - ' + item.description : '')
  const titleHighlight = isGroup
    ? item.title || 'no title'
    : highlight(
      title,
      props.keyword
    )
  const propsAll = {
    className: cls,
    title: titleAll,
    draggable: true,
    'data-item-id': item.id,
    'data-parent-id': props.parentId,
    'data-is-group': isGroup ? 'true' : 'false',
    onDragOver,
    onDragStart,
    onDragEnter,
    onDragLeave,
    onDrop
  }
  const titleProps = {
    className: 'tree-item-title elli',
    onClick: onSelect,
    'data-item-id': item.id,
    'data-is-group': isGroup ? 'true' : 'false',
    'data-parent-id': props.parentId
  }
  const key = item.id || uid()
  const vpsLink = (!isGroup && item.vpsUrl)
    ? (
      <span
        className='tree-item-vps-link'
        title={'打开 ' + item.vpsUrl}
        onClick={(e) => {
          e.stopPropagation()
          window.openLink(item.vpsUrl, '_blank')
        }}
        style={{ marginLeft: 6, color: '#1890ff', fontSize: 12 }}
      >
        <LinkOutlined />
      </span>
      )
    : null
  // 到期提醒
  const expiryWarn = (!isGroup && item.vpsExpiry)
    ? (() => {
      const d = new Date(item.vpsExpiry)
      if (isNaN(d.getTime())) return null
      const days = Math.ceil((d - Date.now()) / 86400000)
      if (days <= 0) return <span title='已到期！' style={{ marginLeft: 4, color: '#ff4d4f', fontSize: 11 }}>⚠过期</span>
      if (days <= 7) return <span title={`${days}天后到期`} style={{ marginLeft: 4, color: '#faad14', fontSize: 11 }}>⚠{days}天</span>
      return null
    })()
    : null
  return (
    <div
      {...propsAll}
      key={key}
    >
      <div
        {...titleProps}
      >
        {colorTag}{tag}{titleHighlight}{vpsLink}{expiryWarn}
      </div>
    </div>
  )
}

export default memo(TreeListItem, areEqual)
