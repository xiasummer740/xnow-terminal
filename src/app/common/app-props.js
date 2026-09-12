/**
 * app path
 */
const { app } = require('electron')
const { resolve } = require('path')
const constants = require('./runtime-constants')
const installSrc = require('../lib/install-src')

function getDataPath () {
  const defaultValue = {
    appPath: app.getPath('appData'),
    isPortable: false
  }
  if (!constants.isWin) {
    return defaultValue
  }
  const exePath = app.getPath('exe').replace('\\xnow-terminal.exe', '')
  const p = exePath + '\\' + 'xnow-terminal'
  if (
    installSrc === 'win-x64-portable.tar.gz' ||
    require('fs').existsSync(
      p
    )
  ) {
    return {
      appPath: exePath,
      exePath,
      isPortable: true
    }
  }
  return {
    ...defaultValue,
    exePath
  }
}

const appPaths = getDataPath()

// 数据目录的**唯一算法** —— 和 nedb.js:26 / sqlite.js:66 那两处表达式同形
// （它们就是 `process.env.DATA_PATH || resolve(appPath, 'xnow-terminal')`）。
// 抽出来是为了让「清理旧数据」和「数据库读写」不可能算出两个不同的目录：
// 清理删了 A、数据库用的是 B，用户看到的就是"清了个寂寞"。
//
// ⚠️ 别在这里顺手加「开发模式切独立目录」。看起来是修 bug，实际会**搬走**
// 祥哥 dev 环境一直在用的那份数据（create-app.js 里那句 DATA_PATH 赋值因为
// 时机太晚，从来没对数据库生效过 —— 见 ISSUES #65）。改数据位置要祥哥拍板。
const dataPath = process.env.DATA_PATH || resolve(appPaths.appPath, 'xnow-terminal')

module.exports = {
  ...appPaths,
  dataPath,
  sshKeysPath: resolve(
    app.getPath('home'),
    '.ssh'
  ),
  ...constants
}
