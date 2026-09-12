/**
 * ISSUES #48：自定义 CSS 只挡了 @import，远程 url() 照过
 *
 * 威胁模型要说清楚，否则用例配比没有依据：
 * `customCss` 在 `src/client/store/sync.js` 的 `configSyncKeys` 里 ——
 * **远端同步源可以决定它是什么**，而它经 `style.innerHTML` 直接进 DOM。
 * 所以「用户自己填的」不是威胁，「同步带进来的」才是。
 *
 * 配比：放行面（data:/blob:/相对路径）是**防误伤**，必须钉死，
 * 因为最容易的"修法"就是一拍了事地拦掉所有 url()，
 * 那会把用户自己设的背景图一起干掉 —— 这是本次修法最容易踩的坑。
 *
 * 注：被测的是 client 侧 ESM 源码，Node 24 自动识别 ESM 语法，
 * 但包是 CommonJS，会有一条 MODULE_TYPELESS_PACKAGE_JSON 警告，不是错误。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')

let safeCustomCss

test('加载被测模块', async () => {
  ;({ safeCustomCss } = await import('../../src/client/common/sanitize-css.js'))
  assert.equal(typeof safeCustomCss, 'function')
})

// ── 必须拦：远程 scheme ──────────────────────────────────────

const MUST_BLOCK = [
  ['a { background: url(https://evil.example/x.png) }', 'https 无引号'],
  ["a { background: url('https://evil.example/x.png') }", 'https 单引号'],
  ['a { background: url("http://evil.example/x.png") }', 'http 双引号'],
  ['a { background: url(file:///C:/Windows/win.ini) }', 'file 协议'],
  ['a { background: url(ftp://evil.example/x) }', 'ftp 协议'],
  ['a { background: url(myapp://steal) }', '自定义协议'],
  ['a { background: URL(HTTPS://EVIL.EXAMPLE/x.png) }', '大写 URL 与 scheme'],
  ['a { background: url(  https://evil.example/x.png  ) }', '多余空格']
]

for (const [css, why] of MUST_BLOCK) {
  test(`拦掉：${why}`, function () {
    const out = safeCustomCss(css)
    assert.ok(
      !/url\(\s*['"]?(?:https?|file|ftp|[a-z][a-z0-9+.-]*):/i.test(out),
      `远程 url 仍在：${out}`
    )
  })
}

// ── 必须放行：防误伤 ────────────────────────────────────────

const MUST_KEEP = [
  ['a { background: url(data:image/png;base64,iVBORw0KGgo=) }', 'data: 上传的背景图'],
  ["a { background: url('data:image/svg+xml,<svg/>') }", 'data: 带引号'],
  ['a { background: url(blob:http://127.0.0.1:5570/abc) }', 'blob:'],
  ['a { background: url(./img/bg.png) }', '相对路径'],
  ['a { background: url(/assets/bg.png) }', '根相对路径'],
  ['a { background: url(#gradient) }', '锚点'],
  ['a { background: url("../x.png") }', '上级相对路径']
]

for (const [css, why] of MUST_KEEP) {
  test(`放行：${why}`, function () {
    assert.equal(safeCustomCss(css), css)
  })
}

// ── 老防线不能因为这次改动被弄丢 ────────────────────────────

test('@import 仍然被挡', function () {
  const out = safeCustomCss('@import url(https://evil.example/a.css);')
  assert.ok(!/@import/i.test(out), `@import 还在：${out}`)
})

test('没有 url 的普通 CSS 原样通过', function () {
  const css = 'body { color: #f00; font-size: 13px }\n.x { border: 1px solid #333 }'
  assert.equal(safeCustomCss(css), css)
})

test('空值 / undefined 不抛', function () {
  assert.equal(safeCustomCss(''), '')
  assert.equal(safeCustomCss(undefined), '')
  assert.equal(safeCustomCss(null), '')
})

// ── 反证：证明这条用例真的在测东西 ──────────────────────────
// 如果 safeCustomCss 变成恒等函数，上面的"拦掉"用例必须红。
test('反证：恒等函数会让"拦掉"用例失效', function () {
  const evil = 'a { background: url(https://evil.example/x.png) }'
  const identity = (css) => css
  assert.notEqual(identity(evil), safeCustomCss(evil))
  assert.ok(/url\(https:\/\/evil\.example/.test(identity(evil)))
})
