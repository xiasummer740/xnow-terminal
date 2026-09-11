/**
 * ISSUES #4：升级包完整性校验
 *
 * 这块的关键不是"能不能算哈希"，而是**解析失败时会不会误放行**——
 * latest.yml 读不到 / 结构变了 / 文件名对不上，都必须判为"校验不可用"，
 * 而不是"没发现问题就算过"。所以下面大半用例都在测"给什么都要返回 null"。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const { join } = require('path')
const { parseLatestYml, sha512File, verifyUpgradeFile } = require('../../src/app/server/upgrade-verify')
const upgradeFuncs = require('../../src/app/common/upgrade-funcs')

// 取自真实 release 的 latest.yml（v3.17.11），字段顺序照抄
const REAL_YML = `version: 3.17.11
files:
  - url: XNOW-Terminal-3.17.11-win-x64-installer.exe
    sha512: gPuLLfi4nOIa0aGvRorcHgS6XKJujpJyxLZwY7g3dqFjxfxOa8igqAbYX3Ezo4Rj96lFF19mggR+nxlCXMapWw==
    size: 116322131
path: XNOW-Terminal-3.17.11-win-x64-installer.exe
sha512: gPuLLfi4nOIa0aGvRorcHgS6XKJujpJyxLZwY7g3dqFjxfxOa8igqAbYX3Ezo4Rj96lFF19mggR+nxlCXMapWw==
releaseDate: '2026-06-19T16:48:11.084Z'
`

test('解析真实 latest.yml，取出正确的 sha512 与 size', () => {
  const r = parseLatestYml(REAL_YML, 'XNOW-Terminal-3.17.11-win-x64-installer.exe')
  assert.equal(r.sha512, 'gPuLLfi4nOIa0aGvRorcHgS6XKJujpJyxLZwY7g3dqFjxfxOa8igqAbYX3Ezo4Rj96lFF19mggR+nxlCXMapWw==')
  assert.equal(r.size, 116322131)
  assert.equal(r.url, 'XNOW-Terminal-3.17.11-win-x64-installer.exe')
  // 关键：顶层的 sha512 不能盖掉 files 里那一条（顺序不同就该取 files 里的）
  assert.equal(r.sha512.length, 88)
})

test('多文件时按文件名精确取，不按位置取', () => {
  const yml = `version: 1.0.0
files:
  - url: A-setup.exe
    sha512: ${'A'.repeat(86)}==
    size: 100
  - url: B-setup.exe
    sha512: ${'B'.repeat(86)}==
    size: 200
path: A-setup.exe
`
  const b = parseLatestYml(yml, 'B-setup.exe')
  assert.equal(b.size, 200)
  assert.ok(b.sha512.startsWith('BBBB'))
  // 要的文件不在清单里 → null（绝不能退回第一条放行）
  assert.equal(parseLatestYml(yml, 'C-setup.exe'), null)
})

test('解析不出来一律返回 null —— 宁可判"不可用"也不误放行', () => {
  const bad = [
    undefined,
    null,
    123,
    {},
    '',
    '   ',
    // 结构变了 / 缺字段
    'version: 1.0.0\n',
    'files:\n  - url: A.exe\n',
    'files:\n  - url: A.exe\n    size: 100\n',
    'files:\n  - url: A.exe\n    sha512: short\n    size: 100\n',
    'files:\n  - url: A.exe\n    sha512: ' + 'x'.repeat(88) + '\n',
    'files:\n  - url: A.exe\n    sha512: ' + 'x'.repeat(88) + '\n    size: 0\n',
    'files:\n  - url: A.exe\n    sha512: ' + 'x'.repeat(88) + '\n    size: abc\n'
  ]
  for (const text of bad) {
    assert.equal(parseLatestYml(text, 'A.exe'), null, `不该解析出结果：${JSON.stringify(text)}`)
  }
})

test('远程可调方法名单：不含能跳过校验的方法', () => {
  assert.ok(Array.isArray(upgradeFuncs))
  assert.equal(new Set(upgradeFuncs).size, upgradeFuncs.length, '名单不应有重复项')
  assert.ok(upgradeFuncs.includes('pause'))
  assert.ok(upgradeFuncs.includes('destroy'))
  // 这几个一旦能被远程调用，就等于绕过下载后的完整性校验直接静默安装
  const mustNot = [
    'onEnd', 'onDownloaded', 'onFatalError', 'manualInstall', 'init',
    'constructor', '__proto__', 'toString'
  ]
  for (const bad of mustNot) {
    assert.ok(!upgradeFuncs.includes(bad), `名单绝不能包含：${bad}`)
  }
})

test('sha512File 与已知向量一致（不是拿自己算自己）', async () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'xnow-uv-'))
  const f = join(dir, 'abc.txt')
  fs.writeFileSync(f, 'abc', 'utf8')
  try {
    // SHA-512("abc") 的 base64，公开已知值
    assert.equal(
      await sha512File(f),
      '3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw=='
    )
    // 内容变一个字节，哈希必须变（防止"读了个空"也算过）
    fs.writeFileSync(f, 'abd', 'utf8')
    assert.notEqual(
      await sha512File(f),
      '3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw=='
    )
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})

test('verifyUpgradeFile：大小/哈希对不上要拒，正确才放行', async () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'xnow-uv-'))
  const f = join(dir, 'pkg.exe')
  fs.writeFileSync(f, 'abc', 'utf8')
  const good = {
    url: 'pkg.exe',
    sha512: '3a81oZNherrMQXNJriBBMRLm+k6JqX6iCp7u5ktV05ohkpkqJ0/BqDa6PCOj/uu9RU1EI2Q86A4qmslPpUyknw==',
    size: 3
  }
  try {
    assert.deepEqual(await verifyUpgradeFile(f, good), { ok: true })

    // 被换过的文件：同大小但内容不同 → 大小检查放行、哈希兜住
    fs.writeFileSync(f, 'abd', 'utf8')
    const r2 = await verifyUpgradeFile(f, good)
    assert.equal(r2.ok, false)
    assert.match(r2.reason, /sha512 不匹配/)

    // 截断的下载：大小就不对，不必读哈希
    fs.writeFileSync(f, 'ab', 'utf8')
    const r3 = await verifyUpgradeFile(f, good)
    assert.equal(r3.ok, false)
    assert.match(r3.reason, /大小不符/)

    // 没有期望值 → 拒绝（这是"无法校验"，调用方据此走手动安装）
    assert.equal((await verifyUpgradeFile(f, null)).ok, false)
    assert.equal((await verifyUpgradeFile(f, {})).ok, false)

    // 文件不存在 → 拒绝而不是抛异常
    assert.equal((await verifyUpgradeFile(join(dir, 'nope.exe'), good)).ok, false)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
