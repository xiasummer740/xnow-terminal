/**
 * 哪吒 Agent 部署 — 从源码编译
 * Nezha v2.x 已移除 Agent 发布，需要编译旧版源码
 */
import { createSteps, updateStep } from './deploy-modal'

const AGENT_STEPS = [
  'SSH 连接服务器...',
  '安装 Go 编译环境...',
  '编译 Agent...',
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
    // Step 0: SSH
    update(0, 'running')
    const r0 = await ssh(bookmark, 'echo "SSH_OK"', 10000)
    if (!r0?.includes('SSH_OK')) { update(0, 'error'); return { success: false, server: name, error: 'SSH 连接失败' } }
    update(0, 'success')

    // Step 1: 安装 Go
    update(1, 'running')
    const goCmd = `command -v go && echo 'GO_EXISTS' && go version || (curl -sL 'https://go.dev/dl/go1.22.0.linux-amd64.tar.gz' -o /tmp/go.tar.gz && rm -rf /usr/local/go && tar -C /usr/local -xzf /tmp/go.tar.gz && ln -sf /usr/local/go/bin/go /usr/local/bin/go && rm -f /tmp/go.tar.gz && echo 'GO_INSTALLED')`
    const r1 = await ssh(bookmark, goCmd, 180000)
    if (!r1?.includes('GO') || r1.includes('Error')) {
      return { success: false, server: name, error: `Go 安装失败:\n${(r1 || '').substring(0, 200)}` }
    }
    update(1, 'success')

    // Step 2: 下载并编译 Agent
    update(2, 'running')
    // 用 v1.0.3 tag，Agent 代码还存在于仓库中
    const buildCmd = `export PATH=$PATH:/usr/local/go/bin && mkdir -p /opt/nezha/agent-src && cd /opt/nezha/agent-src && git clone --depth 1 --branch v1.0.3 https://github.com/nezhahq/nezha.git . 2>&1 && cd cmd/agent && go build -o /opt/nezha/agent/agent main.go 2>&1 && chmod +x /opt/nezha/agent/agent && echo 'BUILD_OK' || echo 'BUILD_FAILED'`
    const r2 = await ssh(bookmark, buildCmd, 300000) // 5 min timeout for compilation
    if (!r2?.includes('BUILD_OK')) {
      return { success: false, server: name, error: `编译失败:\n${(r2 || '').substring(0, 300)}` }
    }
    update(2, 'success')

    // Step 3: 创建 systemd 服务并启动
    update(3, 'running')
    const serverAddr = dashboardUrl.replace(/^https?:\/\//, '')
    const agentKey = agentSecretKey || name
    const svc = `[Unit]\nDescription=Nezha Agent\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=/opt/nezha/agent\nExecStart=/opt/nezha/agent/agent -s ${serverAddr} -k ${agentKey}\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target`
    const svcCmd = `rm -f /etc/systemd/system/nezha-agent.service && printf '%s\\n' '${svc}' > /etc/systemd/system/nezha-agent.service && systemctl daemon-reload && systemctl enable nezha-agent && systemctl restart nezha-agent && sleep 3 && echo 'DONE' || echo 'FAILED'`
    const r3 = await ssh(bookmark, svcCmd, 15000)
    if (!r3?.includes('DONE')) { update(3, 'error'); return { success: false, server: name, error: 'Agent 启动失败' } }
    update(3, 'success')

    return { success: true, server: name }
  } catch (e) {
    const idx = currentSteps.findIndex(s => s.status === 'running')
    if (idx >= 0) update(idx, 'error')
    return { success: false, server: name, error: e.message }
  }
}
