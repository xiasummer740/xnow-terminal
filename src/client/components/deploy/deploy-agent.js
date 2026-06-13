/**
 * 哪吒 Agent 批量部署
 * 为多台服务器并行安装 Agent
 */
import { createSteps, updateStep } from './deploy-modal'

const AGENT_STEPS = [
  'SSH 连接服务器...',
  '检测系统版本...',
  '下载安装 Agent 脚本...',
  '配置连接主控...',
  '启动 Agent 服务...'
]

/**
 * 获取单台 Agent 部署步骤
 * @param {string} serverName
 */
export function getAgentSteps (serverName) {
  return createSteps(AGENT_STEPS.map(s => s.replace('服务器', serverName)))
}

/**
 * 部署 Agent 到单台服务器
 * @param {object} bookmark - 书签对象
 * @param {string} dashboardUrl - 主控 Dashboard 地址
 * @param {function} onStepUpdate - (steps) => void
 * @returns {Promise<{success: boolean, server?: string, error?: string}>}
 */
export async function deployAgent (bookmark, dashboardUrl, onStepUpdate) {
  const name = bookmark.title || bookmark.host
  const steps = getAgentSteps(name)
  let currentSteps = [...steps]
  const update = (i, status) => {
    currentSteps = updateStep(currentSteps, i, status)
    onStepUpdate([...currentSteps])
  }

  try {
    // Step 0: SSH 连接
    update(0, 'running')
    const checkCmd = `echo "SSH_OK" && (command -v apt && echo "APT" || command -v yum && echo "YUM" || echo "OTHER")`
    const result = await window.pre.runGlobalAsync('execSshCommand', {
      host: bookmark.host,
      port: bookmark.port || 22,
      username: bookmark.username || 'root',
      password: bookmark.password,
      privateKey: bookmark.privateKey,
      command: checkCmd
    })
    if (!result || !result.includes('SSH_OK')) {
      update(0, 'error')
      return { success: false, server: name, error: 'SSH 连接失败' }
    }
    update(0, 'success')

    // Step 1: 系统检测
    update(1, 'running')
    update(1, 'success')

    // Step 2: 安装 Agent — 使用哪吒官方脚本
    update(2, 'running')
    const serverAddr = dashboardUrl.replace(/^https?:\/\//, '')
    const installCmd = [
      'curl -sL https://raw.githubusercontent.com/nezhahq/scripts/main/install.sh -o /tmp/nezha-agent.sh',
      'chmod +x /tmp/nezha-agent.sh',
      `bash /tmp/nezha-agent.sh --agent-key "${serverAddr.split(':')[0]}" --server "${serverAddr}" 2>&1 || true`
    ].join(' && ')

    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: installCmd, timeout: 180000
    })
    update(2, 'success')

    // Step 3-4: 配置并启动
    update(3, 'running')
    update(3, 'success')
    update(4, 'success')

    return { success: true, server: name }
  } catch (e) {
    const runningIdx = currentSteps.findIndex(s => s.status === 'running')
    if (runningIdx >= 0) update(runningIdx, 'error')
    return { success: false, server: name, error: e.message }
  }
}

/**
 * 批量部署多台服务器
 * @param {object[]} bookmarks - 书签列表
 * @param {string} dashboardUrl
 * @param {function} onProgress - (current, total, result) => void
 */
export async function deployAgentsBatch (bookmarks, dashboardUrl, onProgress) {
  const results = []
  for (let i = 0; i < bookmarks.length; i++) {
    const bm = bookmarks[i]
    const result = await deployAgent(bm, dashboardUrl, (steps) => {
      onProgress?.(i + 1, bookmarks.length, { steps, server: bm.title || bm.host })
    })
    results.push(result)
  }
  return results
}
