/**
 * ipc main
 */

const {
  ipcMain,
  app,
  BrowserWindow,
  dialog,
  powerMonitor,
  globalShortcut,
  shell,
} = require('electron')
const globalState = require('./glob-state')
const ipcSyncFuncs = require('./ipc-sync')
const { dbAction } = require('./db')
const { listItermThemes } = require('./iterm-theme')
const installSrc = require('./install-src')
const { getConfig } = require('./get-config')
const loadSshConfig = require('./ssh-config')
const { listWidgets, runWidget, stopWidget, runWidgetFunc } = require('../widgets/load-widget')
const { checkMigrate, migrate } = require('../migrate/migrate-1-to-2')
const { setPassword, checkPassword } = require('./auth')
const initServer = require('./init-server')
const { getLang, loadLocales } = require('./locales')
const { saveUserConfig } = require('./user-config-controller')
const { changeHotkeyReg, initShortCut } = require('./shortcut')
const lastStateManager = require('./last-state')
const {
  registerDeepLink,
  unregisterDeepLink,
  checkProtocolRegistration,
  getPendingDeepLink,
} = require('./deep-link')
const {
  packInfo,
  appPath,
  isWin,
  isMac,
  exePath,
  isPortable,
  sshKeysPath,
} = require('../common/app-props')
const { getScreenSize, maximize, unmaximize } = require('./window-control')
const { openFileWithEditor } = require('./open-file-with-editor')
const { loadFontList } = require('./font-list')
const { checkDbUpgrade, doUpgrade } = require('../upgrade')
const { listSerialPorts } = require('./serial-port')
const initApp = require('./init-app')
const { encryptAsync, decryptAsync } = require('./enc')
const { safeEncrypt, safeDecrypt } = require('./safe-storage')
const { initCommandLine } = require('./command-line')
const { watchFile, unwatchFile } = require('./watch-file')
const lookup = require('../common/lookup')
const { AIchat, AIchatWithTools, getStreamContent, stopStream } = require('./ai')

// Security: whitelist of safe environment variables for Linux/Mac/Windows
const SAFE_ENV_KEYS = [
  'SHELL',
  'TERM',
  'TERM_PROGRAM',
  'TERM_PROGRAM_VERSION',
  'COLORTERM',
  'LANG',
  'LC_ALL',
  'LC_CTYPE',
  'LC_TERMINAL',
  'LC_TERMINAL_VERSION',
  'HOME',
  'USER',
  'LOGNAME',
  'USERNAME',
  'PATH',
  'PATHEXT',
  'TMPDIR',
  'TMP',
  'TEMP',
  'DISPLAY',
  'WAYLAND_DISPLAY',
  'XDG_SESSION_TYPE',
  'XDG_RUNTIME_DIR',
  'XDG_DATA_DIRS',
  'XDG_CONFIG_DIRS',
  'XDG_CURRENT_DESKTOP',
  'XDG_SEAT',
  'XDG_VTNR',
  'SSH_AUTH_SOCK',
  'SSH_AGENT_PID',
  'SSH_CLIENT',
  'SSH_CONNECTION',
  'SSH_TTY',
  'NODE_PATH',
  'NODE_ENV',
  'NVM_DIR',
  'NVM_BIN',
  'NPM_CONFIG_PREFIX',
  'NPM_CONFIG_CACHE',
  'GIT_EDITOR',
  'GIT_PAGER',
  'GIT_TERMINAL_PROMPT',
  'EDITOR',
  'VISUAL',
  'PAGER',
  'HTTP_PROXY',
  'HTTPS_PROXY',
  'NO_PROXY',
  'http_proxy',
  'https_proxy',
  'no_proxy',
  'APPDATA',
  'LOCALAPPDATA',
  'ProgramFiles',
  'ProgramFiles(x86)',
  'CommonProgramFiles',
  'ComSpec',
  'SystemRoot',
  'SystemDrive',
  'USERPROFILE',
  'USERDOMAIN',
  'COMPUTERNAME',
  'NUMBER_OF_PROCESSORS',
  'PROCESSOR_ARCHITECTURE',
  'OS',
  'Apple_PubSub_Socket_Render',
  'DBUS_SESSION_BUS_ADDRESS',
  'DESKTOP_SESSION',
  'GNOME_DESKTOP_SESSION_ID',
  'KDE_FULL_SESSION',
  'CI',
  'DOCKER_HOST',
  'CONTAINER',
]

// ===== 安全工具函数 (AI Agent 文件操作/请求防护) =====
const { resolve: pathResolve } = require('path')

// 检测路径遍历攻击
const PATH_TRAVERSAL_RE = /(?:^|[\\/])\.\.[\\/]/

function isPathSafe(targetPath) {
  if (PATH_TRAVERSAL_RE.test(targetPath)) return false
  const resolved = pathResolve(targetPath)
  // 阻止访问系统敏感目录
  if (isWin) {
    const blocked = ['C:\\Windows\\', 'C:\\System32\\', 'C:\\Program Files\\', 'C:\\ProgramData\\']
    for (const p of blocked) {
      if (resolved.toLowerCase().startsWith(p.toLowerCase())) return false
    }
  } else {
    const blocked = ['/etc/', '/sys/', '/proc/', '/dev/', '/boot/', '/root/', '/var/']
    for (const p of blocked) {
      if (resolved.startsWith(p)) return false
    }
  }
  return true
}

