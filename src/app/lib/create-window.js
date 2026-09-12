const {
  BrowserWindow,
  app
} = require('electron')
const { resolve } = require('path')
const {
  isDev, packInfo, iconPath, isMac,
  minWindowWidth, minWindowHeight
} = require('../common/runtime-constants')
const defaults = require('../common/default-setting')
const {
  getWindowSize,
  setWindowPos
} = require('./window-control')
const { onClose } = require('./on-close')
const { initIpc, initAppServer } = require('./ipc')
const { disableShortCuts } = require('./key-bind')
const _ = require('./lodash.js')
const getPort = require('./get-port')
const globalState = require('./glob-state')
const webviewHandler = require('./webview-handler')
const { safeOpenExternal } = require('./safe-open-external')

/**
 * 这是不是「非正式版」（开发版 / E2E 测试版）。
 *
 * 判据用 app.isPackaged，**不能用 isDev** —— isDev 是 `NODE_ENV === 'development'`，
 * 而 E2E 根本不设 NODE_ENV（见 test/e2e/common/app-options.js），
 * 于是跑测试弹出来的窗口 isDev=false：标题跟正式版一模一样，
 * 标题栏又因为 useSystemTitleBar 默认为 false 而整个隐藏掉、连标题都看不见。
 *
 * 后果是实打实的：2026-09-12 祥哥把我跑 E2E 弹出的窗口当成了自己的程序，
 * 来报「左侧面板全是英文」。两边其实是同一份代码同一个配置，
 * 区别只在那个窗口跑在 en_us 下。
 *
 * 只要不是打包产物就算非正式版 —— 覆盖 `npm start` 和 `npm run test1/2/3` 两条路径。
 */
const isDevBuild = !app.isPackaged

exports.createWindow = async function (userConfig) {
  globalState.set('closeAction', 'closeApp')
  globalState.set('requireAuth', !!userConfig.hashedPassword)
  const { width, height, x, y } = await getWindowSize()
  const { useSystemTitleBar = defaults.useSystemTitleBar } = userConfig
  const win = new BrowserWindow({
    width,
    height,
    x,
    y,
    fullscreenable: true,
    minWidth: minWindowWidth,
    minHeight: minWindowHeight,
    // 标题栏默认 hidden 看不见，但任务栏 / Alt+Tab 列表读的就是这个 title，
    // 所以这里仍要区分，别退回 isDev。
    title: isDevBuild ? 'XNOW 开发版' : 'XNOW',
    frame: true,
    transparent: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      preload: resolve(__dirname, '../preload/preload.js'),
      webviewTag: true,
      devTools: isDev ? true : !userConfig.disableDeveloperTool,
      spellcheck: false
    },
    titleBarStyle: useSystemTitleBar ? 'default' : 'hidden',
    icon: iconPath
  })
  // hides the traffic lights
  if (isMac) {
    win.setWindowButtonVisibility(true)
  }

  win.webContents.session.setSpellCheckerDictionaryDownloadURL('https://00.00/')

  // 内容安全策略（CSP），防御 XSS 攻击
  // 注意：webview 加载外部页面不受此 CSP 影响（独立进程）
  win.webContents.session.webRequest.onHeadersReceived(function (details, callback) {
    // eslint-disable-next-line n/no-callback-literal
    callback({
      responseHeaders: Object.assign({}, details.responseHeaders, {
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
          "style-src 'self' 'unsafe-inline'; " +
          "connect-src 'self' ws: http://127.0.0.1:*; " +
          "img-src 'self' data: blob:; " +
          "font-src 'self' data:; " +
          "frame-src 'self' http: https:; " +
          "media-src 'self' data: blob:;"
        ]
      })
    })
  })

  webviewHandler.init(win)

  globalState.set('win', win)

  await initAppServer()
  initIpc()
  const port = isDev
    ? process.env.devPort || 5570
    : await getPort()
  // devBuild=1 让渲染进程知道该显示「开发版」角标。
  // 走 URL 参数而不是 preload：这里加的只是展示用标志，
  // 不值得为它在 preload 上多开一条 contextBridge 通道。
  const opts = `http://127.0.0.1:${port}/index.html?v=${packInfo.version}${isDevBuild ? '&devBuild=1' : ''}`

  // ===== 导航闸门（ISSUES #1）=====
  // 主窗口只允许停在应用自身页面，其余一律拦下并交给系统浏览器。
  // 不拦的后果：AI 输出里的外链是裸 <a href>（ReactMarkdown 默认渲染），
  // 用户一点整个窗口就导航到对方站点，而 preload 会重新注入到那个页面 ——
  // 对方页面的 JS 即可通过 IPC 桥（window.api.runGlobalAsync）读写本机文件、起进程 → RCE。
  const appOrigin = new URL(opts).origin
  const isAppUrl = (url) => {
    try {
      return new URL(url).origin === appOrigin
    } catch (e) {
      return false
    }
  }
  const guardNavigation = (event, url) => {
    if (isAppUrl(url)) {
      return
    }
    event.preventDefault()
    safeOpenExternal(url)
  }
  win.webContents.on('will-navigate', guardNavigation)
  // will-navigate 不覆盖服务端重定向，这条要单独接
  win.webContents.on('will-redirect', guardNavigation)
  // window.open / target=_blank 走的是另一条路，不是 will-navigate
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!isAppUrl(url)) {
      safeOpenExternal(url)
    }
    return { action: 'deny' }
  })

  // If loading the URL fails (e.g. proxy/firewall interference), show error page
  win.webContents.once('did-fail-load', function (event, errorCode, errorDescription) {
    console.error('加载应用页面失败:', errorCode, errorDescription)
    const htmlContent = require('./error-page')(port)
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent)
    win.loadURL(dataUrl)
  })
  win.loadURL(opts)
  win.webContents.once('dom-ready', function () {
    // 开发版自动打开开发者工具（方便调试）
    if (isDev) {
      setTimeout(() => win.webContents.openDevTools({ mode: 'detach' }), 1000)
    }
    win.on('unmaximize', function () {
      const bounds = win.getBounds()
      if (bounds.width < minWindowWidth || bounds.height < minWindowHeight) {
        win.setBounds({
          x: 0,
          y: 0,
          width: minWindowWidth,
          height: minWindowHeight
        })
        win.center()
      }
      try { win.webContents.send('window-state-change', { isMaximized: false }) } catch {}
    })
    win.on('maximize', function () {
      try { win.webContents.send('window-state-change', { isMaximized: true }) } catch {}
    })
    win.on('resize', _.debounce(function () {
      if (!win.isMaximized()) {
        globalState.set('oldRectangle', win.getBounds())
      }
    }, 200))
    win.on('move', _.debounce(function () {
      const bounds = win.getBounds()
      setWindowPos({ x: bounds.x, y: bounds.y })
    }, 100))

    win.on('focus', function () {
      win.webContents.send('focused', null)
    })
    win.on('blur', function () {
      win.webContents.send('blur', null)
    })
    disableShortCuts(win)
  })
  win.on('close', onClose)
}
