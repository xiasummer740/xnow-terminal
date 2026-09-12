const { _electron: electron } = require('@playwright/test')
const {
  test: it
} = require('@playwright/test')
const { describe } = it
it.setTimeout(100000)
const delay = require('./common/wait')
const log = require('./common/log')
const { expect } = require('./common/expect')
const appOptions = require('./common/app-options')
const e = require('./common/lang')
const extendClient = require('./common/client-extend')

describe('terminal themes', function () {
  it('all buttons open proper terminal themes tab', async function () {
    const electronApp = await electron.launch(appOptions)
    const client = await electronApp.firstWindow()
    extendClient(client, electronApp)
    await delay(3500)

    log('button:edit')
    await client.click('.btns .anticon-picture')
    await delay(500)
    const sel = '.setting-wrap .ant-tabs-nav-list .ant-tabs-tab-active'
    await client.hasElem(sel)
    await delay(500)
    const text = await client.getText(sel)
    expect(text).equal(e('uiThemes'))

    const v = await client.getValue('.setting-wrap #terminal-theme-form_themeName')
    const tx = await client.getText('.setting-wrap .item-list-unit.active')
    const txd = await client.getText('.setting-wrap .item-list-unit.current')
    expect(v).equal(e('newTheme'))
    expect(tx).equal(e('newTheme'))
    // 这一格显示的是「主题名」，不是界面词条，**不能拿 e() 的翻译结果比**。
    //
    // theme-list-item.jsx:142 的取值规则：
    //     let title = id === defaultTheme().id ? e(id) : name
    // 而 defaultTheme() 返回的是 Xnow 主题，id 并非 'default'，
    // 所以 seed 出来的 _id:'default' 这条走的是 `: name` 分支 —— 渲染原始主题名。
    // 这跟 'default light' / '3024 Day' / 'Aardvark Blue' 是同一套规则：
    // 主题名属于「数据」，产品按既定口径保留英文原样，不翻译。
    //
    // 旧断言写的是 e('default')（= "Default"，首字母被 window.translate 大写），
    // 拿词条去比数据，必然红。改成取当前生效主题的真实名字。
    const themeName = await client.evaluate(() => {
      const { config, terminalThemes } = window.store
      const hit = (terminalThemes || []).find(t => t.id === config.theme)
      return hit ? hit.name : config.theme
    })
    expect(txd).equal(themeName)

    // create theme
    log('create theme')
    const themePrev = await client.evaluate(() => {
      return window.store.terminalThemes.length
    })
    const themeIterm = await client.evaluate(() => {
      return window.store.itermThemes.length
    })
    await client.click('.setting-wrap .ant-btn-primary')

    const themeNow = await client.evaluate(() => {
      return window.store.terminalThemes.length
    })
    await delay(1000)
    expect(themeNow).equal(themePrev + 1)
    expect(themeIterm > 10).equal(true)
    await electronApp.close().catch(console.log)
  })
})
