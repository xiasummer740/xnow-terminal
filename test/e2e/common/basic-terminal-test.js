const delay = require('./wait')
const { expect } = require('./expect')

/**
 * 全选/复制的修饰键：Mac 用 Meta(⌘)，其他平台用 Ctrl。
 *
 * 这里原本是裸写的 `'Meta+A'` / `'Meta+C'` —— 那是 macOS 的写法，在 Windows 上
 * Meta 键根本不存在，两次按键都不生效，于是"执行命令前"和"执行命令后"读到的是
 * **同一份剪贴板内容**，断言 `text1.length < text2.length` 收到 143 < 143 直接失败。
 * 写法与 common.js 的 copyItemWithKeyboard 保持一致（那里早就做了平台判断）。
 */
const modKey = process.platform === 'darwin' ? 'Meta' : 'Control'

exports.basicTerminalTest = async (client, cmd) => {
  async function focus () {
    // 必须 await —— 漏掉的话 click 还没落地 focus() 就返回了，
    // 紧跟着的全选/复制会作用在**页面**上（选中整页文本），而不是终端，
    // 于是命令前后的两次复制拿到同样内容，断言恒定 143 < 143 失败。
    await client.click('.session-current .term-wrap')
  }
  async function selectAll () {
    await client.keyboard.press(`${modKey}+A`)
    await delay(401)
  }
  async function copy () {
    await selectAll()
    await client.keyboard.press(`${modKey}+C`)
    await delay(401)
  }
  await copy()
  const text1 = await client.readClipboard()
  await delay(301)
  await focus()
  await delay(1010)
  await client.keyboard.type(cmd)
  await client.keyboard.press('Enter')
  await delay(1011)
  await copy()
  await delay(101)
  const text2 = await client.readClipboard()
  expect(text1.trim().length).lessThan(text2.trim().length)
}

exports.getTerminalContent = async function (client) {
  await client.click('.session-current .term-wrap')
  await delay(300)
  await client.keyboard.press(`${modKey}+A`)
  await delay(300)
  await client.keyboard.press(`${modKey}+C`)
  await delay(300)
  const clipboardText = await client.readClipboard()
  await client.keyboard.press('Escape')
  await delay(300)
  return clipboardText
}
