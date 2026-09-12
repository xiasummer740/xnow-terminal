/**
 * Playwright 配置（ISSUES #17）
 *
 * 加这个文件**首要目的是钉死 testDir**。不设的话 Playwright 默认把**整个项目根目录**
 * 当测试目录，按 `**\/*.spec.js` 满仓库扫 —— 后果不止是慢：`test/unit-ci/*.spec.js`
 * 是 node:test 写的（`node --test` 跑），Playwright 会按自己那套去收集并加载它们，
 * 直接报错。E2E 和单测必须是两套互不打扰的 runner。
 *
 * workers=1 / fullyParallel=false：这 48 个 spec 共用同一个 Electron 数据目录
 * （work/e2e-data，见 common/app-options.js），并行跑会互相污染数据；
 * 串行还顺带保证了执行顺序稳定、失败可复现。
 * package.json 里 test1/test2/test3 本来就传了 --workers=1，这里再钉一道默认值，
 * 免得有人直接跑 `npx playwright test` 时忘了加。
 */
module.exports = {
  testDir: './test/e2e',
  // Electron 冷启动 + 首屏渲染比纯浏览器慢得多，默认 30s 不够
  timeout: 90 * 1000,
  workers: 1,
  fullyParallel: false,
  reporter: [['list']]
}
