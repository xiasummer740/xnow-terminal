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
    const installCmd = [
      'mkdir -p /opt/nezha/dashboard',
      'curl -sL "https://github.com/nezhahq/nezha/releases/latest/download/dashboard-linux-amd64.zip" -o /tmp/nezha-dash.zip',
      'unzip -qo /tmp/nezha-dash.zip -d /opt/nezha/dashboard/',
      'chmod +x /opt/nezha/dashboard/app',
      'rm -f /tmp/nezha-dash.zip'
    ].join(' && ')
    const r1 = await ssh(bookmark, installCmd, 120000)
    if (!r1 || r1.includes('Error') || r1.includes('error') || r1.includes('failed')) {
      // 可能 amd64 不对，试试 x86_64
      const installCmd2 = [
        'mkdir -p /opt/nezha/dashboard',
        'curl -sL "https://github.com/nezhahq/nezha/releases/latest/download/dashboard-linux-amd64.zip" -o /tmp/nezha-dash.zip 2>&1 || curl -sL "https://github.com/nezhahq/nezha/releases/download/v2.2.3/dashboard-linux-amd64.zip" -o /tmp/nezha-dash.zip 2>&1',
        'unzip -qo /tmp/nezha-dash.zip -d /opt/nezha/dashboard/ 2>&1',
        'chmod +x /opt/nezha/dashboard/app',
        'rm -f /tmp/nezha-dash.zip'
      ].join(' && ')
      const r2 = await ssh(bookmark, installCmd2, 120000)
      if (!r2 || r2.includes('Error') || r2.includes(' error')) {
        update(1, 'error')
        return { success: false, error: `下载安装失败:\n${(r1 || '')}\n${(r2 || '')}` }
      }
    }
    update(1, 'success')

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
    const svc = [
      '[Unit]',
      'Description=Nezha Dashboard',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'WorkingDirectory=/opt/nezha/dashboard',
      'ExecStart=/opt/nezha/dashboard/app',
      'Restart=always',
      'RestartSec=5',
      '',
      '[Install]',
      'WantedBy=multi-user.target'
    ].join('\n')
    const svcCmd = `cat > /etc/systemd/system/nezha-dashboard.service << 'EOF'\n${svc}\nEOF && systemctl daemon-reload && systemctl enable nezha-dashboard && systemctl start nezha-dashboard`
    await ssh(bookmark, svcCmd, 15000)
    // 开防火墙
    await ssh(bookmark, 'which ufw >/dev/null 2>&1 && ufw allow 8008/tcp 2>/dev/null; true', 5000)
    update(3, 'success')

    // Step 4: 等待服务就绪
    update(4, 'running')
    const waitCmd = [
      'for i in $(seq 1 30); do',
      '  curl -s http://localhost:8008/api/v1/server >/dev/null 2>&1 && echo "READY" && break',
      '  sleep 2',
      'done'
    ].join('; ')
    const r4 = await ssh(bookmark, waitCmd, 90000)
    if (!r4?.includes('READY')) {
      update(4, 'error')
      const logs = await ssh(bookmark, 'journalctl -u nezha-dashboard --no-pager -n 20 2>/dev/null || echo "日志不可用"', 10000)
      return { success: false, error: `Dashboard 启动失败，服务日志:\n${logs || ''}` }
    }
    update(4, 'success')

    // Step 5: 初始化管理员账号（通过 API）
    update(5, 'running')
    // 先尝试用默认密码登录（可能是已初始化的）
    let jwt = ''
    let usedPass = ''
    const loginTry = await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/login' -H 'Content-Type: application/json' -d '{"username":"admin@xnow.tech","password":"admin"}'`, 10000)
    if (loginTry) {
      try { jwt = JSON.parse(loginTry)?.data?.token || JSON.parse(loginTry)?.token || '' } catch {}
    }
    if (jwt) {
      usedPass = 'admin'
    } else {
      // 未初始化，创建管理员
      await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/setup' -H 'Content-Type: application/json' -d '{"email":"${adminEmail}","password":"${adminPass}","name":"XNOW"}'`, 10000)
      // 登录获取 JWT
      const loginResp = await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/login' -H 'Content-Type: application/json' -d '{"username":"${adminEmail}","password":"${adminPass}"}'`, 10000)
      if (loginResp) {
        try { jwt = JSON.parse(loginResp)?.data?.token || JSON.parse(loginResp)?.token || '' } catch {}
      }
      usedPass = adminPass
    }
    update(5, 'success')

    // Step 6: 创建 API Token
    update(6, 'running')
    let apiToken = ''
    if (jwt) {
      const tokenResp = await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/api-tokens' -H 'Content-Type: application/json' -H 'Authorization: Bearer ${jwt}' -d '{"name":"xnow-terminal","scopes":["nezha:*"],"expires_in_days":3650}'`, 10000)
      if (tokenResp) {
        try { apiToken = JSON.parse(tokenResp)?.data?.token || '' } catch {}
      }
    }
    update(6, 'success')

    // Step 7: 完成
    const dashboardUrl = `http://${hostIP}:8008`
    update(7, 'success')

    if (!apiToken) {
      return {
        success: true, dashboardUrl, adminEmail,
        adminPass: usedPass,
        setupGuide: `部署成功！\n管理员：${adminEmail} / ${usedPass}\n自动创建 Token 失败，请访问 ${dashboardUrl} 登录后手动创建。`
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
