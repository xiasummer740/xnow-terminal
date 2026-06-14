/**
 * 实时监控页签 — Netdata 数据源
 */
import { useState, useCallback, useEffect } from 'react'
import { Segmented, Empty, Button, Modal, Checkbox, message, Space, Tag, Alert } from 'antd'
import { TableOutlined, AppstoreOutlined, SettingOutlined, CloudUploadOutlined, ReloadOutlined } from '@ant-design/icons'
import { getAllServers } from '../../common/netdata-api'
import copy from 'json-deep-copy'

const viewOptions = [
  { label: <><TableOutlined /> 表格</>, value: 'table' },
  { label: <><AppstoreOutlined /> 卡片</>, value: 'card' }
]

export default function TabMonitor({ onClose }) {
  const [view, setView] = useState('table')
  const [servers, setServers] = useState([])
  const [loading, setLoading] = useState(false)
  const { store } = window

  // 有 SSH 信息的书签作为可监控服务器
  const allHosts = (store.bookmarks || []).filter(b => b.host && b.username)

  const loadData = useCallback(async () => {
    if (!allHosts.length) return
    setLoading(true)
    const results = await getAllServers(allHosts.map(b => b.host))
    setServers(results.map((r, i) => ({ ...r, ...allHosts[i], key: allHosts[i].id })))
    setLoading(false)
  }, [allHosts])

  useEffect(() => { loadData() }, [loadData])

  // Agent 部署
  const [selectOpen, setSelectOpen] = useState(false)
  const [checkedIds, setCheckedIds] = useState([])

  const handleDeploy = async () => {
    const selected = allHosts.filter(b => checkedIds.includes(b.id))
    if (!selected.length) return
    setSelectOpen(false)
    let ok = 0, fail = 0
    for (const bm of selected) {
      const name = bm.title || bm.host
      try {
        const cmd = `wget -O /tmp/netdata.sh https://my-netdata.io/kickstart.sh && bash /tmp/netdata.sh --stable-channel --disable-telemetry 2>&1`
        await window.pre.runGlobalAsync('execSshCommand', {
          host: bm.host, port: bm.port || 22,
          username: bm.username || 'root',
          password: bm.password, privateKey: bm.privateKey,
          command: cmd, timeout: 180000
        })
        ok++
      } catch (e) {
        fail++
      }
    }
    message.success(`${ok} 台成功${fail ? `，${fail} 台失败` : ''}`, 5)
    setTimeout(loadData, 5000)
  }

  if (!allHosts.length) {
    return <Empty style={{ padding: 60 }} description="没有可监控的服务器，请先在书签中添加" />
  }

  if (view === 'card') {
    return (
      <div>
        <Toolbar hosts={allHosts} loading={loading} onRefresh={loadData}
          onDeploy={() => { setCheckedIds([]); setSelectOpen(true) }} view={view} onViewChange={setView} />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 12 }}>
          {servers.map(s => (
            <div key={s.id} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ color: '#e0e0e0', fontWeight: 600 }}>{s.title || s.host}</span>
                <Tag color={s.online ? 'green' : 'red'}>{s.online ? '在线' : '离线'}</Tag>
              </div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 8, fontFamily: 'monospace' }}>{s.host}</div>
              {s.online ? (
                <>
                  <div style={{ fontSize: 11, color: '#999' }}>CPU: <span style={{ color: '#e0e0e0' }}>{(s.cpu || 0).toFixed(1)}%</span></div>
                  <div style={{ fontSize: 11, color: '#999' }}>内存: <span style={{ color: '#e0e0e0' }}>{s.memory}</span></div>
                  <div style={{ fontSize: 11, color: '#999' }}>磁盘: <span style={{ color: '#e0e0e0' }}>{s.disk}</span></div>
                </>
              ) : <div style={{ color: '#666', fontSize: 12 }}>未安装 Netdata</div>}
            </div>
          ))}
        </div>
        <SelectModal open={selectOpen} hosts={allHosts} checked={checkedIds}
          onChange={setCheckedIds} onOk={handleDeploy} onCancel={() => setSelectOpen(false)} />
      </div>
    )
  }

  return (
    <div>
      <Toolbar hosts={allHosts} loading={loading} onRefresh={loadData}
        onDeploy={() => { setCheckedIds([]); setSelectOpen(true) }} view={view} onViewChange={setView} />
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ color: '#888', fontSize: 11, textAlign: 'left' }}>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>状态</th>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>服务器</th>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>IP</th>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>CPU</th>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>内存</th>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>磁盘</th>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>Netdata</th>
          </tr>
        </thead>
        <tbody>
          {servers.map(s => (
            <tr key={s.id} style={{ borderBottom: '1px solid #1a1a1a' }}>
              <td style={{ padding: '10px 12px' }}>
                <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%',
                  background: s.online ? '#52c41a' : '#ff4d4f' }} />
              </td>
              <td style={{ padding: '10px 12px', color: '#e0e0e0', fontWeight: 500 }}>{s.title || s.host}</td>
              <td style={{ padding: '10px 12px', color: '#999', fontFamily: 'monospace', fontSize: 12 }}>{s.host}</td>
              <td style={{ padding: '10px 12px' }}>{s.online ? `${(s.cpu || 0).toFixed(1)}%` : '--'}</td>
              <td style={{ padding: '10px 12px' }}>{s.online ? s.memory : '--'}</td>
              <td style={{ padding: '10px 12px' }}>{s.online ? s.disk : '--'}</td>
              <td style={{ padding: '10px 12px' }}>
                {s.online
                  ? <Tag color="green">在线</Tag>
                  : <Tag color="red">未安装</Tag>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <SelectModal open={selectOpen} hosts={allHosts} checked={checkedIds}
        onChange={setCheckedIds} onOk={handleDeploy} onCancel={() => setSelectOpen(false)} />
    </div>
  )
}

