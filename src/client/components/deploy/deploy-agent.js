/**
 * 哪吒 Agent 部署 — 用 install_agent_v0 脚本安装
 * Nezha v2.x 已移除 Agent 二进制发布，只能用 v0 兼容版
 */
import { createSteps, updateStep } from './deploy-modal'

const AGENT_STEPS = [
  'SSH 连接服务器...',
  '安装 Agent (v0 兼容版)...',
  '启动 Agent...'
]

export function getAgentSteps (serverName) {
  return createSteps(AGENT_STEPS.map(s => s.replace('服务器', serverName)))
}

async function ssh (bookmark, cmd, timeout = 30000) {
  return window.pre.runGlobalAsync('execSshCommand', {
    host: bookmark.host, port: bookmark.port || 22,
    username: bookmark.username || 'root',
    password: bookmark.password, privateKey: bookmark.privateKey,
    command: cmd, timeout
  })
}

export async function deployAgent (bookmark, dashboardUrl, onStepUpdate, agentSecretKey) {
  const name = bookmark.title || bookmark.host
  const steps = getAgentSteps(name)
  let currentSteps = [...steps]
  const update = (i, status) => {
    currentSteps = updateStep(currentSteps, i, status)
    onStepUpdate([...currentSteps])
  }

  try {
    update(0, 'running')
    const r0 = await ssh(bookmark, 'echo "SSH_OK"', 10000)
    if (!r0?.includes('SSH_OK')) { update(0, 'error'); return { success: false, server: name, error: 'SSH 连接失败' } }
    update(0, 'success')

    update(1, 'running')
    const serverAddr = dashboardUrl.replace(/^https?:\/\//, '')
    const agentKey = agentSecretKey || name
    // 用 v0 兼容脚本安装 Agent，自动回答所有问题
    const answers = `${serverAddr}\n${agentKey}\nn\n`
    const installCmd = `curl -sL 'https://raw.githubusercontent.com/nezhahq/scripts/refs/heads/v0/install.sh' -o /tmp/nezha-v0.sh 2>&1 && chmod +x /tmp/nezha-v0.sh && printf '${answers}' | bash /tmp/nezha-v0.sh install_agent 2>&1 && echo 'DONE' || echo 'FAILED'`
    const r1 = await ssh(bookmark, installCmd, 180000)
    if (!r1?.includes('DONE')) {
      return { success: false, server: name, error: `Agent 安装失败:\n${(r1 || '').substring(0, 300)}` }
    }
    update(1, 'success')

    update(2, 'running')
    // 检查 Agent 进程
    const check = await ssh(bookmark, `systemctl is-active nezha-agent 2>/dev/null && echo 'ACTIVE' || echo 'INACTIVE'`, 10000)
    if (!check?.includes('ACTIVE')) {
      const logs = await ssh(bookmark, 'journalctl -u nezha-agent --no-pager -n 10 2>/dev/null', 10000)
      return { success: false, server: name, error: `Agent 未启动:\n${(logs || '').substring(0, 300)}` }
    }
    update(2, 'success')
    return { success: true, server: name }
  } catch (e) {
    const idx = currentSteps.findIndex(s => s.status === 'running')
    if (idx >= 0) update(idx, 'error')
    return { success: false, server: name, error: e.message }
  }
}
