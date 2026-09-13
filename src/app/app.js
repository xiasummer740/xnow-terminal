/**
 * app entry
 */
const log = require('./common/log')
const globalState = require('./lib/glob-state')

globalState.set('initTime', Date.now())

log.debug('electron 启动')

// --clear-config 必须赶在下面 require('./lib/create-app') **之前**（ISSUES #40）。
// 那条 require 链（create-app → get-config → db → sqlite）在模块加载时就会打开
// xnow.db / xnow_data.db 的句柄，而 Windows 上删不掉被打开的文件。
// clearConfigIfRequested 内部自己解析命令行，没带这个参数时什么都做，开销是一次 require。
const { clearConfigIfRequested } = require('./lib/clear-config')
clearConfigIfRequested()

// 开发模式切独立数据目录，同样必须赶在上面那条 require 链**之前**（ISSUES #65）——
// 链里的 app-props.js / nedb.js / sqlite.js 在模块加载时就把数据目录算好了，
// 放晚了（原来在 create-app.js 里）等于没改。dev 的目录不存在时会把安装版那份复制过来。
const { setupDevDataPath } = require('./lib/dev-data-path')
setupDevDataPath()

const { createApp } = require('./lib/create-app')

const app = createApp()
globalState.set('app', app)
