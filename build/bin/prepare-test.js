/**
 * 装 E2E 用的 Playwright（ISSUES #13）
 *
 * 原来是这一行：
 *   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -E playwright@1.28.1 --no-save && ...
 *
 * 两个问题：
 *
 * 1. **`VAR=值 命令` 是 bash 语法**。Windows 上 npm script 默认走 cmd.exe，
 *    cmd 会把 `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1` 当成一个**程序名**去找，
 *    找不到就失败。也就是 Windows 上这个命令**从来就没成功过**。
 * 2. 更糟的是**失败看不见**。原来是链式 `&&`，看起来"跑过了"，实际 E2E 依赖
 *    一直是缺的，直到有人真去跑测试才报 `Cannot find module '@playwright/test'`。
 *
 * 所以这里改成 node 脚本，就为两件事：
 *   - 跨平台设环境变量（不再依赖 shell 的语法）
 *   - **装失败就非零退出** —— 静默才是这条 bug 的真正危害，不是"装不上"本身
 *
 * 用 spawnSync 而不是 shelljs：退出码要原样传出去，不想再隔一层包装。
 */

const { spawnSync } = require('child_process')
const pack = require('../../package.json')

// 必须是能驱动本仓库 Electron 的版本。原来钉的 1.28.1 是 2022 年 11 月的，
// 驱动不了 2026 年的 Electron 41（详见 ISSUES #12），钉了等于没装。
const PW_VERSION = '1.63.0'

// _electron 测试驱动的是**真实的 Electron 二进制**，不需要 Playwright 自带的
// 浏览器（那会白下 ~500MB）。装 @playwright/test 时默认会去下，所以关掉。
// 注意这个变量名是 Playwright 认的，别改成别的写法。
const env = {
  ...process.env,
  PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: '1'
}

// 装之前先把"为什么是这个版本"打出来，免得以后有人看到一串数字不知道出处
const electronVersion = (pack.devDependencies && pack.devDependencies.electron) || '未知'
console.log(`[prepare-test] electron ${electronVersion} → 安装 @playwright/test@${PW_VERSION}`)
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

// 装完自检一次能不能真 require 到 —— npm 退出 0 不等于模块可用
// （比如网络中断留下半个包）。这一步就是当年"静默失败"的补丁。
const probe = spawnSync(
  process.execPath,
  ['-e', "require('@playwright/test'); console.log('ok')"],
  { cwd: process.cwd(), stdio: 'pipe', encoding: 'utf8' }
)
if (probe.status !== 0) {
  console.error('[prepare-test] 装完了却 require 不到 @playwright/test —— 安装是坏的')
  console.error(probe.stderr || '')
  process.exit(1)
}
console.log('[prepare-test] @playwright/test 就绪')
