import {
  Form,
  Input,
  Button,
  AutoComplete,
  Alert,
  Space,
  Select
} from 'antd'
import { useEffect, useState } from 'react'
import Link from '../common/external-link'
import AiCache from './ai-cache'
import {
  aiConfigWikiLink
} from '../../common/constants'
import Password from '../common/password'
import AiHistory, { addHistoryItem } from './ai-history'
import message from '../common/message'
import { clearAgentMemories, getAgentMemories } from './agent'

const STORAGE_KEY_CONFIG = 'ai_config_history'
const EVENT_NAME_CONFIG = 'ai-config-history-update'

const e = window.translate

// AI 平台预设
const AI_PLATFORMS = [
  { label: '🔵 DeepSeek (首选)', value: 'deepseek', url: 'https://api.deepseek.com', path: '/chat/completions', model: 'deepseek-chat', key: '' },
  { label: '🟢 OpenAI', value: 'openai', url: 'https://api.openai.com', path: '/v1/chat/completions', model: 'gpt-4o', key: '' },
  { label: '🟣 Anthropic Claude', value: 'claude', url: 'https://api.anthropic.com', path: '/v1/messages', model: 'claude-sonnet-4-20250514', key: '' },
  { label: '🟠 阿里通义千问', value: 'qwen', url: 'https://dashscope.aliyuncs.com/compatible-mode', path: '/v1/chat/completions', model: 'qwen-plus', key: '' },
  { label: '🔴 百度文心一言', value: 'ernie', url: 'https://qianfan.baidubce.com', path: '/v2/chat/completions', model: 'ernie-4.0-8k', key: '' },
  { label: '⚪ 智谱 GLM', value: 'glm', url: 'https://open.bigmodel.cn/api/paas', path: '/v4/chat/completions', model: 'glm-4-flash', key: '' },
  { label: '🟡 月之暗面 Kimi', value: 'moonshot', url: 'https://api.moonshot.cn', path: '/v1/chat/completions', model: 'moonshot-v1-8k', key: '' },
  { label: '⚫ 自定义', value: 'custom', url: '', path: '/chat/completions', model: '', key: '' }
]

const defaultRoles = [
  { value: '你是终端运维专家，根据用户需求提供准确的命令行指令，简要解释用法，用中文回复，使用markdown格式。' },
  { value: 'You are a terminal expert. Provide accurate commands, explain briefly in Chinese, use markdown.' }
]

const proxyOptions = [
  { value: 'socks5://127.0.0.1:1080' },
  { value: 'http://127.0.0.1:8080' },
  { value: 'https://proxy.example.com:3128' }
]

