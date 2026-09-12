/**
 * 开发版角标
 *
 * 为什么需要它：
 * 1. 窗口标题栏默认是 hidden（default-setting.js 里 useSystemTitleBar 默认 false），
 *    所以改 title 在窗口里根本看不见。
 * 2. 判断「开发版」一直用的是 isDev，也就是 `NODE_ENV === 'development'`，
 *    而 E2E 不设 NODE_ENV（见 test/e2e/common/app-options.js），
 *    于是跑测试弹出来的窗口跟正式安装版长得一模一样。
 *
 * 后果是实打实的：2026-09-12 祥哥把我跑 E2E 弹出的窗口当成了自己的程序，
 * 来报「左侧面板全是英文」—— 两边其实是同一份代码、同一份配置，
 * 区别只在于那个窗口跑在 en_us 下。
 *
 * 标志由主进程经 URL 参数传入（见 create-window.js 的 isDevBuild），
 * 打包版不带这个参数，所以正式版永远不会显示角标。
 */

const DEV_BUILD_CLASS = 'xnow-dev-build-badge'

export function mountDevBuildBadge () {
  const isDevBuild = new URLSearchParams(window.location.search).get('devBuild') === '1'
  if (!isDevBuild || document.querySelector(`.${DEV_BUILD_CLASS}`)) {
    return
  }
  // 任务栏 / Alt+Tab 显示的是 document.title，而它是 index.html 里写死的 <title>XNOW</title>，
  // 会把主进程设的窗口标题盖掉 —— 所以这里也要改，光设 BrowserWindow 的 title 没用。
  document.title = 'XNOW 开发版'

  const el = document.createElement('div')
  el.className = DEV_BUILD_CLASS
  // 中英都写：角标要在任何界面语言下都能一眼看懂
  el.textContent = '开发版 DEV'
  el.title = '这是非打包运行（开发 / 测试），不是正式安装版'
  Object.assign(el.style, {
    position: 'fixed',
    top: '0',
    left: '50%',
    transform: 'translateX(-50%)',
    // 用琥珀色而不是主题色：它得跟正常界面元素区分开，不能看起来像个功能按钮
    background: '#fa8c16',
    color: '#fff',
    fontSize: '11px',
    lineHeight: '18px',
    fontWeight: '600',
    letterSpacing: '0.5px',
    padding: '0 12px',
    borderRadius: '0 0 4px 4px',
    boxShadow: '0 1px 4px rgba(0, 0, 0, 0.35)',
    zIndex: '99999',
    // 角标只是提示，不能挡住底下的按钮点击
    pointerEvents: 'none',
    userSelect: 'none'
  })
  document.body.appendChild(el)
}
