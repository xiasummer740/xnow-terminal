import { Button, Input, Divider, Tag } from 'antd'
import {
  ThunderboltOutlined,
  CodeOutlined,
  LockOutlined,
  SendOutlined,
  DesktopOutlined,
  ApiOutlined
} from '@ant-design/icons'
import { useState, useRef } from 'react'
import message from '../common/message'
import InputAutoFocus from '../common/input-auto-focus'
import { packInfo, logoPath } from '../../common/constants'
import './no-session.styl'

function connectWithOptions (opts, batch) {
  const { store } = window
  const tabOptions = { ...opts, from: 'quickConnect', batch }
  delete window.openTabBatch
  store.addTab(tabOptions)
}

// 快速连接类型模板
const QUICK_TEMPLATES = [
  { icon: <CodeOutlined />, label: 'SSH 远程', type: 'ssh' },
  { icon: <LockOutlined />, label: 'Telnet', type: 'telnet' },
  { icon: <DesktopOutlined />, label: 'RDP 桌面', type: 'rdp' },
  { icon: <ApiOutlined />, label: '串口', type: 'serial' },
  { icon: <SendOutlined />, label: 'VNC 桌面', type: 'vnc' }
]

export default function NoSessionPanel ({ height }) {
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef(null)

  const handleConnect = () => {
    const val = inputValue.trim()
    if (!val) return
    const opts = window.store.parseQuickConnect(val)
    if (!opts) {
      return message.error('连接格式错误，请检查输入', 10)
    }
    connectWithOptions(opts, 0)
    setInputValue('')
  }

  const handleQuickTemplate = (template) => {
    window.store.onNewSshWithType(template.type)
  }

  return (
    <div className='no-sessions' style={{ height: height + 'px' }}>
      <div className='no-session-inner'>
        {/* 品牌区 */}
        <div className='no-session-brand'>
          <div className='no-session-logo'>
            <img src={logoPath} className='no-session-logo-img' />
          </div>
          <h2 className='no-session-title'>XNOW Terminal{window.et.isDev ? ' 开发版' : ''}</h2>
          <Tag className='no-session-version' color='#08c'>{packInfo.version}</Tag>
          <p className='no-session-subtitle'>连接和管理你的远程服务器</p>
        </div>

        {/* 快速连接输入 */}
        <div className='no-session-quick-connect'>
          <div className='no-session-input-row'>
            <InputAutoFocus
              ref={inputRef}
              value={inputValue}
              onChange={e => setInputValue(e.target.value)}
              onPressEnter={handleConnect}
              className='no-session-input'
              placeholder='ssh/rdp/vnc/telnet://用户名@主机地址:端口'
              prefix={<ThunderboltOutlined style={{ color: 'var(--text-dark)' }} />}
              suffix={
                <Button
                  type='primary'
                  size='small'
                  onClick={handleConnect}
                  disabled={!inputValue.trim()}
                >
                  连接
                </Button>
              }
            />
          </div>
          <div className='no-session-hint'>示例：root@192.168.1.100:22 或 ssh://user@host</div>
        </div>

        <Divider plain style={{ color: 'var(--text-dark)', borderColor: 'var(--border)' }}>
          快速创建连接
        </Divider>

        {/* 快速模板按钮 */}
        <div className='no-session-templates'>
          {QUICK_TEMPLATES.map(t => (
            <Button
              key={t.type}
              className='no-session-template-btn'
              icon={t.icon}
              onClick={() => handleQuickTemplate(t)}
            >
              {t.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  )
}
