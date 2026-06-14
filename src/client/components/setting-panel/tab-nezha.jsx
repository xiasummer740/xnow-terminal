/**
 * 哪吒监控配置面板
 */
import { useState } from 'react'
import { Button, Input, message, Select, Space, Divider, Alert } from 'antd'
import { CloudServerOutlined, ApiOutlined, LinkOutlined, InfoCircleOutlined, BugOutlined } from '@ant-design/icons'
import { testConnection } from '../../common/nezha-api'
import DeployModal, { createSteps } from '../deploy/deploy-modal'
import { deployMaster, getMasterSteps } from '../deploy/deploy-master'
import copy from 'json-deep-copy'

export default function TabNezha() {
  const { store } = window
  const nezhaCfg = store.config.nezha || {}
  const [dashboardUrl, setDashboardUrl] = useState(nezhaCfg.dashboardUrl || '')
  const [apiToken, setApiToken] = useState(nezhaCfg.apiToken || '')
  const [masterId, setMasterId] = useState(nezhaCfg.masterBookmarkId || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)
  const [deployOpen, setDeployOpen] = useState(false)
  const [deploySteps, setDeploySteps] = useState(getMasterSteps())
  const [setupGuide, setSetupGuide] = useState('')

  const bookmarks = (store.bookmarks || [])
    .filter((b) => b.host)
    .map((b) => ({
      label: `${b.title || b.host} (${b.host})`,
      value: b.id,
    }))

  const handleTest = async () => {
    if (!dashboardUrl || !apiToken) {
      message.warning('请先填写 Dashboard 地址和 API Token')
      return
    }
    setTesting(true)
    setTestResult(null)
    const result = await testConnection(dashboardUrl, apiToken)
    setTesting(false)
    setTestResult(result)
    if (result.success) {
      message.success(`连接成功！发现 ${(result.data || []).length} 台服务器`)
    } else {
      message.error('连接失败: ' + (result.error || '未知错误'))
    }
  }

  const handleDeployMaster = async () => {
    if (!masterId) {
      message.warning('请先选择主控服务器')
      return
    }
    setDeploySteps(getMasterSteps())
    setDeployOpen(true)
    const bm = window.store.bookmarks.find((b) => b.id === masterId)
    if (!bm) {
      message.error('未找到该服务器书签')
      setDeployOpen(false)
      return
    }
    const result = await deployMaster(copy(bm), setDeploySteps)
    if (result.success) {
      setDashboardUrl(result.dashboardUrl)
      // 如果自动创建了 Token 则填入
      if (result.apiToken) {
        setApiToken(result.apiToken)
      }
      setSetupGuide(result.setupGuide || '')
      window.store.setConfig({
        nezha: {
          dashboardUrl: result.dashboardUrl,
          apiToken: result.apiToken || '',
          masterBookmarkId: masterId,
        },
      })
      message.success('✅ 主控部署成功！')
    } else {
      message.error('❌ 部署失败：' + (result.error || '未知错误'))
    }
  }

  const handleSave = () => {
    store.setConfig({
      nezha: {
        dashboardUrl,
        apiToken,
        masterBookmarkId: masterId,
      },
    })
    message.success('配置已保存')
  }

  const [diagResult, setDiagResult] = useState('')
  const [diaging, setDiaging] = useState(false)

  const handleDiagnose = async () => {
    if (!masterId) { message.warning('请先选择主控服务器'); return }
    setDiaging(true)
    setDiagResult('正在诊断...')
    const bm = window.store.bookmarks.find(b => b.id === masterId)
    if (!bm) { setDiagResult('未找到服务器书签'); setDiaging(false); return }
    try {
      const cmds = [
        `echo '=== Dashboard 安装目录 ==='`,
        `ls -la /opt/nezha/dashboard/ 2>/dev/null || echo '目录不存在'`,
        `echo ''`,
        `echo '=== Dashboard 程序 ==='`,
        `ls -la /opt/nezha/dashboard/app 2>/dev/null && /opt/nezha/dashboard/app --version 2>&1 || echo '程序不存在或不可执行'`,
        `echo ''`,
        `echo '=== 配置文件 ==='`,
        `cat /opt/nezha/dashboard/data/config.yaml 2>/dev/null || echo '配置文件不存在'`,
        `echo ''`,
        `echo '=== systemd 服务状态 ==='`,
        `systemctl status nezha-dashboard 2>&1 | head -20`,
        `echo ''`,
        `echo '=== 服务日志(最近15行) ==='`,
        `journalctl -u nezha-dashboard --no-pager -n 15 2>/dev/null || echo '日志不可用'`,
        `echo ''`,
        `echo '=== 端口监听 ==='`,
        `ss -tlnp 2>/dev/null | grep 8008 || netstat -tlnp 2>/dev/null | grep 8008 || echo '8008端口未监听'`,
        `echo ''`,
        `echo '=== 防火墙 ==='`,
        `(which ufw >/dev/null && ufw status | head -15) || echo 'ufw未安装'`
      ].join('\n')
      const result = await window.pre.runGlobalAsync('execSshCommand', {
        host: bm.host, port: bm.port || 22,
        username: bm.username || 'root',
        password: bm.password, privateKey: bm.privateKey,
        command: cmds, timeout: 15000
      })
      setDiagResult(result || '无返回数据')
    } catch (e) {
      setDiagResult('诊断失败: ' + e.message)
    } finally {
      setDiaging(false)
    }
  }

  return (
    <div className="tab-nezha" style={{ padding: '0 16px' }}>
      {/* 部署主控 */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#e0e0e0', marginBottom: 12 }}>
          <CloudServerOutlined style={{ marginRight: 8 }} />
          部署主控
        </h4>
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>选择主控服务器</div>
          <Select
            placeholder="选择一台 VPS 作为 XNOW 监控主控"
            style={{ width: '100%' }}
            value={masterId || undefined}
            onChange={setMasterId}
            options={bookmarks}
            allowClear
          />
        </div>
        <Button type="primary" icon={<CloudServerOutlined />} onClick={handleDeployMaster}>
          一键部署主控
        </Button>
        <div style={{ color: '#666', fontSize: 11, marginTop: 6 }}>
          将在选择的服务器上自动安装 Docker + 监控 Dashboard，完成后自动回填配置
        </div>
      </div>

      <Divider style={{ borderColor: '#333' }} />

      {/* 连接配置 */}
      <h4 style={{ color: '#e0e0e0', marginBottom: 12 }}>
        <ApiOutlined style={{ marginRight: 8 }} />
        连接配置（部署后自动回填，也可手动填写）
      </h4>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>Dashboard 地址</div>
        <Input
          placeholder="http://your-server:8008"
          value={dashboardUrl}
          onChange={(e) => setDashboardUrl(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>API Token</div>
        <Input.Password
          placeholder="nzp_xxxxxxxxxxxx"
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" onClick={handleSave}>
          保存
        </Button>
        <Button icon={<LinkOutlined />} loading={testing} onClick={handleTest}>
          连接测试
        </Button>
        <Button icon={<BugOutlined />} loading={diaging} onClick={handleDiagnose}>
          诊断服务器
        </Button>
      </Space>

      {diagResult && (
        <Alert
          type="info"
          message={<pre style={{ margin: 0, whiteSpace: 'pre-wrap', fontSize: 11, color: '#0f0', fontFamily: "'Maple Mono', monospace" }}>{diagResult}</pre>}
          showIcon={false}
          style={{ background: '#0a0a0a', border: '1px solid #333', marginBottom: 16, maxHeight: 300, overflow: 'auto' }}
        />
      )}

      {setupGuide && (
        <Alert
          type="info"
          message={setupGuide}
          showIcon
          icon={<InfoCircleOutlined />}
          style={{
            background: '#1a1a1a',
            border: '1px solid #1890ff',
            color: '#ccc',
            marginBottom: 16,
            whiteSpace: 'pre-line'
          }}
        />
      )}
      {testResult && (
        <Alert
          type={testResult.success ? 'success' : 'error'}
          message={
            testResult.success
              ? `✅ 连接成功！发现 ${(testResult.data || []).length} 台服务器`
              : `❌ 连接失败：${testResult.error}`
          }
          showIcon
          style={{
            background: '#1a1a1a',
            border: `1px solid ${testResult.success ? '#52c41a' : '#ff4d4f'}`,
            color: testResult.success ? '#52c41a' : '#ff4d4f',
          }}
        />
      )}
      <DeployModal
        open={deployOpen}
        onClose={() => setDeployOpen(false)}
        onCancel={() => setDeployOpen(false)}
        steps={deploySteps}
      />
    </div>
  )
}
