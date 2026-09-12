/**
 * `--clear-config`：清空旧数据、全新启动（ISSUES #40）
 *
 * `clearConfigIfRequested()` **必须在 require `./create-app` 之前调用**，原因有两层：
 *
 * 1. **删不掉**：打开数据库的是 `create-app → get-config → db → sqlite`
 *    这条 **require 链**（`db.js` 在模块顶层就 `createDb()` 了），也就是说
 *    `require('./lib/create-app')` 那一刻，`xnow.db` / `xnow_data.db` 的句柄
 *    已经打开了。Windows 上删不掉被打开的文件 —— 实测
 *    `fs.rmSync(dir, {recursive:true, force:true})` 抛 `EPERM`，
 *    注意 `force` 只吞 ENOENT，**吞不掉 EPERM**。
 * 2. **删一半**：`rmSync` 不是原子的。实测在"db 被锁 + 目录里还有别的文件"时，
 *    能删的（`.xnow-version`、`logs/`、旧的 `.nedb`）全删了，锁住的 db 留下，
 *    然后才抛异常 —— 目录处于半删除状态，而**活下来的恰好是那份想清掉的旧数据**。
 *
 * 原来的写法把这两件事串成了"应用打不开"：`rmSync` 抛异常 → `createApp()` 返回的
 * Promise 被拒 → `app.js` 那句 `createApp()` 没有 `.catch` → 只在
 * `unhandledRejection` 里记一条日志 → **一个窗口都不会创建**，
 * 用户看到的就是双击没反应。
 *
 * 所以这里的铁律：**清理失败绝不往外抛**。清不干净最多是"没清干净"，
 * 抛出去就是整个应用起不来 —— 后者严重得多。
 *
 * 拆成 clearDataDir(路径) + clearConfigIfRequested() 两层是为了能真测：
 * 前者不碰 electron（app-props 要 electron 的 app，在 node 里 require 不进来），
 * 测试可以直接拿一个临时目录 + 一个真开着的 sqlite 句柄来验证"锁住时会不会抛"。
 */

const fs = require('fs')
const log = require('../common/log')

/**
 * 清空一个数据目录。**任何情况下都不抛异常**。
 *
 * @param {string} dataPath 要清的目录
 * @returns {boolean} 是否确实清掉了（目录已不存在）
 */
function clearDataDir (dataPath) {
  if (typeof dataPath !== 'string' || !dataPath) {
    log.error('[clear-config] 数据目录为空，跳过清理')
    return false
  }
  if (!fs.existsSync(dataPath)) {
    log.info('[clear-config] 数据目录不存在，无需清理:', dataPath)
    return true
  }

  log.warn('[clear-config] 即将清空数据目录:', dataPath)
  try {
    // maxRetries/retryDelay：Windows 上杀毒、索引服务、资源管理器预览
    // 都可能短暂持有句柄，退避重试能躲过这类瞬时占用。
    fs.rmSync(dataPath, {
      recursive: true,
      force: true,
      maxRetries: 5,
      retryDelay: 100
    })
  } catch (e) {
    // 不抛！见文件头。带着半数残留启动，也远好过让用户面对一个打不开的应用。
    log.error(
      '[clear-config] 清除旧数据失败，已跳过（应用继续启动）:', dataPath, e.message
    )
  }

  // 用"目录还在不在"当结果，不用"有没有抛异常"：
  // rmSync 抛了也可能已经删掉大半，没抛也不代表删干净了
  if (fs.existsSync(dataPath)) {
    log.warn('[clear-config] 数据目录仍存在，未清干净:', dataPath)
    return false
  }
  log.info('[clear-config] 已清除旧配置数据:', dataPath)
  return true
}

/**
 * 带了 `--clear-config` 才清理。
 * @returns {boolean} 是否确实清掉了
 */
function clearConfigIfRequested () {
  // 这两个 require 故意写在函数里：app-props 要 electron 的 app，
  // 放模块顶层会让本文件在 node 里 require 不进来（测试就用不了 clearDataDir 了）
  const { initCommandLine } = require('./command-line')
  // 复用同一个解析器，不自己再扫一遍 process.argv：
  // 两套规则早晚会出现"命令行认了、清理没认"（或反过来）
  const progs = initCommandLine()
  if (!progs || !progs.options || !progs.options.clearConfig) {
    return false
  }
  // 目录算法只有一份，见 app-props.js —— 保证"清理"和"数据库读写"算的是同一个目录，
  // 否则就是清了个寂寞（清 A 目录、数据库用 B 目录）
  const { dataPath } = require('../common/app-props')
  return clearDataDir(dataPath)
}

module.exports = { clearConfigIfRequested, clearDataDir }
