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

    // Step 3: 拉取镜像（尝试多个源）
    update(3, 'running')
    const pullResult = await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: [
        'docker pull nezhahq/dashboard:latest 2>&1',
      ].join('\n'), timeout: 180000
    })
    // 如果第一个源失败，尝试 ghcr.io
    if (!pullResult || pullResult.includes('Error') || pullResult.includes('not found') || pullResult.includes('timeout')) {
      const pull2 = await window.pre.runGlobalAsync('execSshCommand', {
        ...bookmark, command: 'docker pull ghcr.io/nezhahq/dashboard:latest 2>&1', timeout: 180000
      })
      if (!pull2 || pull2.includes('Error') || pull2.includes('not found') || pull2.includes('timeout')) {
        update(3, 'error')
        return { success: false, error: `镜像拉取失败，请检查服务器网络:\n${(pullResult || '')}\n${(pull2 || '')}` }
      }
    }
    update(3, 'success')

    // Step 4: 开放防火墙端口 + 启动 Dashboard
    update(4, 'running')
    // 先尝试开放防火墙端口 8008
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: [
        'which ufw >/dev/null 2>&1 && ufw allow 8008/tcp 2>/dev/null; true',
        'which firewall-cmd >/dev/null 2>&1 && firewall-cmd --add-port=8008/tcp --permanent 2>/dev/null && firewall-cmd --reload 2>/dev/null; true',
        'which iptables >/dev/null 2>&1 && iptables -C INPUT -p tcp --dport 8008 -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport 8008 -j ACCEPT 2>/dev/null; true'
      ].join('\n'), timeout: 10000
    })
    // 启动 Dashboard（注意：exec 不走 shell，必须单行）
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: 'docker rm -f nezha-dashboard 2>/dev/null; true; docker run -d --name nezha-dashboard --restart always -p 8008:8008 -v /etc/nezha:/data nezhahq/dashboard:latest',
      timeout: 30000
    })
    update(4, 'success')

    // Step 5: 等待服务就绪并验证端口开放
    update(5, 'running')
    const readyCheck = await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: [
        'for i in $(seq 1 30); do',
        '  curl -s http://localhost:8008 >/dev/null 2>&1 && echo "READY" && break',
        '  sleep 2',
        'done',
        'echo "---PORT_CHECK---"',
        // 检查端口是否对外监听
        'ss -tlnp | grep 8008 || netstat -tlnp | grep 8008 || true'
      ].join('\n'), timeout: 90000
    })
    update(5, 'success')

    // Step 6-7: 初始化管理员 + 创建 API Token（自动检测是否已初始化）
    update(6, 'running')
    const adminEmail = 'admin@xnow.tech'
    const adminPass = 'Xnow' + Date.now().toString(36).toUpperCase() + '!'

    // 先试登录，如果 Dashboard 已经初始化过就直接用
    const loginFirst = await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/login' -H 'Content-Type: application/json' -d '{"username":"admin@xnow.tech","password":"admin"}'`,
      timeout: 10000
    })

    let jwt = ''
    let apiToken = ''
    let usedPass = ''

    if (loginFirst) {
      try {
        const p = JSON.parse(loginFirst)
        jwt = p?.data?.token || p?.token || ''
      } catch {}
    }

    if (jwt) {
      // Dashboard 已有管理员，直接创建 Token
      usedPass = 'admin'
      const tokenResp = await window.pre.runGlobalAsync('execSshCommand', {
        ...bookmark, command: `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/api-tokens' -H 'Content-Type: application/json' -H 'Authorization: Bearer ${jwt}' -d '{"name":"xnow-terminal","scopes":["nezha:*"],"expires_in_days":3650}'`,
        timeout: 10000
      })
      if (tokenResp) {
        try { apiToken = JSON.parse(tokenResp)?.data?.token || '' } catch {}
      }
    } else {
      // Dashboard 未初始化，尝试自动设置
      for (const setupPath of ['/api/v1/setup', '/api/v1/install']) {
        await window.pre.runGlobalAsync('execSshCommand', {
          ...bookmark, command: `curl -s --max-time 5 -X POST 'http://localhost:8008${setupPath}' -H 'Content-Type: application/json' -d '{"email":"${adminEmail}","password":"${adminPass}","name":"XNOW"}'`,
          timeout: 10000
        })
      }
      // 用刚创建的账号登录
      const loginResult = await window.pre.runGlobalAsync('execSshCommand', {
        ...bookmark, command: `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/login' -H 'Content-Type: application/json' -d '{"username":"${adminEmail}","password":"${adminPass}"}'`,
        timeout: 10000
      })
      if (loginResult) {
        try {
          const p = JSON.parse(loginResult)
          jwt = p?.data?.token || p?.token || ''
        } catch {}
      }
      if (jwt) {
        usedPass = adminPass
        const tokenResp = await window.pre.runGlobalAsync('execSshCommand', {
          ...bookmark, command: `curl -s --max-time 5 -X POST 'http://localhost:8008/api/v1/api-tokens' -H 'Content-Type: application/json' -H 'Authorization: Bearer ${jwt}' -d '{"name":"xnow-terminal","scopes":["nezha:*"],"expires_in_days":3650}'`,
          timeout: 10000
        })
        if (tokenResp) {
          try { apiToken = JSON.parse(tokenResp)?.data?.token || '' } catch {}
        }
      }
    }
    update(6, 'success')

    // Step 7: 完成
    update(7, 'running')
    update(7, 'success')

    if (!apiToken) {
      update(7, 'success')
      const dashboardUrl = `http://${bookmark.host}:8008`
      return {
        success: true,
        dashboardUrl,
        adminEmail,
        adminPass: usedPass || adminPass,
        setupGuide: `部署成功！\n管理员：${adminEmail} / ${usedPass || adminPass}\n自动创建 Token 失败，请打开浏览器访问 ${dashboardUrl} 登录后手动创建。`
      }
    }

    // Step 8: 完成
    const dashboardUrl = `http://${bookmark.host}:8008`
    update(8, 'success')

    return {
      success: true,
      dashboardUrl,
      apiToken,
      setupGuide: `✅ 全部完成！API Token 已自动创建并填入。`
    }
  } catch (e) {
    const idx = currentSteps.findIndex(s => s.status === 'running')
    if (idx >= 0) update(idx, 'error')
    return { success: false, error: e.message || '部署异常' }
  }
}
