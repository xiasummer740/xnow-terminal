/**
 * 哪吒监控配置面板
 */
import { useState } from 'react'
import { Button, Input, message, Select, Space, Divider, Alert } from 'antd'
import { CloudServerOutlined, ApiOutlined, LinkOutlined } from '@ant-design/icons'
import { testConnection } from '../../common/nezha-api'

export default function TabNezha () {
  const { store } = window
  const nezhaCfg = store.config.nezha || {}
  const [dashboardUrl, setDashboardUrl] = useState(nezhaCfg.dashboardUrl || '')
  const [apiToken, setApiToken] = useState(nezhaCfg.apiToken || '')
  const [masterId, setMasterId] = useState(nezhaCfg.masterBookmarkId || '')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState(null)

  const bookmarks = (store.bookmarks || [])
    .filter((b) => b.host)
    .map((b) => ({
      label: `${b.title || b.host} (${b.host})`,
      value: b.id
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

  const handleSave = () => {
    store.setConfig({
      nezha: {
        dashboardUrl,
        apiToken,
        masterBookmarkId: masterId
      }
    })
    message.success('配置已保存')
  }

  return (
    <div className='tab-nezha' style={{ padding: '0 16px' }}>
      {/* 部署主控 */}
      <div style={{ marginBottom: 24 }}>
        <h4 style={{ color: '#e0e0e0', marginBottom: 12 }}>
          <CloudServerOutlined style={{ marginRight: 8 }} />
          部署主控
        </h4>
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>选择主控服务器</div>
          <Select
            placeholder='选择一台 VPS 作为 XNOW 监控主控'
            style={{ width: '100%' }}
            value={masterId || undefined}
            onChange={setMasterId}
            options={bookmarks}
            allowClear
          />
        </div>
        <Button
          type='primary'
          icon={<CloudServerOutlined />}
          onClick={() => message.info('部署功能将在后续阶段实现')}
        >
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
          placeholder='http://your-server:8008'
          value={dashboardUrl}
          onChange={(e) => setDashboardUrl(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>
      <div style={{ marginBottom: 12 }}>
        <div style={{ color: '#999', fontSize: 12, marginBottom: 4 }}>API Token</div>
        <Input.Password
          placeholder='nzp_xxxxxxxxxxxx'
          value={apiToken}
          onChange={(e) => setApiToken(e.target.value)}
          style={{ background: '#1a1a1a', border: '1px solid #333', color: '#ccc' }}
        />
      </div>

      <Space style={{ marginBottom: 16 }}>
        <Button type='primary' onClick={handleSave}>
          保存
        </Button>
        <Button icon={<LinkOutlined />} loading={testing} onClick={handleTest}>
          连接测试
        </Button>
      </Space>

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
            color: testResult.success ? '#52c41a' : '#ff4d4f'
          }}
        />
      )}
    </div>
  )
}