// 检测内网/本地地址（防 SSRF）
function isPrivateHost(hostname) {
  const lower = hostname.toLowerCase()
  if (['localhost', '127.0.0.1', '::1', '[::1]', '0.0.0.0'].includes(lower)) return true
  const m = lower.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/)
  if (m) {
    const a = +m[1]
    const b = +m[2]
    if (a === 10) return true
    if (a === 192 && b === 168) return true
    if (a === 172 && b >= 16 && b <= 31) return true
    if (a === 127) return true
  }
  return false
}

async function initAppServer() {
  const { config } = await getConfig(globalState.get('serverInited'))
  const { langs, sysLocale } = await loadLocales()
  const language = getLang(config, sysLocale, langs)
  config.language = language
  if (!globalState.get('serverInited')) {
    const child = await initServer(
      config,
      {
        ...process.env,
        appPath,
        sshKeysPath,
      },
      sysLocale,
    )
    child.on('message', (m) => {
      if (m && m.showFileInFolder) {
        if (!isMac) {
          shell.showItemInFolder(m.showFileInFolder)
        }
      }
      if (m && m.quitAndInstall) {
        // 延迟退出，让 WebSocket 消息先发送到客户端
        setTimeout(() => app.quit(), 1500)
      }
    })
    globalState.set('serverInited', true)
  }
  globalState.set('config', config)
}

