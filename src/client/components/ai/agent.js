import { agentTools, executeToolCall } from './agent-tools'

const MAX_ITERATIONS = 150

function buildAgentSystemPrompt (config) {
  const lang = config.languageAI || window.store.getLangName()
  const baseRole = config.roleAI || 'You are a helpful assistant.'
  // 用户自定义提示词优先
  const customPrompt = window.store.config?.agentSystemPrompt
  if (customPrompt && customPrompt.trim()) {
    return `${baseRole}\n\n${customPrompt}\n\nReply in ${lang} language.`
  }
  // 内置默认提示词
  return `${baseRole}

You are operating inside XNOW, a terminal/SSH/SFTP client. You have access to tools that let you:
- Run commands in terminal tabs and read their output
- Open new terminal tabs (local or SSH)
- Manage bookmarks (create, list, open connections)
- Switch between tabs
- Transfer files via SFTP (upload, download, list, read, delete remote files)

## 核心原则
1. 不盲猜 — 先用工具获取真实信息，再分析和操作。不确定时先 list_bookmarks 查看有哪些服务器可用
2. 证据先于断言 — 执行命令后必须查看输出验证结果，确认成功才继续
3. 简洁高效 — 用最少命令完成任务，不重复执行已确认的步骤
4. 安全第一 — 删除文件、修改系统配置前必须确认。rm -rf 等危险命令需特别谨慎

## 工作流程
- 用户说"检查所有服务器" → 先用 list_bookmarks 列出所有书签，再用 open_bookmark 逐个连接，每个执行相关检查命令
- 用户说"帮我装个东西" → 先确认系统类型（cat /etc/os-release），再选择正确包管理器
- 用户说"看日志" → 先定位日志文件位置，再用 tail/less 查看，不要直接 cat 大文件
- 遇到错误 → 先读错误信息，分析根因，再提出修复方案，不盲目重试

## 工具使用指南
- send_terminal_command — 执行命令并等待输出（30秒超时）。适合短命令如 free -h、ls、cat
- get_terminal_output — 读取终端当前显示的内容，适合查看已有输出
- list_bookmarks + open_bookmark — 管理多台服务器的首选方式。每打开一个连接，完成后用 close_tab 清理
- sftp_list / sftp_read_file — 查看远程文件，比 cat 更高效
- list_tabs — 查看当前打开了哪些连接

Reply in ${lang} language.`
}

function updateChatEntry (chatEntry, updates) {
  const index = window.store.aiChatHistory.findIndex(i => i.id === chatEntry.id)
  if (index !== -1) {
    Object.assign(window.store.aiChatHistory[index], updates)
    window.store.aiChatHistory = [...window.store.aiChatHistory]
  }
}

async function callBackendAIchatWithTools (messages, config) {
  return window.pre.runGlobalAsync(
    'AIchatWithTools',
    messages,
    config.modelAI,
    config.baseURLAI,
    config.apiPathAI,
    config.apiKeyAI,
    config.proxyAI,
    agentTools
  )
}

export async function runAgentLoop (chatEntry, config, abortRef, setIsStreaming) {
  const messages = [
    { role: 'system', content: buildAgentSystemPrompt(config) },
    { role: 'user', content: chatEntry.prompt }
  ]
  const toolCallsLog = []
  let accumulatedContent = ''

  setIsStreaming(true)
  updateChatEntry(chatEntry, {
    toolCalls: [],
    response: ''
  })

  for (let iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
    if (abortRef && abortRef.current) {
      setIsStreaming(false)
      updateChatEntry(chatEntry, {
        response: accumulatedContent + '\n\n*(Agent stopped by user)*'
      })
      return
    }

    const result = await callBackendAIchatWithTools(messages, config)

    if (result.error) {
      setIsStreaming(false)
      updateChatEntry(chatEntry, {
        response: accumulatedContent + `\n\n**Error:** ${result.error}`
      })
      return
    }

    const assistantMessage = result.message
    if (!assistantMessage) {
      setIsStreaming(false)
      updateChatEntry(chatEntry, {
        response: accumulatedContent || 'No response from AI.'
      })
      return
    }

    messages.push(assistantMessage)

    if (assistantMessage.content) {
      accumulatedContent += (accumulatedContent ? '\n\n' : '') + assistantMessage.content
      updateChatEntry(chatEntry, {
        response: accumulatedContent
      })
    }

    if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
      setIsStreaming(false)
      updateChatEntry(chatEntry, {
        response: accumulatedContent
      })
      return
    }

    for (const toolCall of assistantMessage.tool_calls) {
      if (abortRef && abortRef.current) {
        setIsStreaming(false)
        updateChatEntry(chatEntry, {
          response: accumulatedContent + '\n\n*(Agent stopped by user)*'
        })
        return
      }

      let args
      try {
        args = JSON.parse(toolCall.function.arguments)
      } catch {
        args = {}
      }

      const toolEntry = {
        id: toolCall.id,
        name: toolCall.function.name,
        args,
        status: 'running',
        result: null
      }
      toolCallsLog.push(toolEntry)
      updateChatEntry(chatEntry, {
        toolCalls: [...toolCallsLog]
      })

      let toolResult
      try {
        toolResult = await executeToolCall(toolCall.function.name, args)
        toolEntry.status = 'completed'
        toolEntry.result = toolResult
      } catch (err) {
        toolEntry.status = 'error'
        toolEntry.result = err.message
      }

      updateChatEntry(chatEntry, {
        toolCalls: [...toolCallsLog]
      })

      messages.push({
        role: 'tool',
        tool_call_id: toolCall.id,
        content: toolEntry.result
      })
    }
  }

  setIsStreaming(false)
  updateChatEntry(chatEntry, {
    response: accumulatedContent + '\n\n*(Agent reached maximum iterations)*'
  })
}
