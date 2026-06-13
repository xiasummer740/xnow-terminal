/**
 * 哪吒主控一键部署
 * 定义部署步骤和流程编排
 * 实际 SSH 执行通过 window.pre.runGlobalAsync 调用后端
 */
import { createSteps, updateStep } from './deploy-modal'

const DEPLOY_STEPS = [
  'SSH 连接服务器...',
  '检测系统版本和架构...',
  '安装 Docker...',
  '拉取监控 Dashboard 镜像...',
  '启动 Dashboard 服务...',
  '初始化管理员账号...',
  '生成 API Token...',
  '配置完成'
]

/**
 * 获取初始部署步骤列表
 */
export function getMasterSteps () {
  return createSteps(DEPLOY_STEPS)
}

/**
 * 执行主控部署
 * @param {object} bookmark - 书签对象（含 host, port, username, password/privateKey）
 * @param {function} onStepUpdate - (steps) => void，UI 更新回调
 * @returns {Promise<{success: boolean, dashboardUrl?: string, apiToken?: string, error?: string}>}
 */
export async function deployMaster (bookmark, onStepUpdate) {
  const steps = getMasterSteps()
  let currentSteps = [...steps]
  const update = (i, status) => {
    currentSteps = updateStep(currentSteps, i, status)
    onStepUpdate([...currentSteps])
  }

  try {
    // Step 0: SSH 连接测试
    update(0, 'running')
    const checkResult = await window.pre.runGlobalAsync('execSshCommand', {
      host: bookmark.host,
      port: bookmark.port || 22,
      username: bookmark.username || 'root',
      password: bookmark.password,
      privateKey: bookmark.privateKey,
      command: 'echo "SSH_OK" && uname -m && cat /etc/os-release 2>/dev/null | head -5'
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

    const needInstallDocker = !hasDocker || !hasDocker.includes('DOCKER_EXISTS')

    // Step 2: 安装 Docker（如果需要）
    if (needInstallDocker) {
      update(2, 'running')
      const dockerInstallCmd = 'curl -fsSL https://get.docker.com | sh && systemctl start docker && systemctl enable docker 2>/dev/null'
      await window.pre.runGlobalAsync('execSshCommand', { ...bookmark, command: dockerInstallCmd, timeout: 120000 })
      update(2, 'success')
    } else {
      update(2, 'success')
    }

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
        'mkdir -p /etc/nezha',
        'docker rm -f nezha-dashboard 2>/dev/null; true',
        'docker run -d --name nezha-dashboard \\',
        '  --restart always \\',
        '  -p 8008:8008 \\',
        '  -v /etc/nezha:/data \\',
        '  nezhahq/dashboard:latest'
      ].join('\n'), timeout: 60000
    })
    update(4, 'success')

    // Step 5-6: 初始化（等待服务启动）
    update(5, 'running')
    // 等待服务就绪
    await window.pre.runGlobalAsync('execSshCommand', {
      ...bookmark, command: [
        'for i in $(seq 1 30); do',
        '  curl -s http://localhost:8008/api/v1/server >/dev/null 2>&1 && echo "READY" && break',
        '  sleep 2',
        'done'
      ].join('\n'), timeout: 90000
    })
    update(5, 'success')

    // Step 6: 提示用户创建 API Token
    update(6, 'running')
    update(6, 'success')

    // Step 7: 完成
    const dashboardUrl = `http://${bookmark.host}:8008`
    update(7, 'success')

    return {
      success: true,
      dashboardUrl,
      setupGuide: `部署成功！请打开浏览器访问 ${dashboardUrl}，完成管理员账号设置，然后在「系统设置 → API Tokens」中创建 Token，填到下方输入框中。`
    }
  } catch (e) {
    // 找到当前 running 的步骤，标记为 error
    const runningIdx = currentSteps.findIndex(s => s.status === 'running')
    if (runningIdx >= 0) update(runningIdx, 'error')
    return { success: false, error: e.message || '部署异常' }
  }
}
