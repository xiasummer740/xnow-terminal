/**
 * ISSUES #24：安装要静默，不要弹 NSIS 向导
 *
 * 这条没法靠"读一眼代码"确认：真正决定弹不弹向导的是**传给 electron-updater 的参数**，
 * 而参数错了不会有任何报错，只是用户看到一个安装向导。
 * 所以这里把 electron-updater 换成一个假的，加载**真的** auto-updater.js，
 * 调它导出的 quitAndInstall，断言实际传出去的参数。
 *
 * 假包只记录调用，不碰 electron，也不联网。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const Module = require('module')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '../..')
const MODULE_PATH = resolve(ROOT, 'src/app/lib/auto-updater.js')

/** 用假的 electron-updater 加载真的 auto-updater.js，返回 {api, fake} */
function loadWithFake () {
  const fake = {
    autoDownload: null,
    autoInstallOnAppQuit: null,
    logger: null,
    handlers: {},
    quitAndInstallCalls: [],
    checkForUpdatesCalls: 0,
    downloadUpdateCalls: 0,
    on (name, fn) { this.handlers[name] = fn },
    checkForUpdates () { this.checkForUpdatesCalls++ },
    downloadUpdate () { this.downloadUpdateCalls++ },
    quitAndInstall (...args) { this.quitAndInstallCalls.push(args) }
  }

  const realLoad = Module._load
  Module._load = function (request) {
    if (request === 'electron-updater') {
      return { autoUpdater: fake }
    }
    return realLoad.apply(this, arguments)
  }
  try {
    delete require.cache[require.resolve(MODULE_PATH)]
    return { api: require(MODULE_PATH), fake }
  } finally {
    Module._load = realLoad
    delete require.cache[require.resolve(MODULE_PATH)]
  }
}

test('quitAndInstall 必须传 (true, true)：静默安装 + 装完拉起来', () => {
  const { api, fake } = loadWithFake()
  api.quitAndInstall()
  assert.equal(fake.quitAndInstallCalls.length, 1)
  // 不给参数时 electron-updater 用默认值 false —— NsisUpdater.doInstall 里
  // `if (isSilent) args.push('/S')`，于是不追加 /S，用户看到安装向导
  assert.deepEqual(
    fake.quitAndInstallCalls[0],
    [true, true],
    '第一个参数是 isSilent（不传就弹向导），第二个是 isForceRunAfter（装完自动启动）'
  )
})

test('autoInstallOnAppQuit 打开：下载完的更新在退出时静默装上', () => {
  const { fake } = loadWithFake()
  assert.equal(fake.autoInstallOnAppQuit, true)
})

test('autoDownload 保持关闭：下载由界面上的按钮触发，不在后台偷跑流量', () => {
  const { fake } = loadWithFake()
  assert.equal(fake.autoDownload, false)
})

test('导出面没有被改宽（渲染层只能通过既有的几个入口调）', () => {
  const { api } = loadWithFake()
  assert.deepEqual(
    Object.keys(api).sort(),
    ['checkForUpdates', 'downloadUpdate', 'quitAndInstall']
  )
})

test('ipc 暴露给渲染层的三个更新入口都还在、且不直接透传参数', () => {
  // 渲染层是这么调的：runGlobalAsync('autoUpdaterInstall') —— 不给参数，
  // 所以 isSilent 只能由主进程这边决定，泄漏不出去。
  const text = require('fs').readFileSync(resolve(ROOT, 'src/app/lib/ipc.js'), 'utf8')
  assert.match(text, /autoUpdaterCheck:/)
  assert.match(text, /autoUpdaterDownload:/)
  assert.match(text, /autoUpdaterInstall: \(\) => \{\s*autoUpdater\.quitAndInstall\(\)/)
})
