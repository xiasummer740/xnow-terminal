/**
 * ISSUES #43：深链接把含明文密码的连接串写进日志
 *
 * 三个入口（`open-url` / `second-instance` / 启动 argv）原来都是
 * `log.info('...', url)` 原样落盘，于是 `ssh://user:pass@host` 的密码
 * 就躺在日志文件里 —— 用户报障时又会把日志贴出来。
 *
 * 这里除了逐条断言，还做了一件更要紧的事：**拿真的 `parseQuickConnect` 去解析**，
 * 断言"解析出来的 password"一定不在脱敏后的串里。为什么不用写死的期望值 ——
 * 写死的用例只能覆盖我想得到的形态，而漏掉一种形态就是**静默泄露**
 * （比不脱敏更糟，因为会以为已经安全了）。这个断言会因为解析器**新增形态**而失败，
 * 从而逼着人回来补脱敏 —— 这才是想要的信号。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '../..')
const { redactCreds, redactCredsList } = require(resolve(ROOT, 'src/app/common/redact-url.js'))
const { parseQuickConnect } = require(resolve(ROOT, 'src/app/common/parse-quick-connect.js'))

test('带协议的形态：密码被盖掉，用户名和主机留住', () => {
  assert.equal(
    redactCreds('ssh://user:s3cr3t@example.com:22'),
    'ssh://user:***@example.com:22'
  )
})

test('不带协议的简写形态也要盖（只按 scheme:// 写正则会漏掉这种）', () => {
  const out = redactCreds('user:s3cr3t@example.com:22')
  assert.ok(!out.includes('s3cr3t'), `密码泄露了: ${out}`)
  assert.equal(out, 'user:***@example.com:22')
})

test('electerm:// 包裹形态（密码的位置和 ssh:// 一样）', () => {
  const out = redactCreds('electerm://user:s3cr3t@example.com?type=ssh')
  assert.ok(!out.includes('s3cr3t'), `密码泄露了: ${out}`)
})

test('查询参数里的密码同样盖掉', () => {
  assert.ok(!redactCreds('ssh://host?password=s3cr3t').includes('s3cr3t'))
  assert.ok(!redactCreds('ssh://host?a=1&passwd=s3cr3t').includes('s3cr3t'))
  assert.ok(!redactCreds('ssh://host?a=1&PWD=s3cr3t').includes('s3cr3t'))
})

test('没有密码的串原样不动 —— 不能把正常日志改花', () => {
  const plain = [
    'user@example.com',
    'ssh://example.com:22',
    '正在连接 example.com',
    '2026-09-12 10:30:00 连接成功',
    'key:value 这种普通文本不能被当成密码'
  ]
  plain.forEach((s) => assert.equal(redactCreds(s), s))
})

test('非字符串原样返回（日志里什么类型都可能传进来）', () => {
  const obj = { a: 1 }
  assert.equal(redactCreds(obj), obj)
  assert.equal(redactCreds(undefined), undefined)
  assert.equal(redactCreds(42), 42)
})

test('数组形态（second-instance 的 commandLine）逐项脱敏，且不改原数组', () => {
  const argv = ['xnow-terminal.exe', 'ssh://u:p@h', '--flag']
  const out = redactCredsList(argv)
  assert.deepEqual(out, ['xnow-terminal.exe', 'ssh://u:***@h', '--flag'])
  assert.equal(argv[1], 'ssh://u:p@h', '不能就地改掉调用方的数组')
})

test('🔴 用真的解析器兜底：凡解析出 password 的串，脱敏后都不能再出现该密码', () => {
  // 这些形态都是 parseQuickConnect 实测支持的，加新形态时它会失败 → 回来补脱敏
  const forms = [
    'ssh://user:p%40ss@host:22',
    'electerm://user:secret@host?type=ssh',
    'telnet://u:p@h',
    'user:pass@host:22',
    'vnc://user:vncpass@host:5900',
    'rdp://user:rdppass@host:3389',
    'ssh://user:pw@host?sftp=true'
  ]
  const leaked = []
  forms.forEach((form) => {
    const parsed = parseQuickConnect(form)
    assert.ok(parsed && parsed.password, `前提失效：解析器不再认得这种形态了 → ${form}`)
    const redacted = redactCreds(form)
    if (redacted.includes(parsed.password)) {
      leaked.push(`${form} → 脱敏后仍含密码 ${parsed.password}`)
    }
  })
  assert.deepEqual(leaked, [], '有密码没盖住:\n' + leaked.join('\n'))
})
