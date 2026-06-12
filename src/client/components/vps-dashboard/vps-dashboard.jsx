/**
 * VPS 监控看板 — 专业表格视图
 */
import { useState } from 'react'
import { Modal, Tag, Empty, Tooltip, Progress, Input, Button, message } from 'antd'
import { copy as clipboardCopy } from '../../common/clipboard'
import {
  ThunderboltOutlined,
  LinkOutlined,
  SearchOutlined,
  CopyOutlined,
  DownloadOutlined,
  UploadOutlined
} from '@ant-design/icons'
import './vps-dashboard.styl'

function StatusDot ({ expired, expiring }) {
  const color = expired ? '#ff4d4f' : expiring ? '#faad14' : '#52c41a'
  const pulse = expired ? { animation: 'none' } : {}
  return (
    <span style={{
      display: 'inline-block',
      width: 8,
      height: 8,
      borderRadius: '50%',
      background: color,
      marginRight: 6,
      boxShadow: `0 0 6px ${color}`,
      ...pulse
    }}
    />
  )
}

export default function VpsDashboard ({ visible, onClose }) {
  const [keyword, setKeyword] = useState('')
  const [backingUp, setBackingUp] = useState(false)
  const [importing, setImporting] = useState(false)
  const all = window.store.bookmarks || []

  // 一键备份所有书签
  const handleBackup = async () => {
    setBackingUp(true)
    try {
      // 1. 获取所有书签数据
      const jsonStr = await window.pre.runGlobalAsync('exportAllBookmarks')
      const data = JSON.parse(jsonStr)
      if (data.error) { message.error('备份失败: ' + data.error); return }
      if (!data.bookmarks || data.bookmarks.length === 0) { message.warning('没有书签需要备份'); return }

      // 2. 选择保存位置
      const now = new Date()
      const defaultName = `xnow_backup_${now.getFullYear()}_${now.getMonth() + 1}_${now.getDate()}.json`
      const result = await window.api.saveDialog({
        defaultPath: defaultName,
        filters: [{ name: 'JSON备份文件', extensions: ['json'] }]
      })
      if (result.canceled || !result.filePath) return

      // 3. 写入文件
      const writeResult = await window.pre.runGlobalAsync('writeLocalFile', result.filePath, jsonStr)
      const wr = JSON.parse(writeResult)
      if (wr.error) { message.error('保存失败: ' + wr.error); return }

      message.success(`✅ 备份成功！共 ${data.totalBookmarks} 条书签\n保存到: ${result.filePath}`, 5)
    } catch (e) {
      message.error('备份异常: ' + e.message)
    } finally {
      setBackingUp(false)
    }
  }

  // 一键恢复书签
  const handleRestore = async () => {
    setImporting(true)
    try {
      // 1. 选择备份文件
      const result = await window.api.openDialog({
        filters: [{ name: 'JSON备份文件', extensions: ['json'] }],
        properties: ['openFile']
      })
      if (!result || !result.length) return

      // 2. 读取文件
      const readResult = await window.pre.runGlobalAsync('readLocalFile', result[0])
      const rd = JSON.parse(readResult)
      if (rd.error) { message.error('读取文件失败: ' + rd.error); return }

      // 3. 导入到数据库
      const importResult = await window.pre.runGlobalAsync('importBookmarks', rd.content)
      const ir = JSON.parse(importResult)
      if (ir.error) { message.error('导入失败: ' + ir.error); return }

      // 4. 刷新前端书签数据
      const reloadData = await window.pre.runGlobalAsync('dbAction', 'bookmarks', 'find')
      window.store.setItems('bookmarks', reloadData)

      message.success('✅ 恢复成功！已导入 ' + ir.total + ' 条书签', 4)
    } catch (e) {
      message.error('恢复异常: ' + e.message)
    } finally {
      setImporting(false)
    }
  }

  // 每次渲染都重新计算（reactive 数组引用不变，useMemo 不会触发）
  const vpsList = (() => {
    const k = keyword.toLowerCase()
    return all
      .filter(b => b.vpsExpiry || b.vpsPrice || b.vpsTraffic || b.vpsUrl || b.vpsXrayPanel)
      .filter(b => !k || (b.title || '').toLowerCase().includes(k) || (b.host || '').toLowerCase().includes(k))
      .map(b => {
        const expiryDate = b.vpsExpiry ? new Date(b.vpsExpiry) : null
        const days = expiryDate && !isNaN(expiryDate.getTime())
          ? Math.ceil((expiryDate - Date.now()) / 86400000)
          : null
        const name = b.title || `${b.username || ''}@${b.host || ''}`
        return {
          id: b.id,
          name,
          host: b.host,
          vpsUrl: b.vpsUrl,
          days,
          vpsPrice: b.vpsPrice,
          vpsTraffic: b.vpsTraffic,
          vpsRecharge: b.vpsRecharge,
          vpsXrayPanel: b.vpsXrayPanel,
          expired: days !== null && days <= 0,
          expiring: days !== null && days > 0 && days <= 30
        }
      })
      .sort((a, b) => {
        if (a.days === null) return 1
        if (b.days === null) return -1
        return a.days - b.days
      })
  })()

  const stats = {
    total: vpsList.length,
    expired: vpsList.filter(v => v.expired).length,
    expiring: vpsList.filter(v => v.expiring).length,
    ok: vpsList.filter(v => !v.expired && !v.expiring).length
  }

  const maxDays = Math.max(...vpsList.map(v => v.days || 0), 365)

  return (
    <Modal
      title={
        <span style={{ fontSize: 15, fontWeight: 600 }}>
          <ThunderboltOutlined style={{ color: '#1890ff', marginRight: 8 }} />
          VPS 监控看板
        </span>
      }
      open={visible} onCancel={onClose} footer={null}
      width={960} className='vps-dashboard-modal' destroyOnClose
    >
      {/* 搜索 */}
      <div style={{ marginBottom: 12 }}>
        <Input
          prefix={<SearchOutlined style={{ color: '#888' }} />}
          placeholder='搜索 VPS 名称或 IP...'
          value={keyword}
          onChange={e => setKeyword(e.target.value)}
          allowClear
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>
      {/* 统计概览 */}
      <div className='vps-overview'>
        <div className='vps-overview-item'>
          <span className='vps-overview-num'>{stats.total}</span>
          <span className='vps-overview-label'>总计</span>
        </div>
        <div className='vps-overview-item green'>
          <span className='vps-overview-num'>{stats.ok}</span>
          <span className='vps-overview-label'>正常</span>
        </div>
        <div className='vps-overview-item orange'>
          <span className='vps-overview-num'>{stats.expiring}</span>
          <span className='vps-overview-label'>即将到期</span>
        </div>
        <div className='vps-overview-item red'>
          <span className='vps-overview-num'>{stats.expired}</span>
          <span className='vps-overview-label'>已过期</span>
        </div>
      </div>

      {/* 备份操作栏 */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Tooltip title='将所有VPS登录信息导出为JSON文件，换电脑或重装时恢复'>
          <Button
            icon={<DownloadOutlined />}
            size='small'
            loading={backingUp}
            onClick={handleBackup}
            style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
          >
            备份所有
          </Button>
        </Tooltip>
        <Tooltip title='从备份文件恢复VPS登录信息'>
          <Button
            icon={<UploadOutlined />}
            size='small'
            loading={importing}
            onClick={handleRestore}
            style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
          >
            恢复备份
          </Button>
        </Tooltip>
      </div>

      {vpsList.length === 0
        ? (
          <Empty style={{ padding: 40 }} description='暂无 VPS 数据，请在书签编辑中填写 VPS 字段' />
          )
        : (
          <div className='vps-table-wrap'>
            <table className='vps-table'>
              <thead>
                <tr>
                  <th style={{ width: 30 }} />
                  <th style={{ width: 160 }}>名称</th>
                  <th style={{ width: 130 }}>主机</th>
                  <th style={{ width: 130 }}>到期时间</th>
                  <th style={{ width: 90 }}>价格</th>
                  <th style={{ width: 90 }}>流量</th>
                  <th style={{ width: 90 }}>续费</th>
                  <th style={{ width: 50 }}>XXUI</th>
                  <th style={{ width: 50 }} />
                </tr>
              </thead>
              <tbody>
                {vpsList.map(vps => (
                  <tr key={vps.id} className={vps.expired ? 'row-expired' : vps.expiring ? 'row-warning' : ''}>
                    <td><StatusDot expired={vps.expired} expiring={vps.expiring} /></td>
                    <td>
                      <span className='vps-name'>{vps.name}</span>
                    </td>
                    <td>
                      <span className='vps-host'>{vps.host || '--'}</span>
                    </td>
                    <td>
                      {vps.days !== null
                        ? (
                          <div className='vps-expiry-cell'>
                            <Progress
                              percent={Math.min(100, Math.round((1 - vps.days / maxDays) * 100))}
                              size='small'
                              strokeColor={vps.expired ? '#ff4d4f' : vps.expiring ? '#faad14' : '#52c41a'}
                              trailColor='#1f1f1f'
                              showInfo={false}
                              style={{ width: 50, marginRight: 8 }}
                            />
                            {vps.expired
                              ? <Tag color='red'>过期{vps.days === 0 ? '今天' : Math.abs(vps.days) + '天'}</Tag>
                              : vps.expiring
                                ? <Tag color='orange'>{vps.days}天</Tag>
                                : <span style={{ color: '#52c41a', fontSize: 12 }}>{vps.days}天</span>}
                          </div>
                          )
                        : <span style={{ color: '#555' }}>--</span>}
                    </td>
                    <td>{vps.vpsPrice || '--'}</td>
                    <td>{vps.vpsTraffic || '--'}</td>
                    <td>{vps.vpsRecharge || '--'}</td>
                    <td>
                      {vps.vpsXrayPanel
                        ? (
                          <Tooltip title='打开 XXUI 面板'>
                            <LinkOutlined
                              style={{ color: '#555', cursor: 'pointer', fontSize: 14 }}
                              onClick={() => window.openLink(vps.vpsXrayPanel, '_blank')}
                            />
                          </Tooltip>
                          )
                        : <span style={{ color: '#333' }}>--</span>}
                    </td>
                    <td>
                      <span style={{ display: 'inline-flex', gap: 8 }}>
                        {vps.vpsUrl && (
                          <Tooltip title='打开管理面板'>
                            <LinkOutlined
                              style={{ color: '#555', cursor: 'pointer', fontSize: 14 }}
                              onClick={() => window.openLink(vps.vpsUrl, '_blank')}
                            />
                          </Tooltip>
                        )}
                        <Tooltip title='复制登录信息给 Claude'>
                          <CopyOutlined
                            style={{ color: '#888', cursor: 'pointer', fontSize: 14 }}
                            onClick={(e) => {
                              e.stopPropagation()
                              const bm = all.find(b => b.id === vps.id) || {}
                              const txt = [
                              `主机: ${bm.host || ''}`,
                              `端口: ${bm.port || 22}`,
                              `用户名: ${bm.username || 'root'}`,
                              `密码: ${bm.password || ''}`,
                              `认证方式: ${bm.authType || 'password'}`
                              ].join('\n')
                              clipboardCopy(txt)
                            }}
                          />
                        </Tooltip>
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          )}
    </Modal>
  )
}
