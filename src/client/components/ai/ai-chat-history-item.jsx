import { useState, useEffect, useRef, useCallback } from 'react'
import AIOutput from './ai-output'
import AIStopIcon from './ai-stop-icon'
import AgentToolCallCard from './agent-tool-call-card'
import { runAgentLoop } from './agent'
import {
  Alert,
  Tooltip
} from 'antd'
import {
  CopyOutlined,
  CloseOutlined,
  CaretDownOutlined,
  CaretRightOutlined
} from '@ant-design/icons'
import { copy } from '../../common/clipboard'

const e = window.translate

// 请求失败时把原因写在记录上，而不是删掉记录本身
// —— AI 失败多为网络/额度这类临时问题，删记录会把用户刚打的字一起抹掉且毫无提示（ISSUES #5）
function markItemError (item, msg) {
  const list = window.store.aiChatHistory
  const index = list.findIndex(i => i.id === item.id)
  if (index === -1) {
    return
  }
  const target = list[index]
  target.error = typeof msg === 'string' ? msg : String(msg || '')
  target.pending = false
  // 换新数组引用，触发重渲染（沿用本文件既有做法）
  window.store.aiChatHistory = [...list]
}

export default function AIChatHistoryItem ({ item }) {
  const [showOutput, setShowOutput] = useState(true)
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef = useRef(false)
  const {
    prompt,
    sessionId,
    modelAI,
    roleAI,
    baseURLAI,
    apiPathAI,
    apiKeyAI,
    proxyAI,
    languageAI,
    mode,
    toolCalls
  } = item

  function toggleOutput () {
    setShowOutput(!showOutput)
  }

  function buildRole () {
    const lang = languageAI || window.store.getLangName()
    return roleAI + `;用[${lang}]回复`
  }

  const pollStreamContent = useCallback(async (sid) => {
    try {
      const streamResponse = await window.pre.runGlobalAsync('getStreamContent', sid)

      if (streamResponse && streamResponse.error) {
        if (streamResponse.error === 'Session not found') {
          return
        }
        markItemError(item, streamResponse.error)
        setIsStreaming(false)
        console.warn('[AI Stream] error:', streamResponse.error)
        return
      }

      const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
      if (index !== -1) {
        window.store.aiChatHistory[index].response = streamResponse.content || ''
        window.store.aiChatHistory = [...window.store.aiChatHistory]
      }
      setIsStreaming(streamResponse.hasMore)
      if (streamResponse.hasMore) {
        setTimeout(() => pollStreamContent(sid), 200)
      }
    } catch (error) {
      markItemError(item, error?.message || error)
      setIsStreaming(false)
      console.warn('[AI Stream] poll error:', error?.message || error)
    }
  }, [item.id])

  const startRequest = useCallback(async () => {
    // 收集最近对话历史作为上下文（最多10条非当前记录）
    const recentHistory = (window.store.aiChatHistory || [])
      .filter(h => h.id !== item.id && h.response)
      .slice(-10)

    try {
      const aiResponse = await window.pre.runGlobalAsync(
        'AIchat',
        prompt,
        modelAI,
        buildRole(),
        baseURLAI,
        apiPathAI,
        apiKeyAI,
        proxyAI,
        true,
        recentHistory
      )

      if (aiResponse && aiResponse.error) {
        markItemError(item, aiResponse.error)
        console.warn('[AI] response error:', aiResponse.error)
        return
      }

      if (aiResponse && aiResponse.isStream && aiResponse.sessionId) {
        setIsStreaming(true)
        const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
        if (index !== -1) {
          window.store.aiChatHistory[index].sessionId = aiResponse.sessionId
          window.store.aiChatHistory[index].response = aiResponse.content || ''
        }
        pollStreamContent(aiResponse.sessionId)
      } else if (aiResponse && aiResponse.response) {
        const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
        if (index !== -1) {
          window.store.aiChatHistory[index].response = aiResponse.response
        }
      }
    } catch (error) {
      markItemError(item, error?.message || error)
      console.warn('[AI] request error:', error?.message || error)
    }
  }, [prompt, modelAI, baseURLAI, apiPathAI, apiKeyAI, proxyAI, item.id, pollStreamContent])

  const startAgentRequest = useCallback(async () => {
    abortRef.current = false
    const config = {
      modelAI,
      roleAI,
      baseURLAI,
      apiPathAI,
      apiKeyAI,
      proxyAI,
      languageAI
    }
    // 收集最近对话历史作为上下文（最多10条非当前记录）
    const recentHistory = (window.store.aiChatHistory || [])
      .filter(h => h.id !== item.id && h.response)
      .slice(-10)
    await runAgentLoop(item, config, abortRef, setIsStreaming, recentHistory)
  }, [modelAI, roleAI, baseURLAI, apiPathAI, apiKeyAI, proxyAI, languageAI, item.id])

  useEffect(() => {
    if (item.pending) {
      const index = window.store.aiChatHistory.findIndex(i => i.id === item.id)
      if (index !== -1) {
        window.store.aiChatHistory[index].pending = false
      }
      if (mode === 'agent') {
        startAgentRequest()
      } else {
        startRequest()
      }
    }
  }, [])

  async function handleStop (e) {
    e.stopPropagation()
    if (mode === 'agent') {
      abortRef.current = true
      setIsStreaming(false)
      return
    }
    if (!sessionId) return

    try {
      await window.pre.runGlobalAsync('stopStream', sessionId)
      setIsStreaming(false)
    } catch (error) {
      console.error('Error stopping stream:', error)
    }
  }

  function renderStopButton () {
    if (!isStreaming) {
      return null
    }
    return (
      <AIStopIcon
        onClick={handleStop}
        title={e('Stop this AI request')}
      />
    )
  }

  const alertProps = {
    title: (
      <div className='ai-history-item-title'>
        <span className='pointer mg1r' onClick={toggleOutput}>
          {showOutput ? <CaretDownOutlined /> : <CaretRightOutlined />}
        </span>
        <span>{prompt}</span>
        {renderStopButton()}
      </div>
    ),
    type: 'info'
  }

  function handleDel (e) {
    e.stopPropagation()
    window.store.removeAiHistory(item.id)
  }

  function handleCopy () {
    copy(prompt)
  }

  function renderTitle () {
    return (
      <div>
        <p>
          <b>{e('Model:')}</b> {modelAI}
        </p>
        <p>
          <b>{e('Role:')}</b> {roleAI}
        </p>
        <p>
          <b>{e('Base URL:')}</b> {baseURLAI}
        </p>
        <p>
          <b>{e('Time:')}</b> {new Date(item.timestamp).toLocaleString()}
        </p>
        <p>
          <CopyOutlined
            className='pointer'
            onClick={handleCopy}
          />
          <CloseOutlined
            className='pointer mg1l'
            onClick={handleDel}
          />
        </p>
      </div>
    )
  }

  function renderToolCalls () {
    if (mode !== 'agent' || !toolCalls || !toolCalls.length) {
      return null
    }
    return (
      <div className='agent-tool-calls'>
        {toolCalls.map((tc) => (
          <AgentToolCallCard key={tc.id} toolCall={tc} />
        ))}
      </div>
    )
  }

  function renderError () {
    if (!item.error) {
      return null
    }
    return (
      <div className='mg1y'>
        <Alert
          type='error'
          showIcon
          title={e('AI request failed')}
          description={item.error}
        />
      </div>
    )
  }

  return (
    <div className='chat-history-item'>
      <div className='mg1y'>
        <Tooltip title={renderTitle()}>
          <Alert {...alertProps} />
        </Tooltip>
      </div>
      {renderError()}
      {renderToolCalls()}
      {showOutput && <AIOutput item={item} />}
    </div>
  )
}
