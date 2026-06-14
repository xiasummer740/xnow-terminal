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

    // Step 1: 下载并安装 Dashboard（用 latest 重定向，无需硬编码版本）
    update(1, 'running')
    const zipUrl = 'https://github.com/nezhahq/nezha/releases/latest/download/dashboard-linux-amd64.zip'
    const installCmd = `(apt-get install -y unzip 2>/dev/null || yum install -y unzip 2>/dev/null || true) && curl -sL "${zipUrl}" -o /tmp/nezha-dash.zip && mkdir -p /opt/nezha/dashboard/data && unzip -jo /tmp/nezha-dash.zip -d /opt/nezha/dashboard/ && chmod +x /opt/nezha/dashboard/* && rm -f /tmp/nezha-dash.zip && echo "DONE" || echo "FAILED"`
    const r1 = await ssh(bookmark, installCmd, 120000)
    if (!r1?.includes('DONE')) {
      const detail = (r1 || '无响应').substring(0, 200)
      console.error('[deploy] 下载安装失败:', r1)
      update(1, 'error')
      return { success: false, error: `下载安装失败，请检查服务器网络和磁盘空间` }
    }
    // 自动检测实际二进制文件名
    const listOut = await ssh(bookmark, 'ls /opt/nezha/dashboard/*-linux-* /opt/nezha/dashboard/nezha* /opt/nezha/dashboard/dashboard 2>/dev/null | head -1', 5000)
    const binName = (listOut || 'dashboard').trim().split('/').pop() || 'dashboard'

    // Step 2: 创建配置文件（用 printf 避免 heredoc 兼容问题）
    update(2, 'running')
    const configLines = [
      'debug: false',
      'listen_port: 8008',
      'site:',
      '  brand: XNOW监控',
      '  theme: default',
      '  language: zh-CN',
      '  timezone: Asia/Shanghai'
    ]
    const configCmd = 'mkdir -p /opt/nezha/dashboard/data && ' + configLines.map(l => `printf '%s\\n' '${l}' >> /opt/nezha/dashboard/data/config.yaml`).join(' && ') + ' && echo "CONFIG_DONE"'
    const r2 = await ssh(bookmark, configCmd, 10000)
    if (!r2?.includes('CONFIG_DONE')) {
      console.error('[deploy] 配置文件写入失败:', r2)
      update(2, 'error')
      return { success: false, error: '配置文件写入失败，请检查服务器磁盘和权限' }
    }
    update(2, 'success')

    // Step 3: 创建 systemd 服务并启动（用 printf 避免 heredoc 兼容问题）
    update(3, 'running')
    const appPath = `/opt/nezha/dashboard/${binName}`
    const svcLines = [
      '[Unit]',
      'Description=Nezha Dashboard',
      'After=network.target',
      '',
      '[Service]',
      'Type=simple',
      'WorkingDirectory=/opt/nezha/dashboard',
      `ExecStart=${appPath}`,
      'Restart=always',
      'RestartSec=5',
      '',
      '[Install]',
      'WantedBy=multi-user.target'
    ]
    const svcCmd = svcLines.map(l => `printf '%s\\n' '${l}' >> /etc/systemd/system/nezha-dashboard.service`).join(' && ') + ' && systemctl daemon-reload && systemctl enable nezha-dashboard && systemctl start nezha-dashboard && echo "SVC_DONE"'
    const r3 = await ssh(bookmark, svcCmd, 15000)
    if (!r3?.includes('SVC_DONE')) {
      console.error('[deploy] 服务启动失败:', r3)
      update(3, 'error')
      return { success: false, error: '服务启动失败，请检查 systemd 日志' }
    }
    // 开防火墙
    await ssh(bookmark, 'which ufw >/dev/null 2>&1 && ufw allow 8008/tcp 2>/dev/null; true', 5000)
    update(3, 'success')

    // Step 4: 等待服务就绪
    update(4, 'running')
    const waitCmd = 'for i in $(seq 1 30); do curl -s http://localhost:8008/api/v1/server >/dev/null 2>&1 && echo "READY" && break; sleep 2; done'
    const r4 = await ssh(bookmark, waitCmd, 90000)
    if (!r4?.includes('READY')) {
      const logs = await ssh(bookmark, 'journalctl -u nezha-dashboard --no-pager -n 20 2>/dev/null || echo "日志不可用"', 10000)
      console.error('[deploy] Dashboard 启动失败:', logs)
      update(4, 'error')
      return { success: false, error: 'Dashboard 启动超时，请检查服务器资源和服务日志' }
    }
    update(4, 'success')

    // Step 5: 创建用户 + JWT 签发 Token
    update(5, 'running')
    let apiToken = ''

    // 先读 JWT 密钥（Dashboard 正运行，配置里有密钥）
    const jwtSecret = await ssh(bookmark, `grep 'jwt_secret_key:' /opt/nezha/dashboard/data/config.yaml | head -1 | awk -F': ' '{print $2}' | tr -d '\\n'`, 10000)
    if (!jwtSecret || jwtSecret.trim().length < 10) {
      update(5, 'error')
      return { success: false, error: '无法读取 Dashboard JWT 密钥' }
    }

    // 停 Dashboard → 装 sqlite3 → 插入用户
    await ssh(bookmark, 'systemctl stop nezha-dashboard', 15000)
    await ssh(bookmark, '(apt-get install -y sqlite3 2>/dev/null || yum install -y sqlite 2>/dev/null || true)', 30000)
    const dbPath = await ssh(bookmark, `find /opt/nezha/dashboard/data/ -name "*.db" 2>/dev/null | head -1`, 5000)
    if (dbPath?.trim()) {
      await ssh(bookmark, `sqlite3 "${dbPath.trim()}" "DELETE FROM users; INSERT INTO users (username,password,role) VALUES ('admin@xnow.tech','jwt_bypass',1);" 2>&1`, 10000)
    }
    // 重启 Dashboard
    await ssh(bookmark, 'systemctl start nezha-dashboard && sleep 4', 15000)

    // 用 JWT 密钥签发 Token
    const jwt = await window.pre.runGlobalAsync('signNezhaJwt', jwtSecret.trim())
    const tokenResp = await ssh(bookmark, `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/api-tokens' -H 'Content-Type: application/json' -H 'Authorization: Bearer ${jwt}' -d '{"name":"xnow-terminal","scopes":["nezha:*"],"expires_in_days":3650}'`, 10000)
    if (tokenResp) {
      try { apiToken = JSON.parse(tokenResp)?.data?.token || '' } catch {}
      if (!apiToken) {
        update(5, 'error')
        return { success: false, error: `创建 Token 失败:\n${tokenResp}` }
      }
    }

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
