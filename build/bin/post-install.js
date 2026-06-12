/**
 * post install script
 */
const { cp, exec, rm } = require('shelljs')
const { existsSync } = require('fs')
const { resolve } = require('path')
const prePushPath = resolve(__dirname, '../../.git/hooks/pre-push')
const prePushPathFrom = resolve(__dirname, 'pre-push')
const os = require('os')

const platform = os.platform()
const isWin = platform === 'win32'

if (isWin && process.env.CI) {
  exec('npm cache clear -f')
  exec('npm uninstall node-gyp -g')
  exec('npm install node-gyp -g')
}

// 检查关键原生模块是否已经编译好
// 如果已存在则跳过 electron-rebuild，大幅优化二次 install 速度
const ptyBuildFile = resolve(__dirname, '../../node_modules/node-pty/build/Release/conpty.node')
const needsRebuild = process.env.NODE_ENV === 'production' || !existsSync(ptyBuildFile)

if (needsRebuild) {
  // 先移除 cpu-features（electron-rebuild 容易在这卡死）
  ;[
    resolve(__dirname, '../../node_modules/cpu-features'),
    resolve(__dirname, '../../work/app/node_modules/cpu-features')
  ].forEach(p => {
    if (existsSync(p)) {
      rm('-rf', p)
    }
  })

  console.log('Rebuilding native modules for Electron...')
  const result = exec(resolve('./node_modules/.bin/electron-rebuild'), { silent: true })
  if (result.code !== 0) {
    console.warn('electron-rebuild failed, native modules may not work:', result.stderr?.substring(0, 200))
  } else {
    console.log('electron-rebuild done')
  }
} else {
  console.log('Native modules already built, skipping electron-rebuild')
}

if (!existsSync(prePushPath)) {
  cp(prePushPathFrom, prePushPath)
}
