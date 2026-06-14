/**
 * 哪吒 Agent 部署 — 用 Docker 镜像运行 Agent
 */
import { createSteps, updateStep } from './deploy-modal'

const AGENT_STEPS = [
  'SSH 连接服务器...',
  '拉取 Agent Docker 镜像...',
  '启动 Agent 容器...'
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

/**
 * 部署 Agent 到单台服务器
 */
export async function deployAgent (bookmark, dashboardUrl, onStepUpdate, agentSecretKey) {
  const name = bookmark.title || bookmark.host
  const steps = getAgentSteps(name)
  let currentSteps = [...steps]
  const update = (i, status) => {
    currentSteps = updateStep(currentSteps, i, status)
    onStepUpdate([...currentSteps])
  }

  try {
    // Step 0: SSH
    update(0, 'running')
    const r0 = await ssh(bookmark, 'echo "SSH_OK"', 10000)
    if (!r0?.includes('SSH_OK')) { update(0, 'error'); return { success: false, server: name, error: 'SSH 连接失败' } }
    update(0, 'success')

    // Step 1: 拉取 Nezha 镜像（内含 agent 二进制）
    update(1, 'running')
    const pullCmd = `docker pull ghcr.io/nezhahq/nezha:latest 2>&1 && echo "DONE" || echo "FAILED"`
    const r1 = await ssh(bookmark, pullCmd, 180000)
    if (!r1?.includes('DONE')) { update(1, 'error'); return { success: false, server: name, error: `镜像拉取失败:\n${(r1 || '').substring(0, 200)}` } }
    update(1, 'success')

    // Step 2: 运行 Agent 容器
    update(2, 'running')
    const serverAddr = dashboardUrl.replace(/^https?:\/\//, '')
    const agentKey = agentSecretKey || name
    const runCmd = `docker rm -f nezha-agent 2>/dev/null; true && docker run -d --name nezha-agent --restart always --network host ghcr.io/nezhahq/nezha:latest agent -s "${serverAddr}" -k "${agentKey}" 2>&1 && sleep 2 && echo "DONE" || echo "FAILED"`
    const r2 = await ssh(bookmark, runCmd, 30000)
    if (!r2?.includes('DONE')) { update(2, 'error'); return { success: false, server: name, error: `Agent 启动失败:\n${(r2 || '').substring(0, 200)}` } }
    update(2, 'success')

    return { success: true, server: name }
  } catch (e) {
    const idx = currentSteps.findIndex(s => s.status === 'running')
    if (idx >= 0) update(idx, 'error')
    return { success: false, server: name, error: e.message }
  }
}
