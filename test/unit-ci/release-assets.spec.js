/**
 * ISSUES #32：release 产物漏传 blockmap，差量更新静默退化成全量
 *
 * 失败模式是**静默**的：打包成功、release 成功、`gh release view` 也正常，
 * 只有用户那边更新变成 116MB 全量下载。所以这里两件事：
 *   1. 判定函数本身可信 —— 缺一个必须报一个（永远返回"齐了"的检查比没有更糟）
 *   2. 用例取**真实发生过的**漏传组合，不是编出来的
 *
 * 前提是实测的（`gh release view --json assets`）：
 *   v3.17.8  → 只有 latest.yml + .exe        ← 缺 blockmap
 *   v3.17.10 → 只有 latest.yml + .exe        ← 缺 blockmap
 *   v3.17.11 → 三个都齐
 * 所以「三个都齐」这条正常路径确实存在，不是设计上的空想。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const { resolve } = require('path')
const { requiredAssets, findMissingAssets } = require('../../build/bin/check-release-assets')

const ROOT = resolve(__dirname, '../..')
const V = '9.9.9'
const EXE = `XNOW-Terminal-${V}-win-x64-installer.exe`

test('清单必须包含 blockmap —— 这正是原来漏掉的那个', () => {
  const names = requiredAssets(V).map(a => a.name)
  assert.ok(
    names.includes(EXE + '.blockmap'),
    'blockmap 不在清单里的话 #32 就等于没修'
  )
  assert.deepEqual(names, [EXE, EXE + '.blockmap', 'latest.yml'])
})

test('每一项都要写清"缺了会怎样"，不然日志看不出严重性', () => {
  for (const a of requiredAssets(V)) {
    assert.ok(a.why && a.why.length > 0, `${a.name} 没写 why`)
  }
  const blockmap = requiredAssets(V).find(a => a.name.endsWith('.blockmap'))
  assert.match(blockmap.why, /全量/, '要说明缺了会退化成全量下载')
})

test('🔴 真实漏传组合：v3.17.8 / v3.17.10 那种会被判缺失', () => {
  // 那两个 release 的实际资产
  const actual = ['latest.yml', EXE]
  const missing = findMissingAssets(actual, V).map(a => a.name)
  assert.deepEqual(missing, [EXE + '.blockmap'], '缺了 blockmap 却没报出来 = 白修')
})

test('真实正常组合：v3.17.11 那种判定为齐', () => {
  const actual = [EXE, EXE + '.blockmap', 'latest.yml']
  assert.deepEqual(findMissingAssets(actual, V), [], '齐了却报缺失，会让发版卡死')
})

test('一个都没有时，三项全报（不是只报第一项就收工）', () => {
  const missing = findMissingAssets([], V).map(a => a.name)
  assert.equal(missing.length, 3)
})

test('差量漏了 latest.yml 也要报 —— 那个是"收不到更新"，更严重', () => {
  const missing = findMissingAssets([EXE, EXE + '.blockmap'], V).map(a => a.name)
  assert.deepEqual(missing, ['latest.yml'])
})

test('清单里的版本号要跟着传入的版本走（写死版本号会让下次发版永远报缺）', () => {
  const other = requiredAssets('1.2.3').map(a => a.name)
  // latest.yml 里本来就不含版本号，只查带版本号的那两个
  const versioned = other.filter(n => n !== 'latest.yml')
  assert.equal(versioned.length, 2)
  assert.ok(versioned.every(n => n.includes('1.2.3')), '版本号没跟着走：' + versioned)
})

test('资产顺序不影响判定（gh 返回的顺序不保证）', () => {
  const a = [EXE, 'latest.yml', EXE + '.blockmap']
  const b = ['latest.yml', EXE + '.blockmap', EXE]
  assert.deepEqual(findMissingAssets(a, V), [])
  assert.deepEqual(findMissingAssets(b, V), [])
})

// ── 链路钉死：发布脚本必须真的用这个判定，且补完要复核 ────────

const SRC = fs.readFileSync(resolve(ROOT, 'build/bin/release-xnow.js'), 'utf8')

test('发布脚本接的是这份清单，不是自己又写一遍', () => {
  assert.match(SRC, /require\('\.\/check-release-assets'\)/, '没 import 判定模块')
  assert.match(SRC, /findMissingAssets\(/, '没调用判定函数')
})

test('补传之后必须复核，且复核不过要抛错', () => {
  // 只补不核的话，补传本身失败（网络/权限）还是静默过
  assert.match(SRC, /stillMissing/, '没有补传后的复核')
  assert.match(SRC, /throw new Error/, '复核不过没有抛错')
})

test('抛错发生在正式发布之前 —— 否则用户已经能看到残缺的 release 了', () => {
  // 找执行的命令而不是字面量：注释里也会写到 --draft=false
  const throwAt = SRC.indexOf('stillMissing.length > 0')
  const publishAt = SRC.indexOf('gh release edit')
  assert.notEqual(throwAt, -1, '找不到复核那段')
  assert.notEqual(publishAt, -1, '找不到发布那步')
  assert.ok(throwAt < publishAt, '复核必须在 gh release edit 之前')
})
