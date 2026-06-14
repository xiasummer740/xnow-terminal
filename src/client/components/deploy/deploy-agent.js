/**
 * 哪吒 Agent 批量部署
 * 直接下载二进制 + 配置 systemd 服务，不跑交互脚本
 */
import { createSteps, updateStep } from './deploy-modal'

const AGENT_STEPS = [
  'SSH 连接服务器...',
  '下载并安装 Agent...',
  '配置连接主控...',
  '启动 Agent 服务...'
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
    const r0 = await ssh(bookmark, 'echo "SSH_OK" && uname -m', 10000)
    if (!r0?.includes('SSH_OK')) { update(0, 'error'); return { success: false, server: name, error: 'SSH 连接失败' } }
    update(0, 'success')

    // Step 1: 下载 Agent 二进制
    update(1, 'running')
    const installCmd = `(apt-get install -y unzip 2>/dev/null || yum install -y unzip 2>/dev/null || true) && curl -sL "https://github.com/nezhahq/nezha/releases/download/v2.2.3/agent-linux-amd64.zip" -o /tmp/nezha-agent.zip 2>&1 || curl -sL "https://github.com/nezhahq/nezha/releases/latest/download/agent-linux-amd64.zip" -o /tmp/nezha-agent.zip 2>&1 && mkdir -p /opt/nezha/agent && unzip -jo /tmp/nezha-agent.zip -d /opt/nezha/agent/ 2>&1 && chmod +x /opt/nezha/agent/* && rm -f /tmp/nezha-agent.zip && ls /opt/nezha/agent/ && echo "DONE" || echo "FAILED"`
    const r1 = await ssh(bookmark, installCmd, 120000)
    if (!r1?.includes('DONE')) { update(1, 'error'); return { success: false, server: name, error: `Agent 下载失败:\n${(r1 || '').substring(0, 200)}` } }
    const binName = await ssh(bookmark, `ls /opt/nezha/agent/*-linux-* /opt/nezha/agent/nezha* 2>/dev/null | head -1 | xargs basename 2>/dev/null || echo 'agent'`, 5000)
    update(1, 'success')

    // Step 2: 配置连接主控
    update(2, 'running')
    const serverAddr = dashboardUrl.replace(/^https?:\/\//, '')
    const agentKey = agentSecretKey || name
    const svcContent = [
      '[Unit]', 'Description=Nezha Agent', 'After=network.target', '',
      '[Service]', 'Type=simple', 'WorkingDirectory=/opt/nezha/agent',
      `ExecStart=/opt/nezha/agent/${binName.trim()} -s "${serverAddr}" -k "${agentKey}"`,
      'Restart=always', 'RestartSec=5', '',
      '[Install]', 'WantedBy=multi-user.target'
    ].join('\n')
    const cfgCmd = `rm -f /etc/systemd/system/nezha-agent.service && printf '%s\\n' '${svcContent}' > /etc/systemd/system/nezha-agent.service && echo "CFG_DONE" || echo "CFG_FAIL"`
    const r2 = await ssh(bookmark, cfgCmd, 10000)
    if (!r2?.includes('CFG_DONE')) { update(2, 'error'); return { success: false, server: name, error: '配置写入失败' } }
    update(2, 'success')

    // Step 3: 启动服务
    update(3, 'running')
    const startCmd = `systemctl daemon-reload && systemctl enable nezha-agent && systemctl restart nezha-agent && sleep 2 && echo "SVC_DONE" || echo "SVC_FAIL"`
    const r3 = await ssh(bookmark, startCmd, 15000)
    if (!r3?.includes('SVC_DONE')) { update(3, 'error'); return { success: false, server: name, error: 'Agent 启动失败' } }
    update(3, 'success')

    return { success: true, server: name }
  } catch (e) {
    const idx = currentSteps.findIndex(s => s.status === 'running')
    if (idx >= 0) update(idx, 'error')
    return { success: false, server: name, error: e.message }
  }
}

/**
 * 批量部署多台服务器
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
