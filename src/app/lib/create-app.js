const { app } = require('electron')
const { createWindow } = require('./create-window')
const { packInfo, isDev } = require('../common/runtime-constants')
const { initCommandLine } = require('./command-line')
const globalState = require('./glob-state')
const { getUserConfigNoEnc, getDbConfig } = require('./get-config')
const { setupDeepLinkHandlers } = require('./deep-link')
const { handleSingleInstance } = require('./single-instance')
const log = require('../common/log')
const logger = require('./logger')

let conf = {}

// GPU error suggestion message
const GPU_ERROR_SUGGESTION = `
================================================================================
⚠️  检测到 GPU 进程错误
================================================================================
如果遇到 GPU 进程崩溃（exit_code=-2147483645 或类似值），
请尝试用以下任一参数启动 xnow-terminal：

  1. --no-sandbox          （推荐 —— 不使用沙箱运行）
  2. --disable-gpu        （禁用 GPU 渲染）
  3. --disable-gpu-sandbox （禁用 GPU 沙箱）
  4. --disable-hardware-acceleration （禁用硬件加速）

或设置环境变量：
  set DISABLE_GPU=1

示例：
  xnow-terminal.exe --no-sandbox
  或
  set DISABLE_GPU=1 && xnow-terminal.exe
================================================================================
`

// Handle GPU process crashes
app.on('gpu-process-crashed', (event, killed) => {
  log.error(`GPU 进程崩溃，已终止：${killed}`)
  log.error(GPU_ERROR_SUGGESTION)
})

// Handle render process gone events
app.on('render-process-gone', (event, webContents, details) => {
  if (details.reason === 'crashed' || details.reason === 'abnormal-exit') {
    log.error(`渲染进程已退出：${details.reason}`, details)
    log.error(GPU_ERROR_SUGGESTION)
  }
})

// Handle uncaught exceptions（崩溃日志 + 正式版也保留）
process.on('uncaughtException', (err) => {
  logger.error(err, 'uncaughtException')
  const errorMsg = err?.message || ''
  if (
    errorMsg.includes('GPU') ||
    errorMsg.includes('gpu') ||
    errorMsg.includes('graphics') ||
    errorMsg.includes('Vulkan') ||
    errorMsg.includes('DXGI')
  ) {
    log.error(GPU_ERROR_SUGGESTION)
  }
})

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason) => {
  logger.error(reason instanceof Error ? reason : new Error(String(reason)), 'unhandledRejection')
})

exports.createApp = async function () {
  // 开发模式使用独立数据目录，绝不碰安装版的数据
  if (isDev) {
    process.env.DATA_PATH = require('path').join(app.getPath('userData'), 'xnow-terminal-dev')
    log.info('[dev] 使用独立数据目录:', process.env.DATA_PATH)
  }

  app.setName(packInfo.name)
  // Handle GPU issues on Linux
  // On Linux, disable GPU for compatibility
  if (process.platform === 'linux' || process.env.DISABLE_GPU) {
    app.commandLine.appendSwitch('--disable-gpu')
  }
  if (process.platform === 'linux') {
    app.commandLine.appendSwitch('--enable-transparent-visuals')
    app.commandLine.appendSwitch('--in-process-gpu')
  }
  if (process.platform === 'linux' || process.env.DISABLE_HARDWARE_ACCELERATION) {
    app.disableHardwareAcceleration()
  }
  if (process.env.DISABLE_GPU_SANDBOX) {
    app.disableHardwareAcceleration()
    app.commandLine.appendSwitch('--disable-gpu')
    app.commandLine.appendSwitch('--disable-gpu-compositing')
    app.commandLine.appendSwitch('--disable-gpu-rasterization')
    app.commandLine.appendSwitch('--disable-gpu-sandbox')
    app.commandLine.appendSwitch('--disable-software-rasterizer')
    app.commandLine.appendSwitch('--use-gl', 'swiftshader')
  }
  // Handle proxy-related command-line arguments
  if (process.env.NO_PROXY_SERVER) {
    app.commandLine.appendSwitch('no-proxy-server')
  }
  if (process.env.PROXY_BYPASS_LIST) {
    app.commandLine.appendSwitch('proxy-bypass-list', process.env.PROXY_BYPASS_LIST)
  }
  if (process.env.PROXY_PAC_URL) {
    app.commandLine.appendSwitch('proxy-pac-url', process.env.PROXY_PAC_URL)
  }
  if (process.env.PROXY_SERVER) {
    app.commandLine.appendSwitch('proxy-server', process.env.PROXY_SERVER)
  }

  const progs = initCommandLine()
  const opts = progs?.options
  globalState.set('serverPort', opts?.serverPort)

  // --clear-config: 清除所有旧数据，全新启动
  if (opts?.clearConfig) {
    const { resolve } = require('path')
    const dataPath = resolve(app.getPath('appData'), 'xnow-terminal')
    const fs = require('fs')
    if (fs.existsSync(dataPath)) {
      fs.rmSync(dataPath, { recursive: true, force: true })
      log.info('[clear-config] 已清除旧配置数据:', dataPath)
    }
  }

  // 记录当前版本号（只追踪版本，不删除任何用户数据）
  if (app.isPackaged) {
    const path = require('path')
    const dataPath = path.resolve(app.getPath('appData'), 'xnow-terminal')
    const versionFile = path.resolve(dataPath, '.xnow-version')
    const currentVersion = packInfo.version
    try {
      require('fs').mkdirSync(dataPath, { recursive: true })
    } catch (_) {}
    try {
      require('fs').writeFileSync(versionFile, currentVersion, 'utf8')
    } catch (_) {}
  }

  const { allowMultiInstance = false } = await getUserConfigNoEnc()

  // Setup deep link handlers (open-url for macOS, etc.)
  setupDeepLinkHandlers()
  // Only request single instance lock if multi-instance is not allowed
  if (!allowMultiInstance) {
    // Use socket-based single instance lock for compatibility with Electron 22
    // where additionalData doesn't work in the second-instance event
    const isPrimaryInstance = await handleSingleInstance(progs)

    if (!isPrimaryInstance) {
      app.quit()
      return app
    }

    // Also use Electron's built-in lock as a fallback.
    // 返回值必须看：socket 连不上**不等于**我们独占 —— 也可能是握手被拒
    // （token 不一致，见 ISSUES #44）。丢掉返回值的话那种情况会开出第二个窗口。
    if (!app.requestSingleInstanceLock()) {
      app.quit()
      return app
    }
  }

  app.on('second-instance', (event, commandLine) => {
    const newWindowFlag = commandLine.includes('--new-window')
    if (newWindowFlag) {
      createWindow(conf)
      return
    }
    const win = globalState.get('win')
    if (win) {
      if (win.isMinimized()) {
        win.restore()
      }
      win.focus()
    }
  })
  app.whenReady().then(async () => {
    conf = await getDbConfig()
    createWindow(conf)
  })
  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (globalState.get('win') === null) {
      app.once('ready', () => createWindow(conf))
    }
  })
  return app
}