export default function AIConfigForm ({ initialValues, onSubmit, showAIConfig }) {
  const [form] = Form.useForm()
  const [testing, setTesting] = useState(false)
  const baseURLAI = Form.useWatch('baseURLAI', form)

  useEffect(() => {
    if (initialValues) {
      form.setFieldsValue(initialValues)
    }
  }, [initialValues])

  function filter () {
    return true
  }

  const handleSubmit = async (values) => {
    onSubmit(values)
    addHistoryItem(STORAGE_KEY_CONFIG, values, EVENT_NAME_CONFIG)
  }

  const handleTest = async () => {
    try {
      const values = await form.validateFields()
      setTesting(true)
      const res = await window.pre.runGlobalAsync(
        'AIchat',
        'Hi',
        values.modelAI,
        values.roleAI,
        values.baseURLAI,
        values.apiPathAI,
        values.apiKeyAI,
        values.proxyAI,
        false
      )
      if (res && res.error) {
        message.error(res.error)
      } else if (res && res.response) {
        message.success('AI config works!')
      } else {
        message.error('Unexpected response from AI API')
      }
    } catch (e) {
      if (e.message) {
        message.error(e.message)
      }
    } finally {
      setTesting(false)
    }
  }

  function handleSelectHistory (item) {
    if (item && typeof item === 'object') {
      form.setFieldsValue(item)
    }
  }

  function renderHistoryItem (item) {
    if (!item || typeof item !== 'object') return { label: 'Unknown', title: 'Unknown' }
    const model = item.modelAI || 'Default Model'
    const rolePrefix = item.roleAI ? item.roleAI.substring(0, 15) + '...' : ''
    const label = `[${model}] ${rolePrefix}`
    const title = `Model: ${item.modelAI}\nRole: ${item.roleAI}\nURL: ${item.baseURLAI}`
    return { label, title }
  }

  function renderApiUrlLabel () {
    if (baseURLAI === 'https://api.atlascloud.ai/v1') {
      return <span>API URL (<Link to='https://atlascloud.ai'>AtlasCloud</Link>)</span>
    }
    return 'API URL'
  }

  if (!showAIConfig) {
    return null
  }
  const defaultLangs = window.store.getLangNames().map(l => ({ value: l }))
  return (
    <>
      <Alert
        title={
          <Link to={aiConfigWikiLink}>WIKI: {aiConfigWikiLink}</Link>
        }
        type='info'
        className='mg2y'
      />
      <p>
        Full Url: {initialValues?.baseURLAI}{initialValues?.apiPathAI}
      </p>
      <Form
        form={form}
        onFinish={handleSubmit}
        initialValues={initialValues}
        layout='vertical'
        className='ai-config-form'
      >
        <Form.Item label='AI 平台'>
          <Select
            placeholder='选择 AI 平台自动填充配置'
            options={AI_PLATFORMS}
            onChange={(val) => {
              const p = AI_PLATFORMS.find(p => p.value === val)
              if (p && p.value !== 'custom') {
                form.setFieldsValue({
                  baseURLAI: p.url,
                  apiPathAI: p.path,
                  modelAI: p.model
                })
              }
            }}
          />
        </Form.Item>
        <Form.Item label={renderApiUrlLabel()} required>
          <Space.Compact className='width-100'>
            <Form.Item
              label='API URL'
              name='baseURLAI'
              noStyle
              rules={[
                { required: true, message: '请输入 API 地址' },
                { type: 'url', message: '请输入有效 URL' }
              ]}
            >
              <Input
                placeholder='https://api.deepseek.com'
                style={{ width: '75%' }}
              />
            </Form.Item>
            <Form.Item
              label='API PATH'
              name='apiPathAI'
              rules={[
                { required: true, message: '请输入 API 路径' }
              ]}
              noStyle
            >
              <Input
                placeholder='/chat/completions'
                style={{ width: '25%' }}
              />
            </Form.Item>
          </Space.Compact>
        </Form.Item>
        <Form.Item
          label={e('modelAi')}
          name='modelAI'
          rules={[{ required: true, message: 'Please input or select a model!' }]}
        >
          <Input
            placeholder='Enter or select AI model'
          />
        </Form.Item>

        <Form.Item
          label='API Key'
          name='apiKeyAI'
        >
          <Password placeholder='Enter your API key' />
        </Form.Item>

        <Form.Item
          label={e('roleAI')}
          name='roleAI'
          rules={[{ required: true, message: 'Please input the AI role!' }]}
        >
          <AutoComplete options={defaultRoles} placement='topLeft'>
            <Input.TextArea
              placeholder='AI 角色/系统提示词'
              rows={1}
            />
          </AutoComplete>
        </Form.Item>

        <Form.Item
          label='Agent 提示词'
          name='agentSystemPrompt'
          tooltip='自定义 Agent 模式的系统提示词。留空使用内置默认。修改后保存即生效。'
        >
          <Input.TextArea
            placeholder='留空使用内置默认提示词。可在此自定义 Agent 的行为规则和工作流程...'
            rows={4}
          />
        </Form.Item>

        <Form.Item label='Agent 记忆'>
          <Space>
            <span style={{ color: '#888', fontSize: 12 }}>
              已积累 {getAgentMemories().length} 条经验。Agent 完成任务后会自动总结学习。
            </span>
            <Button size='small' danger onClick={() => { clearAgentMemories(); message.success('记忆已清除') }}>
              清除记忆
            </Button>
          </Space>
        </Form.Item>

        <Form.Item
          label={e('language')}
          name='languageAI'
          rules={[{ required: true, message: 'Please input language' }]}
        >
          <AutoComplete options={defaultLangs} placement='topLeft'>
            <Input
              placeholder={e('language')}
            />
          </AutoComplete>
        </Form.Item>

        <Form.Item
          label={e('proxy')}
          name='proxyAI'
          tooltip='Proxy for AI API requests (e.g., socks5://127.0.0.1:1080)'
        >
          <AutoComplete
            options={proxyOptions}
            filterOption={filter}
            allowClear
          >
            <Input placeholder='Enter proxy URL (optional)' />
          </AutoComplete>
        </Form.Item>

        <Form.Item>
          <Space>
            <Button type='primary' htmlType='submit'>
              {e('save')}
            </Button>
            <Button
              loading={testing}
              onClick={handleTest}
            >
              {e('testConnection')}
            </Button>
          </Space>
        </Form.Item>
      </Form>
      <AiHistory
        storageKey={STORAGE_KEY_CONFIG}
        eventName={EVENT_NAME_CONFIG}
        onSelect={handleSelectHistory}
        renderItem={renderHistoryItem}
      />
      <AiCache />
    </>
  )
}
