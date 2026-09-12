/**
 * 装 E2E 用的 Playwright（ISSUES #13）
 *
 * 原来是这一行：
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -E playwright@1.28.1 --no-save && ...
 *
 * 三个问题：
 *
 * 1. **`VAR=值 命令` 是 bash 语法**。Windows 上 npm script 默认走 cmd.exe，
 *    cmd 会把 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 当成一个**程序名**去找，
 *    找不到就失败。也就是 Windows 上这个命令**从来就没成功过**。
 * 2. 更糟的是**失败看不见**。原来是链式 `&&`，看起来"跑过了"，实际 E2E 依赖
 *    一直是缺的，直到有人真去跑测试才报 `Cannot find module '@playwright/test'`。
 * 3. 用的是 `--no-save`，包不进 package.json → npm 视为 extraneous。
 *    **任何人在仓库里跑一次 `npm install`，这三个包会被当成垃圾清掉。**
 *    2026-09-12 实测过一次：测试跑到第 7 个时被清，后面 23 个全报
 *    `Cannot find module .../playwright/lib/worker/workerProcessEntry.js`，
 *    看起来像 23 个测试坏了，实际是运行器被删了。
 *    （项目 CI 用的是 `npm i -D`，即写进 devDependencies，压根没这问题；
 *     本脚本仍保留 `--no-save` 是为了不在本地 `npm i` 时触发 ~500MB 浏览器下载。）
 *
 * 所以这里改成 node 脚本，做三件事：
 *   - 跨平台设环境变量（不再依赖 shell 的语法）
 *   - **装失败就非零退出** —— 静默才是这条 bug 的真正危害，不是"装不上"本身
 *   - **幂等自愈**：版本对且能 require 就直接跳过；被 `npm install` 清掉了下次自动补回来
 *
 * 用 spawnSync 而不是 shelljs：退出码要原样传出去，不想再隔一层包装。
 */

const fs = require('fs')
const { resolve } = require('path')
const { spawnSync } = require('child_process')
const pack = require('../../package.json')

// 必须是能驱动本仓库 Electron 的版本。原来钉的 1.28.1 是 2022 年 11 月的，
// 驱动不了 2026 年的 Electron 41（详见 ISSUES #12），钉了等于没装。
const PW_VERSION = '1.63.0'

const PW_PKG = resolve(__dirname, '../../node_modules/@playwright/test/package.json')

// _electron 测试驱动的是**真实的 Electron 二进制**，不需要 Playwright 自带的
// 浏览器（那会白下 ~500MB）。装 @playwright/test 时默认会去下，所以关掉。
// 注意这个变量名是 Playwright 认的，别改成别的写法。
const env = {
  ...process.env,
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'
}

// npm 退出 0 不等于模块可用（网络中断会留下半个包），所以要真 require 一次。
// 同时兼作"版本对不对"的判断依据 —— 它和下面的 fs 检查是两回事：
// fs 看的是 package.json 里写的版本号，require 看的是模块真能不能加载。
const PROBE = "require('@playwright/test'); require('playwright')"

function probeOk () {
  return spawnSync(process.execPath, ['-e', PROBE], {
    cwd: process.cwd(),
    stdio: 'pipe',
    encoding: 'utf8'
  }).status === 0
}

function installedVersion () {
  try {
    return JSON.parse(fs.readFileSync(PW_PKG, 'utf8')).version
  } catch (e) {
    return null
  }
}

const current = installedVersion()

// 装之前先把"为什么是这个版本"打出来，免得以后有人看到一串数字不知道出处
const electronVersion = (pack.devDependencies && pack.devDependencies.electron) || '未知'
console.log(`[prepare-test] electron ${electronVersion} → 需要 @playwright/test@${PW_VERSION}`)

if (current === PW_VERSION && probeOk()) {
  // 绝大多数情况走这条：什么都没变，秒过。
  // 之所以要检查而不是无条件重装：这个脚本被串在 test1/test2/test3 前面，
  // 每次跑测试都重装一遍依赖没有意义，还会拖慢反馈。
  console.log('[prepare-test] 已就绪，跳过安装')
  process.exit(0)
}

if (current && current !== PW_VERSION) {
  console.log(`[prepare-test] 现存版本 ${current} 与本仓库 Electron 不匹配，重装`)
} else if (!current) {
  console.log('[prepare-test] 未装或被 npm install 清掉了，开始安装')
}

console.log('[prepare-test] 跳过浏览器下载（E2E 用真实 Electron，不需要 Playwright 的浏览器）')

// 命令拼成一个字符串而不是 (命令, args 数组) —— 后者 + shell:true 会触发
// DEP0190（Node 警告"args 经 shell 转义有注入风险"）。这里的参数全是上面的常量，
// 没有外部输入，但仍然按 Node 推荐写法来，免得每次装依赖都刷一条警告。
const cmd = `npm i -E @playwright/test@${PW_VERSION} --no-save`
const r = spawnSync(cmd, {
  stdio: 'inherit',
  env,
  // Windows 上 npm 是 npm.cmd，不开 shell 找不到
  shell: true
})

if (r.error) {
  console.error('[prepare-test] 起不来 npm:', r.error.message)
  process.exit(1)
}
if (r.status !== 0) {
  console.error(`[prepare-test] 安装失败，退出码 ${r.status}`)
  // 原样传出去：调用方（CI / 人）必须能看见这一步挂了
  process.exit(r.status || 1)
}

// 这一步就是当年"静默失败"的补丁：装完了必须真能加载，否则非零退出
if (!probeOk()) {
  console.error('[prepare-test] 装完了却 require 不到 @playwright/test 或 playwright —— 安装是坏的')
  process.exit(1)
}
console.log(`[prepare-test] @playwright/test@${PW_VERSION} 就绪`)
