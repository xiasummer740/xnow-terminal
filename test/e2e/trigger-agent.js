/**
 * 辅助脚本：通过 Electron 的 refsStatic 全局引用来触发 AI Agent 任务
 *
 * 用法（在 Electron 环境内执行）：
 * 1. 打开 DevTools (Ctrl+Shift+I)
 * 2. 在 Console 中粘贴以下代码
 */

(function triggerAgentTask () {
  // 获取 AIChat 组件的引用（通过 refsStatic）
  const aiChat = window.refsStatic && window.refsStatic.get('AIChat')
  if (!aiChat) {
    console.error('❌ AIChat ref not found. Make sure the AI panel is visible.')
    return
  }

  // 设置 prompt
  aiChat.setPrompt('检查当前系统的磁盘使用情况，列出所有磁盘分区的总大小、已用空间、可用空间和使用百分比')

  // 先切换到 Agent 模式
  // 注意: mode 默认在 localStorage 中保存
  window.localStorage.setItem('ai-chat-mode', 'agent')

  // 提交
  setTimeout(function () {
    aiChat.handleSubmit()
    console.log('✅ Agent task submitted!')
    console.log('⏳ Wait 30-60s for the agent to complete...')
  }, 500)
})()