function initIpc() {
  powerMonitor.on('resume', () => {
    globalState.get('win').webContents.send('power-resume', null)
  })
  async function init() {
    const { langs, langMap } = await loadLocales()
    const config = globalState.get('config')
    const globs = {
      config,
      langs,
      langMap,
      installSrc,
      appPath,
      exePath,
      isPortable,
    }
    initApp(langMap, config)
    initShortCut(globalShortcut, globalState.get('win'), config)
    return globs
  }

  ipcMain.on('sync-func', (event, { name, args }) => {
    event.returnValue = ipcSyncFuncs[name](...args)
  })
  const asyncGlobals = {
    getDrives: () => {
      const { execSync } = require('child_process')
      try {
        const out = execSync(
          'powershell -c "Get-PSDrive -PSProvider FileSystem | Select-Object -ExpandProperty Root"',
          { encoding: 'utf8', timeout: 5000 },
        )
        return out
          .split(/\r?\n/)
          .map((l) => l.trim())
          .filter((l) => /^[A-Z]:\\$/i.test(l))
      } catch {
        return []
      }
    },
    confirmExit: () => {
      globalState.set('confirmExit', true)
    },
    setPassword,
    checkPassword,
    lookup,
    loadSshConfig,
    init,
    listSerialPorts,
    loadFontList,
    doUpgrade,
    checkDbUpgrade,
    checkMigrate,
    migrate,
    getExitStatus: () => globalState.get('exitStatus'),
    setExitStatus: (status) => {
      globalState.set('exitStatus', status)
    },
    encryptAsync,
    decryptAsync,
    safeEncrypt: (str) => safeEncrypt(str),
    safeDecrypt: (str) => safeDecrypt(str),
    dbAction,
    getScreenSize,
    closeApp: (closeAction = '') => {
      globalState.set('closeAction', closeAction)
      const win = globalState.get('win')
      win && win.close()
    },
    exit: () => {
      const win = globalState.get('win')
      win && win.close()
    },
    restart: (closeAction = '') => {
      globalState.set('closeAction', '')
      globalState.get('win').close()
      app.relaunch()
    },
    setCloseAction: (closeAction = '') => {
      globalState.set('closeAction', closeAction)
    },
    minimize: () => {
      globalState.get('win').minimize()
    },
    listItermThemes,
    maximize,
    unmaximize,
    openDevTools: () => {
      globalState.get('win').webContents.openDevTools()
    },
    setWindowSize: (update) => {
      lastStateManager.set('windowSize', update)
    },
    saveUserConfig,
    AIchat,
    AIchatWithTools,
    getStreamContent,
    stopStream,
    setTitle: (title) => {
      const win = globalState.get('win')
      win && win.setTitle(packInfo.name + ' - ' + title)
    },
    setBackgroundColor: (color = '#33333300') => {
      const win = globalState.get('win')
      win && win.setBackgroundColor(color)
    },
    changeHotkey: changeHotkeyReg(globalShortcut, globalState.get('win')),
    initCommandLine,
    watchFile,
    unwatchFile,
    openFileWithEditor,
    listWidgets,
    runWidget,
    stopWidget,
    runWidgetFunc,
    registerDeepLink,
    unregisterDeepLink,
    checkProtocolRegistration,
    getPendingDeepLink,
    getEnv: (key) => {
      if (key) {
        return SAFE_ENV_KEYS.includes(key) ? process.env[key] : ''
      }
      return Object.fromEntries(
        SAFE_ENV_KEYS.filter((k) => process.env[k] !== undefined).map((k) => [k, process.env[k]]),
      )
    },
    // ===== 文件系统工具 (AI Agent) =====
    readLocalFile: async (filePath) => {
      try {
        if (!isPathSafe(filePath)) return JSON.stringify({ error: '路径不允许' })
        const fs = require('fs')
        const stat = fs.statSync(filePath)
        if (!stat.isFile()) return JSON.stringify({ error: '不是文件' })
        if (stat.size > 1048576) return JSON.stringify({ error: '文件超过1MB，请用终端命令' })
        return JSON.stringify({
          content: fs.readFileSync(filePath, 'utf-8'),
          size: stat.size,
          path: filePath,
        })
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    },
    writeLocalFile: async (filePath, content) => {
      try {
        if (!isPathSafe(filePath)) return JSON.stringify({ error: '路径不允许' })
        const fs = require('fs'),
          path = require('path')
        fs.mkdirSync(path.dirname(filePath), { recursive: true })
        fs.writeFileSync(filePath, content, 'utf-8')
        return JSON.stringify({
          success: true,
          path: filePath,
          bytes: Buffer.byteLength(content, 'utf-8'),
        })
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    },
    listDirectory: async (dirPath) => {
      try {
        if (!isPathSafe(dirPath)) return JSON.stringify({ error: '路径不允许' })
        const fs = require('fs'),
          path = require('path')
        const items = fs.readdirSync(dirPath, { withFileTypes: true })
        return JSON.stringify({
          path: dirPath,
          items: items.map((i) => ({
            name: i.name,
            type: i.isDirectory() ? 'dir' : 'file',
            size: i.isFile() ? fs.statSync(path.join(dirPath, i.name)).size : 0,
          })),
        })
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    },
    grepFiles: async (rootPath, pattern, glob = '*') => {
      try {
        if (!isPathSafe(rootPath)) return JSON.stringify({ error: '路径不允许' })
        const { execFileSync } = require('child_process')
        const grepArgs = ['-rn']
        if (glob && glob !== '*') grepArgs.push('--include', glob)
        grepArgs.push('-e', pattern, rootPath)
        const output = execFileSync('grep', grepArgs, {
          maxBuffer: 2097152,
          timeout: 15000,
          encoding: 'utf8',
          windowsHide: true,
        })
        const lines = output.split('\n').filter(Boolean)
        return JSON.stringify({ total: lines.length, results: lines.slice(0, 200).join('\n') })
      } catch (e) {
        if (e.status === 1) return JSON.stringify({ total: 0, results: '' })
        return JSON.stringify({ error: e.message })
      }
    },
    webFetchPage: async (url) => {
      try {
        const parsed = new URL(url)
        if (isPrivateHost(parsed.hostname)) {
          return JSON.stringify({ error: '不允许访问内网地址' })
        }
        const http = url.startsWith('https') ? require('https') : require('http')
        return new Promise((r) => {
          const req = http.get(
            url,
            { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } },
            (res) => {
              let d = ''
              res.on('data', (c) => {
                d += c
                if (d.length > 500000) {
                  req.destroy()
                  r(JSON.stringify({ error: '响应过大截断', preview: d.slice(0, 500000) }))
                }
              })
              res.on('end', () =>
                r(JSON.stringify({ status: res.statusCode, content: d.slice(0, 100000) })),
              )
            },
          )
          req.on('error', (e) => r(JSON.stringify({ error: e.message })))
          req.on('timeout', function () {
            this.destroy()
            r(JSON.stringify({ error: '请求超时' }))
          })
        })
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    },
    // ===== 书签备份工具 =====
    exportAllBookmarks: async () => {
      try {
        const { dbAction } = require('./db')
        const bookmarks = await dbAction('bookmarks', 'find')
        const bookmarkGroups = await dbAction('bookmarkGroups', 'find')
        const backup = {
          version: 1,
          exportedAt: new Date().toISOString(),
          totalBookmarks: bookmarks.length,
          bookmarks,
          bookmarkGroups,
        }
        return JSON.stringify(backup)
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    },
    importBookmarks: async (jsonStr) => {
      try {
        const data = JSON.parse(jsonStr)
        if (!data.bookmarks || !Array.isArray(data.bookmarks)) {
          return JSON.stringify({ error: '备份文件格式无效' })
        }
        for (const bm of data.bookmarks) {
          await dbAction('bookmarks', 'insert', bm)
        }
        for (const g of data.bookmarkGroups || []) {
          await dbAction('bookmarkGroups', 'insert', g)
        }
        return JSON.stringify({ success: true, total: data.bookmarks.length })
      } catch (e) {
        return JSON.stringify({ error: e.message })
      }
    },
  }
  ipcMain.handle('async', (event, { name, args }) => {
    return asyncGlobals[name](...args)
  })
  ipcMain.handle('show-open-dialog-sync', async (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return dialog.showOpenDialogSync(win, ...args)
  })
  ipcMain.handle('show-save-dialog', async (event, ...args) => {
    const win = BrowserWindow.fromWebContents(event.sender)
    return dialog.showSaveDialog(win, ...args)
  })
}

exports.initIpc = initIpc
exports.initAppServer = initAppServer
