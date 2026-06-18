const {
  BrowserWindow
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
    title: isDev ? 'XNOW 开发版' : 'XNOW',
    frame: true,
    transparent: false,
    backgroundColor: '#0a0e1a',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false,
      preload: resolve(__dirname, '../preload/preload.js'),
      webviewTag: true,
      devTools: !userConfig.disableDeveloperTool,
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
  const opts = `http://127.0.0.1:${port}/index.html?v=${packInfo.version}`
  // If loading the URL fails (e.g. proxy/firewall interference), show error page
  win.webContents.once('did-fail-load', function (event, errorCode, errorDescription) {
    console.error('加载应用页面失败:', errorCode, errorDescription)
    const htmlContent = require('./error-page')(port)
    const dataUrl = 'data:text/html;charset=utf-8,' + encodeURIComponent(htmlContent)
    win.loadURL(dataUrl)
  })
  win.loadURL(opts)
  win.webContents.once('dom-ready', function () {
    // 已禁用开发者工具自动打开
    // if (isDev && !userConfig.disableDeveloperTool) {
    //   win.webContents.openDevTools()
    // }
    win.on('unmaximize', function () {
      var bounds = win.getBounds()
      if (bounds.width < minWindowWidth || bounds.height < minWindowHeight) {
        win.setBounds({
          x: 0,
          y: 0,
          width: minWindowWidth,
          height: minWindowHeight
        })
        win.center()
      }
    })
    win.on('resize', _.debounce(function () {
      if (!win.isMaximized()) {
        globalState.set('oldRectangle', win.getBounds())
      }
    }, 200))
    win.on('move', _.debounce(function () {
      var bounds = win.getBounds()
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
