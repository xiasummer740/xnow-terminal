/**
 * 哪吒主控一键部署
 * 直接下载二进制 + 创建配置文件，不跑交互脚本
 */
import { createSteps, updateStep } from './deploy-modal'

const DEPLOY_STEPS = [
  'SSH 连接服务器...',
  '下载并安装哪吒主控...',
  '配置主控...',
  '启动服务...',
  '等待服务就绪...',
  '初始化管理员账号...',
  '创建 API Token...',
  '配置完成'
]

export function getMasterSteps () {
  return createSteps(DEPLOY_STEPS)
}

async function ssh (bookmark, cmd, timeout = 30000) {
  return window.pre.runGlobalAsync('execSshCommand', {
    host: bookmark.host, port: bookmark.port || 22,
    username: bookmark.username || 'root',
    password: bookmark.password, privateKey: bookmark.privateKey,
    command: cmd, timeout
  })
}

export async function deployMaster (bookmark, onStepUpdate) {
  const steps = getMasterSteps()
  let currentSteps = [...steps]
  const update = (i, status) => {
    currentSteps = updateStep(currentSteps, i, status)
    onStepUpdate([...currentSteps])
  }

  try {
    // Step 0: SSH 连接
    update(0, 'running')
    const r0 = await ssh(bookmark, 'echo "SSH_OK" && uname -m', 10000)
    if (!r0?.includes('SSH_OK')) {
      update(0, 'error')
      return { success: false, error: 'SSH 连接失败，请检查书签的登录信息' }
    }
    update(0, 'success')

    const hostIP = bookmark.host
    const adminEmail = 'admin@xnow.tech'
    const adminPass = 'Xnow' + Date.now().toString(36).toUpperCase() + '!'

    // Step 1: 下载并安装 Dashboard
    update(1, 'running')
    const zipUrl = 'https://github.com/nezhahq/nezha/releases/download/v2.2.3/dashboard-linux-amd64.zip'
    const installCmd = `(apt-get install -y unzip 2>/dev/null || yum install -y unzip 2>/dev/null || true) && curl -sL "${zipUrl}" -o /tmp/nezha-dash.zip && mkdir -p /opt/nezha/dashboard/data && unzip -jo /tmp/nezha-dash.zip -d /opt/nezha/dashboard/ && chmod +x /opt/nezha/dashboard/* && rm -f /tmp/nezha-dash.zip && echo "DONE" || echo "FAILED"`
    const r1 = await ssh(bookmark, installCmd, 120000)
    if (!r1?.includes('DONE')) {
      update(1, 'error')
      return { success: false, error: `下载安装失败:\n${r1 || '无响应'}` }
    }
    // 自动检测实际二进制文件名
    const listOut = await ssh(bookmark, 'ls /opt/nezha/dashboard/*-linux-* /opt/nezha/dashboard/nezha* /opt/nezha/dashboard/dashboard 2>/dev/null | head -1', 5000)
    const binName = (listOut || 'dashboard').trim().split('/').pop() || 'dashboard'

    // Step 2: 创建配置文件
    update(2, 'running')
    const configYaml = [
      'debug: false',
      'listen_port: 8008',
      'site:',
      `  brand: XNOW监控`,
      `  theme: default`,
      `  language: zh-CN`,
      `  timezone: Asia/Shanghai`
    ].join('\n')
    const configCmd = `cat > /opt/nezha/dashboard/data/config.yaml << 'EOF'\n${configYaml}\nEOF`
    await ssh(bookmark, `mkdir -p /opt/nezha/dashboard/data && ${configCmd}`, 10000)
    update(2, 'success')

    // Step 3: 创建 systemd 服务并启动
    update(3, 'running')
    const appPath = `/opt/nezha/dashboard/${binName}`
    const svc = `[Unit]\nDescription=Nezha Dashboard\nAfter=network.target\n\n[Service]\nType=simple\nWorkingDirectory=/opt/nezha/dashboard\nExecStart=${appPath}\nRestart=always\nRestartSec=5\n\n[Install]\nWantedBy=multi-user.target`
    const svcCmd = `cat > /etc/systemd/system/nezha-dashboard.service << 'SERVICEEOF'\n${svc}\nSERVICEEOF\nsystemctl daemon-reload && systemctl enable nezha-dashboard && systemctl start nezha-dashboard`
    await ssh(bookmark, svcCmd, 15000)
    // 开防火墙
    await ssh(bookmark, 'which ufw >/dev/null 2>&1 && ufw allow 8008/tcp 2>/dev/null; true', 5000)
    update(3, 'success')

    // Step 4: 等待服务就绪
    update(4, 'running')
    const waitCmd = 'for i in $(seq 1 30); do curl -s http://localhost:8008/api/v1/server >/dev/null 2>&1 && echo "READY" && break; sleep 2; done'
    const r4 = await ssh(bookmark, waitCmd, 90000)
    if (!r4?.includes('READY')) {
      const logs = await ssh(bookmark, 'journalctl -u nezha-dashboard --no-pager -n 20 2>/dev/null || echo "日志不可用"', 10000)
      update(4, 'error')
      return { success: false, error: `Dashboard 启动失败:\n${logs || ''}` }
    }
    update(4, 'success')

    // Step 5-6: 尝试自动创建管理员 + API Token
    update(5, 'running')
    let apiToken = ''
    const adminPass = 'Xnow' + Date.now().toString(36).toUpperCase() + '!'

    // 逐一尝试已知的初始化端点
    for (const ep of ['/api/v1/setup', '/api/v1/init', '/api/v1/install', '/api/v1/user/init']) {
      const resp = await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008${ep}' -H 'Content-Type: application/json' -d '{"email":"${adminEmail}","password":"${adminPass}","name":"XNOW"}'`, 10000)
      if (resp?.includes('"success":true') || resp?.includes('"token"')) {
        // 尝试从响应中提取 token
        try {
          const p = JSON.parse(resp)
          apiToken = p?.data?.token || p?.token || ''
        } catch {}
        break
      }
    }

    // 如果上面没拿到 token，尝试用默认密码登录
    if (!apiToken) {
      for (const pw of ['admin', adminPass]) {
        const r = await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/login' -H 'Content-Type: application/json' -d '{"username":"${adminEmail}","password":"${pw}"}'`, 10000)
        if (r) {
          try {
            const p = JSON.parse(r)
            const jwt = p?.data?.token || p?.token || ''
            if (jwt) {
              // 有 JWT，创建 API Token
              const tr = await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/api-tokens' -H 'Content-Type: application/json' -H 'Authorization: Bearer ${jwt}' -d '{"name":"xnow-terminal","scopes":["nezha:*"],"expires_in_days":3650}'`, 10000)
              if (tr) {
                try { apiToken = JSON.parse(tr)?.data?.token || '' } catch {}
              }
            }
          } catch {}
        }
        if (apiToken) break
      }
    }
    update(5, 'success')

    // Step 6: 完成
    const dashboardUrl = `http://${hostIP}:8008`
    update(6, 'success')

    if (!apiToken) {
      return {
        success: true, dashboardUrl, adminEmail, adminPass,
        setupGuide: `XNOW 监控已部署成功！\n\n首次使用请打开浏览器访问 ${dashboardUrl}\n点击「开始使用」创建管理员账号\n创建后在「系统设置 → API Tokens」生成 Token\n填到下方输入框中即可使用。`
      }
    }

    return {
      success: true, dashboardUrl, apiToken,
      setupGuide: `✅ 全部完成！API Token 已自动创建并填入。`
    }
  } catch (e) {
    const idx = currentSteps.findIndex(s => s.status === 'running')
    if (idx >= 0) update(idx, 'error')
    return { success: false, error: e.message || '部署异常' }
  }
}
