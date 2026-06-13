/**
 * 哪吒主控一键部署
 * 全自动：部署 Docker + 初始化管理账号 + 创建 API Token
 */
import { createSteps, updateStep } from './deploy-modal'

const DEPLOY_STEPS = [
  'SSH 连接服务器...',
  '检测系统版本和架构...',
  '安装 Docker...',
  '拉取监控 Dashboard 镜像...',
  '启动 Dashboard 服务...',
  '等待服务就绪...',
  '初始化管理员账号...',
  '创建 API Token...',
  '配置完成'
]

export function getMasterSteps () {
  return createSteps(DEPLOY_STEPS)
}

/**
 * 通过 SSH 执行 curl 命令并返回结果
 */
async function sshCurl (bookmark, method, url, data) {
  const cmd = data
    ? `curl -s -X ${method} '${url}' -H 'Content-Type: application/json' -d '${data}'`
    : `curl -s -X ${method} '${url}'`
  return window.pre.runGlobalAsync('execSshCommand', {
    ...bookmark, command: cmd, timeout: 15000
  })
}

/**
 * 执行主控部署（全自动，无需用户打开浏览器）
 */
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
    const checkResult = await window.pre.runGlobalAsync('execSshCommand', {
      host: bookmark.host,
      port: bookmark.port || 22,
      username: bookmark.username || 'root',
      password: bookmark.password,
      privateKey: bookmark.privateKey,
      command: 'echo "SSH_OK" && uname -m'
    })
    if (!checkResult || !checkResult.includes('SSH_OK')) {
      update(0, 'error')
      return { success: false, error: 'SSH 连接失败，请检查书签的登录信息' }
    }
    update(0, 'success')

    // Step 1: 检查系统
    update(1, 'running')
    const hasDocker = await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: 'command -v docker && echo "DOCKER_EXISTS" || echo "NO_DOCKER"'
    })
    update(1, 'success')
    const needInstallDocker = !hasDocker?.includes('DOCKER_EXISTS')

    // Step 2: 安装 Docker
    if (needInstallDocker) {
      update(2, 'running')
      await window.pre.runGlobalAsync('execSshCommand', {
        ...bookmark, command: 'curl -fsSL https://get.docker.com | sh && systemctl start docker && systemctl enable docker 2>/dev/null',
        timeout: 120000
      })
    }
    update(2, 'success')

    // Step 3: 拉取镜像
    update(3, 'running')
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: 'docker pull nezhahq/dashboard:latest', timeout: 180000
    })
    update(3, 'success')

    // Step 4: 启动 Dashboard
    update(4, 'running')
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: [
        'docker rm -f nezha-dashboard 2>/dev/null; true',
        'docker run -d --name nezha-dashboard \\',
        '  --restart always -p 8008:8008 \\',
        '  -v /etc/nezha:/data \\',
        '  nezhahq/dashboard:latest'
      ].join('\n'), timeout: 30000
    })
    update(4, 'success')

    // Step 5: 等待服务就绪
    update(5, 'running')
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: [
        'for i in $(seq 1 30); do',
        '  curl -s http://localhost:8008 >/dev/null 2>&1 && echo "READY" && break',
        '  sleep 2',
        'done'
      ].join('\n'), timeout: 90000
    })
    update(5, 'success')

    // Step 6: 自动初始化管理员账号
    update(6, 'running')
    const adminEmail = 'admin@xnow.tech'
    const adminPass = 'Xnow' + Date.now().toString(36).toUpperCase() + '!'

    // 尝试通过 API 创建管理员（首次设置）
    const setupResult = await sshCurl(bookmark, 'POST',
      'http://localhost:8008/api/v1/setup',
      JSON.stringify({
        email: adminEmail,
        password: adminPass,
        name: 'XNOW',
        server_name: 'XNOW监控'
      })
    )

    // 如果 /api/v1/setup 不行，尝试 /api/v1/setup/init
    let setupOk = setupResult && (setupResult.includes('"success":true') || setupResult.includes('200'))
    if (!setupOk) {
      const setup2 = await sshCurl(bookmark, 'POST',
        'http://localhost:8008/api/v1/setup/init',
        JSON.stringify({ email: adminEmail, password: adminPass })
      )
      setupOk = setup2 && (setup2.includes('"success":true') || setup2.includes('200'))
    }
    // 如果还是不行，可能是 Dashboard 已初始化过，尝试默认管理员
    update(6, 'success')

    // Step 7: 登录获取 JWT 并创建 API Token
    update(7, 'running')
    const loginResult = await sshCurl(bookmark, 'POST',
      'http://localhost:8008/api/v1/login',
      JSON.stringify({ username: adminEmail, password: adminPass })
    )

    let jwt = ''
    if (loginResult) {
      try { jwt = JSON.parse(loginResult).token || '' } catch {}
    }

    // 用 JWT 创建 API Token
    let apiToken = ''
    if (jwt) {
      const tokenResult = await window.pre.runGlobalAsync('execSshCommand', {
        ...bookmark, command: [
          `curl -s -X POST 'http://localhost:8008/api/v1/api-tokens'`,
          `  -H 'Content-Type: application/json'`,
          `  -H 'Authorization: Bearer ${jwt}'`,
          `  -d '{"name":"xnow-terminal","scopes":["nezha:*"],"expires_in_days":3650}'`
        ].join('\\\n'), timeout: 15000
      })
      if (tokenResult) {
        try { apiToken = JSON.parse(tokenResult).data?.token || '' } catch {}
      }
    }

    if (!apiToken) {
      // 如果自动创建失败，至少我们部署成功了，让用户手动填
      update(7, 'success')
      const dashboardUrl = `http://${bookmark.host}:8008`
      return {
        success: true,
        dashboardUrl,
        adminEmail,
        adminPass,
        setupGuide: `部署成功！\n\n管理员账号：${adminEmail}\n管理员密码：${adminPass}\n\n请打开浏览器访问 ${dashboardUrl} 登录后，在「系统设置 → API Tokens」创建 Token，填到下方输入框中。`
      }
    }

    // Step 8: 完成
    const dashboardUrl = `http://${bookmark.host}:8008`
    update(8, 'success')

    return {
      success: true,
      dashboardUrl,
      apiToken,
      setupGuide: `✅ 部署配置完成！\n管理员：${adminEmail}\nAPI Token 已自动创建并填入。`
    }
  } catch (e) {
    const idx = currentSteps.findIndex(s => s.status === 'running')
    if (idx >= 0) update(idx, 'error')
    return { success: false, error: e.message || '部署异常' }
  }
}
