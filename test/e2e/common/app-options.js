const { resolve } = require('path')
const cwd = process.cwd()

/**
 * E2E 自己的数据目录 —— **绝不能落到真实数据上**。
 *
 * 不设这个变量时，数据目录由 app-props.js 的算法算出：
 *   dataPath = process.env.DATA_PATH || resolve(appPaths.appPath, 'xnow-terminal')
 * 而 appPaths.appPath 在非便携版下就是 app.getPath('appData')，
 * 也就是 `%APPDATA%\xnow-terminal` —— 祥哥日常在用的那一份。
 *
 * 48 个 spec 里有改书签、建 profile、动文件、改设置的，跑一轮等于把真实数据犁一遍。
 *
 * 两道"看起来能挡"的机制其实都挡不住：
 *   - `NODE_TEST=yes` 只用来短路命令行解析（runtime-constants.js），不参与数据目录计算；
 *   - create-app.js 里那句 dev 数据隔离，条件是 `NODE_ENV === 'development'`，
 *     E2E 不设 NODE_ENV，所以那句**不会执行**。
 */
const DATA_PATH = resolve(cwd, 'work/e2e-data')

/**
 * Electron 自己的 userData（Cache / GPUCache / Local Storage / Session Storage）
 * **不归 DATA_PATH 管** —— 那是 Chromium 的目录，由 app.getPath('userData') 决定。
 * 只设 DATA_PATH 的话，业务库确实隔离了，但跑测试仍会往真实目录写缓存，
 * 而 Local Storage 里存着前端状态（例如 AI 记忆 xnow_agent_memory）。
 * `--user-data-dir` 把它一并挪进隔离区，测试才算真正"跑完不留痕"。
 */
const USER_DATA_DIR = resolve(cwd, 'work/e2e-userdata')

module.exports = {
  env: {
    ...process.env,
    NODE_TEST: 'yes',
    DATA_PATH,
    /**
     * 界面语言，必须钉成英文。
     *
     * test/e2e/common/lang.js 是从 `@electerm/electerm-locales` 的 **en_us** 取词条的，
     * 所以整套 E2E 的隐含前提就是"界面跑在英文下"。不设这个变量时，
     * locales.js 的 getLang() 在 config.language 为空时会回退到**系统语言**，
     * 中文 Windows 上就是 zh_cn —— 于是每条断言都在比「英文期望 vs 中文界面」，
     * 大面积假红（例如期望 "UI Themes"、实际 "UI主题"）。
     *
     * 为什么设这个就够：os-locale-s 的实现里 getEnvLocale() 优先于平台探测
     * （cjs/index.js:104-107，认得 LC_ALL / LC_MESSAGES / LANG / LANGUAGE），
     * 有值就直接用、根本不会去跑 Windows 的 wmic。所以这是走它已有的机制，
     * 不需要为了测试去改产品代码。
     *
     * ⚠️ 必须是 **LC_ALL**，不能设 LANG —— getEnvLocale 的取值是
     *     LC_ALL || LC_MESSAGES || LANG || LANGUAGE
     * 而 Git Bash 会给子进程预设 LC_ALL=zh_CN.UTF-8，优先级更高、会把 LANG 盖掉。
     * （第一版这里写的就是 LANG，实测界面依然是中文，白跑一轮。）
     *
     * 放在 ...process.env 之后：即使外部环境带着别的 locale 进来也强制覆盖，
     * 测试跑在什么语言下必须由测试自己说了算。
     */
    LC_ALL: 'en_US.UTF-8'
  },
  args: [
    resolve(cwd, 'work/app'),
    `--user-data-dir=${USER_DATA_DIR}`,
    '--disable-gpu',
    '--disable-dev-shm-usage'
  ]
}
