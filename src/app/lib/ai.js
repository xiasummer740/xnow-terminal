const axios = require('axios')
const { StringDecoder } = require('string_decoder')
const log = require('../common/log')
const defaultSettings = require('../common/config-default')
const { createProxyAgent } = require('./proxy-agent')

// Store for ongoing streaming sessions
const streamingSessions = new Map()

// 正在飞的非流式 AI 请求，按 runId 存 AbortController（ISSUES #20）。
// 非流式那条路径（AIchatWithTools，内置 Agent 走的就是它）以前**没有任何办法取消**：
// 界面上点「停止」只是把 abortRef.current 置 true，得等这一次 HTTP 自己回来，
// runAgentLoop 才会在下一轮开头看到这个标志。模型/网关卡住时，点了停止界面纹丝不动
// —— 这就是「AI 停不下来」。
const aiAbortControllers = new Map()

// 掐掉一次正在飞的非流式 AI 请求
exports.abortAIChat = (runId) => {
  const controller = aiAbortControllers.get(runId)
  if (!controller) {
    return { error: 'Request not found' }
  }
  controller.abort()
  aiAbortControllers.delete(runId)
  return { aborted: true }
}

// Stop an ongoing streaming session
exports.stopStream = (sessionId) => {
  const session = streamingSessions.get(sessionId)
  if (!session) {
    return { error: 'Session not found' }
  }

  // Destroy the stream to stop receiving data
  if (session.stream && !session.stream.destroyed) {
    session.stream.destroy()
  }

  // Mark as completed (not an error, just stopped by user)
  session.completed = true
  session.stopped = true

  // Clean up
  streamingSessions.delete(sessionId)

  return { stopped: true }
}

// timeout 只在调用方显式传时才设 —— 流式那些调用不传，免得把长时间的输出掐断
const createAIClient = (baseURL, apiKey, proxy, timeout) => {
  const config = {
    baseURL,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    }
  }
  if (timeout) {
    config.timeout = timeout
  }

  // Add proxy agent if proxy is provided
  const agent = proxy ? createProxyAgent(proxy) : null
  if (agent) {
    config.httpsAgent = agent
    config.proxy = false // Disable default proxy behavior when using agent
  }

  return axios.create(config)
}

// 非流式一次带工具的请求最长等多久（ISSUES #20）。
// 以前完全没设超时 = 可以无限期挂着，用户点了停止也什么都不会发生。
// 一轮带工具的对话几十秒是正常的，给 3 分钟余量。
const AI_TOOLS_TIMEOUT = 3 * 60 * 1000

// runId 由渲染层给，用来在用户点「停止」时精确掐掉这一次请求。
// 不传 runId 时行为和以前一样，只是多了超时。
exports.AIchatWithTools = async (
  messages, model, baseURL, path, apiKey, proxy, tools, runId
) => {
  const controller = new AbortController()
  if (runId) {
    // 同一个 runId 又进来（上一轮还没收干净）：把旧的收掉，别泄漏
    const prev = aiAbortControllers.get(runId)
    if (prev) {
      prev.abort()
    }
    aiAbortControllers.set(runId, controller)
  }
  try {
    const client = createAIClient(baseURL, apiKey, proxy, AI_TOOLS_TIMEOUT)
    const requestData = {
      model,
      messages,
      stream: false
    }
    if (tools && tools.length) {
      requestData.tools = tools
    }
    const response = await client.post(path, requestData, {
      signal: controller.signal
    })
    const choice = response.data.choices[0]
    return {
      message: choice.message
    }
  } catch (e) {
    // 用户主动停止：不是错误，agent 循环靠这个标志收尾，别显示成报错
    if (controller.signal.aborted) {
      log.info('AI 工具对话已被用户停止', runId)
      return { aborted: true }
    }
    log.error('AI 工具对话出错', e)
    return { error: e.message }
  } finally {
    if (runId && aiAbortControllers.get(runId) === controller) {
      aiAbortControllers.delete(runId)
    }
  }
}

exports.AIchat = async (
  prompt,
  model = defaultSettings.modelAI,
  role = defaultSettings.roleAI,
  baseURL = defaultSettings.baseURLAI,
  path = defaultSettings.apiPathAI,
  apiKey,
  proxy = defaultSettings.proxyAI,
  stream = true,
  history = []
) => {
  try {
    const client = createAIClient(baseURL, apiKey, proxy)

    // Determine if we should use streaming based on the prompt content
    // Command suggestions should not use streaming for quick response
    const isCommandSuggestion = prompt.includes('give me max 5 command suggestions')
    const useStream = stream && !isCommandSuggestion

    // 构建消息列表：系统提示 → 最近对话历史 → 当前问题
    const msgs = [
      { role: 'system', content: role }
    ]
    for (const h of history) {
      if (h.prompt) msgs.push({ role: 'user', content: h.prompt })
      if (h.response) msgs.push({ role: 'assistant', content: h.response })
    }
    msgs.push({ role: 'user', content: prompt })

    const requestData = {
      model,
      messages: msgs,
      stream: useStream
    }

    if (useStream) {
      // For streaming responses, initiate streaming and return session info
      const response = await client.post(path, requestData, {
        responseType: 'stream'
      })

      const sessionId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
      const sessionData = {
        stream: response.data,
        content: '',
        completed: false,
        error: null
      }

      streamingSessions.set(sessionId, sessionData)

      // Start processing the stream
      processStream(sessionId, sessionData)

      return {
        sessionId,
        isStream: true,
        hasMore: true,
        content: ''
      }
    } else {
      // For non-streaming responses (command suggestions and when stream=false)
      const response = await client.post(path, requestData)

      return {
        response: response.data.choices[0].message.content,
        isStream: false
      }
    }
  } catch (e) {
    log.error('AI 对话出错')
    log.error(e)
    return {
      error: e.message,
      stack: e.stack
    }
  }
}

// Function to get the current state of a streaming session
exports.getStreamContent = (sessionId) => {
  const session = streamingSessions.get(sessionId)
  if (!session) {
    return {
      error: 'Session not found'
    }
  }

  const result = {
    content: session.content,
    hasMore: !session.completed,
    isStream: true
  }

  if (session.error) {
    result.error = session.error
  }

  // Clean up completed sessions
  if (session.completed || session.error) {
    streamingSessions.delete(sessionId)
  }

  return result
}

// Process streaming data
function processStream (sessionId, sessionData) {
  let buffer = ''
  const decoder = new StringDecoder('utf8')

  const processLines = (shouldFlush = false) => {
    const lines = buffer.split('\n')
    buffer = shouldFlush ? '' : lines.pop()
    const linesToProcess = shouldFlush ? lines.filter(Boolean).concat(buffer ? [buffer] : []) : lines

    for (const line of linesToProcess) {
      if (line.trim() === '') continue
      if (line.trim() === 'data: [DONE]') {
        sessionData.completed = true
        return
      }

      if (line.startsWith('data: ')) {
        try {
          const data = JSON.parse(line.slice(6))
          if (data.choices && data.choices[0] && data.choices[0].delta && data.choices[0].delta.content) {
            sessionData.content += data.choices[0].delta.content
          }
        } catch (e) {
          log.error('解析流数据出错：', e)
        }
      }
    }
  }

  sessionData.stream.on('data', (chunk) => {
    buffer += decoder.write(chunk)
    processLines()
  })

  sessionData.stream.on('end', () => {
    buffer += decoder.end()
    processLines(true)
    sessionData.completed = true
  })

  sessionData.stream.on('error', (error) => {
    sessionData.error = error.message
    sessionData.completed = true
  })
}
