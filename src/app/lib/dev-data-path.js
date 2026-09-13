/**
 * 开发模式的数据目录隔离（ISSUES #65）。
 *
 * 这段逻辑原来写在 create-app.js 里，给 process.env.DATA_PATH 赋值 —— 但那句话
 * **从来没生效过**：读 DATA_PATH 的 app-props.js / nedb.js / sqlite.js / storage-key.js
 * 全都在 create-app 的 require 链里、都在那句赋值之前就把目录算完了。
 * 结果是开发版和安装版一直读写同一份 users/，唯一的作用是一行会误导人的日志
 * （`[dev] 使用独立数据目录: ...`，打印的目录根本不存在）。
 *
 * 现在挪到 app.js 顶部、require('./lib/create-app') **之前**调用 —— 和 clear-config.js
 * 同一个位置、同一个理由：晚了就改不动了。
 */

const { app } = require('electron')
const { resolve } = require('path')
const { existsSync, mkdirSync, cpSync } = require('fs')
const { isDev } = require('../common/runtime-constants')
const log = require('../common/log')

const PROD_DIR_NAME = 'xnow-terminal'
const DEV_DIR_NAME = 'xnow-terminal-dev'

/**
 * 切到独立的数据目录。只在开发模式、且调用方没有自己指定 DATA_PATH 时生效
 * （指定了就以调用方为准，测试/临时环境要靠它指路）。
 */
exports.setupDevDataPath = function () {
  if (!isDev || process.env.DATA_PATH) {
    return
  }
  const appData = app.getPath('appData')
  const devPath = resolve(appData, DEV_DIR_NAME)
  const prodUsers = resolve(appData, PROD_DIR_NAME, 'users')
  const devUsers = resolve(devPath, 'users')

  // 首次启动：把安装版的**真数据**整份复制过来，开发版才不会一打开就是空的
  // （书签 / SSH 主机 / 主题 / 设置全没有，看着像数据丢了）。
  // 只复制 users/ —— 那才是数据，约 1M；Cache / GPUCache / logs 是 Electron 自己的
  // userData 垃圾，复制过来白占十几兆。安装版原目录一个字节都不动。
  // 只有 dev 目录还不存在时才复制，之后每次启动都走自己的数据，不会再被覆盖。
  if (!existsSync(devPath) && existsSync(prodUsers)) {
    try {
      mkdirSync(devPath, { recursive: true })
      cpSync(prodUsers, devUsers, { recursive: true })
      log.info('[dev] 已把安装版数据复制到开发版目录：', devUsers)
    } catch (e) {
      // 复制失败不能挡住启动：最差就是开发版从空数据开始，
      // 真实数据还在安装版目录里，一点没动。
      log.error('[dev] 复制安装版数据失败，开发版将从空数据启动', e)
    }
  }

  process.env.DATA_PATH = devPath
  log.info('[dev] 使用独立数据目录:', devPath)
}
