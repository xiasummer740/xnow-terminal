/* global localStorage */
import { agentTools, executeToolCall } from './agent-tools'
import { getInstalledSkills, saveDraft, hasSimilarSkill, BUILTIN_SKILLS } from '../../common/skill-manager'

const MAX_ITERATIONS = 150
const MEMORY_KEY = 'xnow_agent_memory'
const MAX_MEMORIES = 20

function loadMemories () {
  try {
    const raw = localStorage.getItem(MEMORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

function saveMemories (list) {
  if (list.length > MAX_MEMORIES) list = list.slice(-MAX_MEMORIES)
  localStorage.setItem(MEMORY_KEY, JSON.stringify(list))
}

function buildAgentSystemPrompt (config) {
  const lang = config.languageAI || window.store.getLangName()
  const baseRole = config.roleAI || 'You are a helpful assistant.'
  const customPrompt = window.store.config?.agentSystemPrompt

  const memories = loadMemories()
  const memoryText = memories.length > 0
    ? '\n\n## 已掌握的经验技能\n' +
      memories.map((m, i) => `${i + 1}. ${m}`).join('\n')
    : ''

  // 加载可用技能（已安装 + 未安装的内置技能）
  const installedSkills = getInstalledSkills()
  const installedIds = new Set(installedSkills.map(s => s.id))
  const availableBuiltin = BUILTIN_SKILLS.filter(s => !installedIds.has(s.id))
  const allSkills = [...installedSkills, ...availableBuiltin]
  const skillsText = allSkills.length > 0
    ? '\n\n## 可用技能\n' +
      allSkills.map(s =>
        `### ${s.name}${s.source === 'builtin' && !installedIds.has(s.id) ? ' (内置)' : ''}\n${s.description || ''}\n${s.prompt || ''}`
      ).join('\n\n')
    : ''

  const basePrompt = customPrompt && customPrompt.trim()
    ? `${baseRole}\n\n${customPrompt}\n\nReply in ${lang} language.`
    : `${baseRole}

You are operating inside XNOW, a terminal/SSH/SFTP client with AI superpowers. You have access to tools that let you:
- Run commands in terminal tabs and read their output
- Open new terminal tabs (local or SSH)
- Manage bookmarks (create, list, open connections)
- Switch between tabs
- Transfer files via SFTP (upload, download, list, read, delete remote files)
- Read/write local files (read_local_file, write_local_file)
- Browse directories and search code (list_directory, grep_files)
- Fetch web pages and APIs (web_fetch_page)

## 🔴 铁律
1. **不盲猜** — 先收集真实信息（查日志/看配置/检视状态）再分析和操作，禁止猜"可能是xxx"
2. **不跳步** — 核心流程（收集→分析→修复→验证）不可跳过，跳步 = 返工
3. **不擅作主张** — 改系统配置、删文件、重启服务等操作前先问用户确认
4. **证据先于断言** — 说"完成/修好了"之前必须有命令输出佐证
5. **简洁高效** — 最少操作完成任务，不跑多余命令
6. **精准修改** — 只改和需求直接相关的，不改无关配置
7. **停得下来** — 每步完成后检查结果，全部验证通过才说完成

## 结构化工作流

### 📝 方案讨论
用户说"方案/想法/怎么做"时：
1. 理解需求 — 如有歧义先反问确认
2. 列出 2-3 个可行方案，每个标注：实现复杂度 / 风险 / 耗时
3. 推荐最佳方案并说明理由
4. 拆解为可执行的步骤

### 🔍 排错
用户说"报错/崩溃/不工作"时：
1. 收集事实 — 查日志、看配置、检视进程状态，不猜
2. 列出可能的根因（2-3 个），逐一验证排除
3. 确认影响范围后再提修复方案
4. 修复后执行命令验证确认恢复

### 📋 代码审查
用户说"审查/review/检查代码"时：
1. 读文件，理解逻辑
2. 逐项检查：正确性 / 安全性 / 性能 / 代码风格
3. 列出问题，标注严重程度（严重/一般/建议）
4. 逐一修复，修复后验证

### 🏗️ 计划
用户说"计划/实现/开发"时：拆解任务 → 确定依赖 → 逐个执行 → 验证

### 🔄 重构
用户说"重构/优化"时：理解设计 → 找到改进点 → 渐进修改 → 验证

## 工具
- send_terminal_command — 执行命令
- read_local_file / write_local_file — 读写本地文件
- grep_files — 搜索代码
- list_directory — 浏览目录
- web_fetch_page — 获取网页信息
- list_bookmarks + open_bookmark — 管理服务器

Reply in ${lang} language.`

  // 注入当前 tab 上下文
  const currentTab = window.store.currentTab
  let tabContext = ''
  if (currentTab) {
    tabContext = `
## 当前连接
- 标签名: ${currentTab.title || ''}
- 主机: ${currentTab.host || '本地终端'}
- 类型: ${currentTab.type || 'local'}`
  }
  return basePrompt + memoryText + skillsText + tabContext
}

function updateChatEntry (chatEntry, updates) {
  const index = window.store.aiChatHistory.findIndex(i => i.id === chatEntry.id)
  if (index !== -1) {
    Object.assign(window.store.aiChatHistory[index], updates)
    window.store.aiChatHistory = [...window.store.aiChatHistory]
  }
}

async function callBackendAIchatWithTools (messages, config) {
  // 合并硬编码工具 + 已安装技能的自定义工具
  const tools = agentTools.concat(getSkillTools())
  return window.pre.runGlobalAsync(
    'AIchatWithTools',
    messages,
    config.modelAI,
    config.baseURLAI,
    config.apiPathAI,
    config.apiKeyAI,
    config.proxyAI,
    tools
  )
}

// 自动总结学习 + 技能草案生成
async function autoLearn (messages, accumulatedContent, config) {
  try {
    const modelToUse = config.skillGenModel || 'deepseek-v4-flash'

    const systemPrompt = `你是一个技能提炼助手。根据以下 AI 任务对话，完成两项工作：

1. 判断本次任务的操作步骤是否形成了可复用的模式（即有清晰流程、可重复使用、涉及工具调用）
2. 如果有可复用模式，生成一个完整的技能定义

可复用模式判断标准：
- 操作步骤有清晰流程（3步以上）
- 流程在不同场景下可重复使用
- 涉及工具调用（命令执行、文件操作等）

日常操作（如"查一下时间"、"说个笑话"）不应该生成技能。

如果发现可复用的操作模式，只输出以下 JSON（不要其他内容）：

{
  "hasPattern": true,
  "memory": "用一句中文总结这次任务的经验",
  "skill": {
    "name": "4-6字技能名称",
    "description": "30字以内的功能描述",
    "category": "从[运维工具, 监控工具, 部署工具, 安全工具, AI工具]中选择",
    "prompt": "详细的步骤指南，告诉 AI 怎么执行这个技能。用 ## 标题 格式分段"
  }
}

如果没有发现可复用模式，只输出：

{
  "hasPattern": false,
  "memory": "用一句中文总结这次任务的经验（可以为空字符串）"
}

注意：
- memory 永远有值（即使为空字符串）
- hasPattern 为 false 时不要包含 skill 字段
- category 必须从给定列表中选择
- name 必须简短（4-6字）
- description 必须在 30 字以内
- 只输出纯 JSON，不要 markdown 代码块包裹`

    const userPrompt = '请分析这次任务的操作过程，判断是否有可复用的操作模式：\n' + accumulatedContent.substring(0, 2500)

    let result = await window.pre.runGlobalAsync(
      'AIchat',
      userPrompt,
      modelToUse,
      systemPrompt,
      config.baseURLAI,
      config.apiPathAI,
      config.apiKeyAI,
      config.proxyAI,
      false
    )

    // flash 失败时回退到主模型
    if ((!result || result.error) && modelToUse !== config.modelAI) {
      result = await window.pre.runGlobalAsync(
        'AIchat',
        userPrompt,
        config.modelAI,
        systemPrompt,
        config.baseURLAI,
        config.apiPathAI,
        config.apiKeyAI,
        config.proxyAI,
        false
      )
    }

    if (result && result.response && !result.error) {
      const text = result.response.trim()

      // 尝试解析 JSON（可能被 markdown 代码块包裹）
      let parsed = null
      try {
        parsed = JSON.parse(text)
      } catch {
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (jsonMatch) {
          try { parsed = JSON.parse(jsonMatch[1].trim()) } catch {}
        }
      }

      if (parsed && typeof parsed === 'object' && parsed.hasPattern !== undefined) {
        // 存 memory（经验总结）
        if (parsed.memory && parsed.memory.length > 5 && parsed.memory.length < 200) {
          const existing = loadMemories()
          if (!existing.includes(parsed.memory)) {
            existing.push(parsed.memory)
            saveMemories(existing)
          }
        }

        // 如果有模式，生成技能草案
        if (parsed.hasPattern && parsed.skill) {
          const draft = {
            id: 'xnow-skill-draft-' + Date.now(),
            name: parsed.skill.name,
            version: '1.0.0',
            author: 'xnow-auto',
            category: parsed.skill.category,
            description: parsed.skill.description,
            prompt: parsed.skill.prompt,
            tools: parsed.skill.tools || [],
            source: 'ai_generated',
            draftStatus: 'pending',
            draftCreatedAt: Date.now()
          }

          if (draft.name && draft.description && !hasSimilarSkill(draft)) {
            const saveResult = saveDraft(draft)
            if (saveResult.success && typeof window !== 'undefined' && window.store) {
              window.store.pendingSkillDraft = draft
              window.store.showSkillDiscovery = true
            }
          }
        }
      } else {
        // 原有逻辑：直接存 memory（应对 AI 没按格式输出的情况）
        if (text.length > 5 && text.length < 200) {
          const existing = loadMemories()
          if (!existing.includes(text)) {
            existing.push(text)
            saveMemories(existing)
          }
        }
      }
    }
  } catch (e) {
    // 静默失败，不影响主流程
  }
}

export async function runAgentLoop (chatEntry, config, abortRef, setIsStreaming, history = []) {
  // 构建消息列表：系统提示 → 最近对话历史 → 当前问题
  const messages = [
    { role: 'system', content: buildAgentSystemPrompt(config) }
  ]
  // 插入最近的历史对话作为上下文
  for (const h of history) {
    if (h.prompt) messages.push({ role: 'user', content: h.prompt })
    if (h.response) messages.push({ role: 'assistant', content: h.response })
  }
  messages.push({ role: 'user', content: chatEntry.prompt })
  const toolCallsLog = []
  let accumulatedContent = ''

  setIsStreaming(true)
  // 锁定当前 tab：对话期间所有命令默认发到开始时的活跃标签
  const lockedTabId = window.store.activeTabId
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
      updateChatEntry(chatEntry, { response: accumulatedContent })
      // 后台自动总结学习
      autoLearn(messages, accumulatedContent, config)
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
      try { args = JSON.parse(toolCall.function.arguments) } catch { args = {} }

      // 自动补 tabId：所有支持可选 tabId 的工具，AI 未指定时使用锁定时的活跃标签
      const TAB_ID_TOOLS = [
        'send_terminal_command', 'get_terminal_output', 'close_tab',
        'sftp_list', 'sftp_stat', 'sftp_read_file', 'sftp_del',
        'sftp_upload', 'sftp_download'
      ]
      if (TAB_ID_TOOLS.includes(toolCall.function.name) && !args.tabId) {
        if (lockedTabId) args.tabId = lockedTabId
      }

      const toolEntry = {
        id: toolCall.id,
        name: toolCall.function.name,
        args,
        status: 'running',
        result: null
      }
      toolCallsLog.push(toolEntry)
      updateChatEntry(chatEntry, { toolCalls: [...toolCallsLog] })

      let toolResult
      try {
        toolResult = await executeToolCall(toolCall.function.name, args)
        toolEntry.status = 'completed'
        toolEntry.result = toolResult
      } catch (err) {
        toolEntry.status = 'error'
        toolEntry.result = err.message
      }

      updateChatEntry(chatEntry, { toolCalls: [...toolCallsLog] })

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

export function getAgentMemories () { return loadMemories() }
export function clearAgentMemories () { saveMemories([]) }
export function addAgentMemory (text) {
  const existing = loadMemories()
  if (!existing.includes(text)) existing.push(text)
  saveMemories(existing)
}

export function getSkillTools () {
  return getInstalledSkills().flatMap(s => s.tools || [])
}
