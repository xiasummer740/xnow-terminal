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

  const [selectOpen, setSelectOpen] = useState(false)
  const [checkedIds, setCheckedIds] = useState([])
  const [deployLog, setDeployLog] = useState('')
  const [deploying, setDeploying] = useState(false)

  const handleDeploy = async () => {
    const selected = allHosts.filter(b => checkedIds.includes(b.id))
    if (!selected.length) return
    setSelectOpen(false)
    setDeploying(true)
    setDeployLog('')
    let ok = 0, fail = 0
    const logs = []
    for (const bm of selected) {
      const name = bm.title || bm.host
      logs.push(`\n>>> ${name} (${bm.host}) 开始部署...`)
      setDeployLog(logs.join('\n'))
      const stepCmd = [
        `echo 'STEP:download'`,
        `curl -sL https://my-netdata.io/kickstart.sh -o /tmp/netdata.sh 2>&1`,
        `echo 'STEP:install'`,
        `bash /tmp/netdata.sh --stable-channel --disable-telemetry 2>&1`,
        `echo 'STEP:config'`,
        `sed -i 's/^.*bind.*IP.*=.*$/bind socket to IP = 0.0.0.0/' /etc/netdata/netdata.conf 2>/dev/null; true`,
        `which ufw >/dev/null && ufw allow 19999/tcp 2>/dev/null; true`,
        `echo 'STEP:restart'`,
        `systemctl restart netdata 2>/dev/null || service netdata restart 2>/dev/null; true`,
        `sleep 3`,
        `curl -s --max-time 5 http://127.0.0.1:19999/api/v1/info >/dev/null 2>&1 && echo 'RESULT:OK' || echo 'RESULT:FAIL'`
      ].join(' && ')
      try {
        const r = await window.pre.runGlobalAsync('execSshCommand', {
          host: bm.host, port: bm.port || 22,
          username: bm.username || 'root',
          password: bm.password, privateKey: bm.privateKey,
          command: stepCmd, timeout: 300000
        })
        if (r?.includes('RESULT:OK')) { ok++; logs.push(`✅ ${name} 部署成功`) }
        else { fail++; logs.push(`❌ ${name} 部署失败`) }
      } catch (e) { fail++; logs.push(`❌ ${name}: ${e.message}`) }
      setDeployLog(logs.join('\n'))
    }
    setDeploying(false)
    logs.push(`\n📊 ${ok} 台成功${fail ? `，${fail} 台失败` : ''}`)
    setDeployLog(logs.join('\n'))
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
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
          {servers.map(s => (
            <div key={s.id} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                <span style={{ color: '#e0e0e0', fontWeight: 600, fontSize: 13 }}>{s.title || s.host}</span>
                <Tag color={s.online ? 'green' : 'red'} style={{ margin: 0 }}>{s.online ? '在线' : '离线'}</Tag>
              </div>
              <div style={{ fontSize: 11, color: '#666', marginBottom: 10, fontFamily: 'monospace' }}>{s.host}</div>
              {s.online ? (
                <div style={{ display: 'grid', gap: 8 }}>
                  <MiniGauge label="CPU" value={`${s.cpu || 0}%`} pct={s.cpu || 0} color={s.cpu > 80 ? '#ff4d4f' : s.cpu > 50 ? '#faad14' : '#1890ff'} />
                  <MiniGauge label="内存" value={`${s.memPct || 0}%`} pct={s.memPct || 0} color={s.memPct > 80 ? '#ff4d4f' : s.memPct > 50 ? '#faad14' : '#52c41a'} />
                  <MiniGauge label="磁盘" value={`${s.diskPct || 0}%`} pct={s.diskPct || 0} color={s.diskPct > 80 ? '#ff4d4f' : s.diskPct > 50 ? '#faad14' : '#52c41a'} />
                </div>
              ) : <div style={{ color: '#555', fontSize: 12, textAlign: 'center', padding: 20 }}>未安装 Netdata</div>}
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
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>上行</th>
            <th style={{ padding: '8px 12px', borderBottom: '1px solid #222' }}>下行</th>
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
              <td style={{ padding: '10px 12px' }}>{s.online ? `${s.memPct || 0}%` : '--'}</td>
              <td style={{ padding: '10px 12px' }}>{s.online ? `${s.diskPct || 0}%` : '--'}</td>
              <td style={{ padding: '10px 12px', fontSize: 12, color: '#999' }}>{s.online ? s.netOut || '--' : '--'}</td>
              <td style={{ padding: '10px 12px', fontSize: 12, color: '#999' }}>{s.online ? s.netIn || '--' : '--'}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SelectModal open={selectOpen} hosts={allHosts} checked={checkedIds}
        onChange={setCheckedIds} onOk={handleDeploy} onCancel={() => setSelectOpen(false)} />

      {deployLog && (
        <Alert
          type={deploying ? 'info' : deployLog.includes('❌') ? 'warning' : 'success'}
          message={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 12, color: '#0f0', fontFamily: "'Maple Mono', monospace", maxHeight: 300, overflow: 'auto' }}>{deployLog}</pre>}
          showIcon={false}
          closable={!deploying}
          onClose={() => setDeployLog('')}
          style={{ marginTop: 12, background: '#0a0a0a', border: '1px solid #333' }}
        />
      )}
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

function MiniGauge({ label, value, pct, color }) {
  const r = 28
  const circumference = 2 * Math.PI * r
  const offset = circumference * (1 - Math.min(Math.max(pct, 0), 100) / 100)
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <svg width={64} height={64} viewBox='0 0 64 64'>
        <circle cx={32} cy={32} r={r} fill='none' stroke='#2a2a2a' strokeWidth={5} />
        <circle cx={32} cy={32} r={r} fill='none' stroke={color} strokeWidth={5} strokeLinecap='round'
          strokeDasharray={circumference} strokeDashoffset={offset}
          transform='rotate(-90 32 32)' style={{ transition: 'stroke-dashoffset 0.5s' }} />
        <text x={32} y={32} textAnchor='middle' dominantBaseline='central' fill='#e0e0e0' fontSize={13} fontFamily='monospace' fontWeight='bold'>{value}</text>
      </svg>
      <div style={{ flex: 1, fontSize: 12 }}>
        <div style={{ color: '#999', marginBottom: 2 }}>{label}</div>
        <div style={{ background: '#2a2a2a', borderRadius: 4, height: 6, overflow: 'hidden' }}>
          <div style={{ width: Math.min(pct, 100) + '%', height: '100%', background: color, borderRadius: 4, transition: 'width 0.5s' }} />
        </div>
      </div>
    </div>
  )
}