function Toolbar ({ hosts, loading, onRefresh, onDeploy, view, onViewChange }) {
  return (
    <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
      <Space>
        <Button icon={<CloudUploadOutlined />} onClick={onDeploy}>部署 Netdata</Button>
        <Button icon={<ReloadOutlined />} onClick={onRefresh} loading={loading}>刷新</Button>
      </Space>
      <Segmented value={view} onChange={onViewChange}
        options={[{ label: <><TableOutlined /> 表格</>, value: 'table' }, { label: <><AppstoreOutlined /> 卡片</>, value: 'card' }]}
        style={{ background: '#1a1a1a' }} />
    </div>
  )
}

function SelectModal ({ open, hosts, checked, onChange, onOk, onCancel }) {
  return (
    <Modal title="选择要部署 Netdata 的服务器" open={open} onOk={onOk} onCancel={onCancel}
      okText="开始部署" width={520}
      styles={{ content: { background: '#1a1a1a', borderRadius: 8 }, header: { background: 'transparent', borderBottom: '1px solid #222' } }}>
      {hosts.map(b => (
        <div key={b.id} onClick={() => onChange(checked.includes(b.id) ? checked.filter(id => id !== b.id) : [...checked, b.id])}
          style={{ display: 'flex', alignItems: 'center', padding: '10px 12px', margin: '4px 0',
            background: '#1f1f1f', border: '1px solid #333', borderRadius: 6, cursor: 'pointer' }}>
          <input type="checkbox" checked={checked.includes(b.id)} readOnly style={{ marginRight: 12 }} />
          <div style={{ flex: 1 }}>
            <div style={{ color: '#e0e0e0', fontWeight: 500 }}>{b.title || '未命名'}</div>
            <div style={{ color: '#888', fontSize: 12, fontFamily: 'monospace' }}>{b.host}</div>
          </div>
        </div>
      ))}
    </Modal>
  )
}
