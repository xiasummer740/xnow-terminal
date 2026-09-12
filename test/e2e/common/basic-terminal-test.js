const delay = require('./wait')
const { expect } = require('./expect')

/**
 * 「读终端内容」统一走 app 自带的 `store.mcpGetTerminalOutput`
 * （src/client/store/mcp-handler.js:541，从 xterm 的 buffer 取行）。
 *
 * ## 为什么废弃了原来的「Ctrl+A / Ctrl+C + 剪贴板」
 *
 * 那套在本仓库**从根上不成立**，探针实测证据：
 *
 *   1. xterm 没有 select-all 语义。Ctrl+A 会被 electerm 自己的
 *      handleKeyboardEvent（shortcut-handler.js:135，只拦 Backspace / Ctrl+C）
 *      放行给 PTY，变成 readline 的「移到行首」，**不产生任何选区**。
 *      实测：按下 Ctrl+A 后 `term.getSelection() === ''`、
 *      `document.getSelection()` 也是空串。
 *   2. 没有选区 → Ctrl+C 复制不到东西 → 剪贴板原封不动。
 *      于是命令前后两次读到的剪贴板是同一份内容，断言恒定
 *      `expected 143 to be less than 143` 失败。
 *   3. 主进程剪贴板里那个字符串 "playwright" 是 **Playwright 自己预置的初值**
 *      （实测：主进程读写往返正常，写 MARKER-XYZ 立刻读得回来）。
 *      所以失败现场看着像"复制没生效"，实际是"压根没东西可复制"——
 *      排查时很容易往错误方向走。
 *
 * 原来的 `modKey`（darwin 用 Meta、其余用 Control）是在绕第 1 条，
 * 但两条路都不通，现在整条链路废弃，不再需要这个平台判断。
 *
 * ## 为什么该用 mcpGetTerminalOutput
 *
 * - 它是**产品自带**的能力（MCP 工具在用），不是为测试新造的口子
 * - 直接读 xterm buffer，和剪贴板、焦点、选区这些易碎环节全都无关
 * - 取全量行：lineCount 传大值，避免"输出长了被截断导致前后等长"的假失败
 */

// 取全量 scrollback。传 50 这种小值时，一旦输出超过窗口高度，
// 前后两次取到的行数会被同样的上限卡住，长度相等 → 假失败。
const ALL_LINES = 100000

async function readTerminal (client) {
  return client.evaluate((lines) => {
    return window.store.mcpGetTerminalOutput({ lines }).output || ''
  }, ALL_LINES)
}

async function focus (client) {
  // 必须 await —— 漏掉的话 click 还没落地就往下走了，
  // 后面 keyboard.type 的按键会落到页面上而不是终端里。
  await client.click('.session-current .term-wrap')
}

exports.basicTerminalTest = async (client, cmd) => {
  await focus(client)
  await delay(500)
  const before = await readTerminal(client)

  await client.keyboard.type(cmd)
  await client.keyboard.press('Enter')
  await delay(2500)

  const after = await readTerminal(client)
  // 原意不变：跑完命令，终端里的内容必须变多
  expect(before.trim().length).lessThan(after.trim().length)
}

exports.getTerminalContent = async function (client) {
  await focus(client)
  await delay(300)
  return readTerminal(client)
}
