/**
 * ISSUES #2：AI Agent 文件工具的路径闸门
 *
 * 这个闸门挡不挡得住，等于「渲染进程能不能任意读本机文件 + 任意写开机自启」。
 * 下面每条用例都对应 temp/probe-pathsafe.js 里实测放行过的一个口子，
 * 锁死不让它回来。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const os = require('os')
const { resolve } = require('path')
const { isPathSafe } = require('../../src/app/lib/path-safe')

const isWin = process.platform === 'win32'
const WINDOWS = process.env.SystemRoot || 'C:\\Windows'
const H = os.homedir()

test('正常业务路径必须放行（闸门不能把功能也挡了）', () => {
  const allowed = [
    resolve(os.tmpdir(), 'xnow-test', 'a.txt'),
    resolve(H, 'projects', 'demo', 'index.js')
  ]
  for (const p of allowed) {
    assert.equal(isPathSafe(p), true, `应放行：${p}`)
  }
})

test('拒绝系统目录本身与其子路径', () => {
  if (!isWin) {
    for (const p of ['/etc/passwd', '/etc', '/proc/1/environ', '/root/.bashrc', '/sys/kernel']) {
      assert.equal(isPathSafe(p), false, `应拒绝：${p}`)
    }
    return
  }
  const blocked = [
    resolve(WINDOWS, 'System32', 'config', 'SAM'),
    resolve(WINDOWS, 'System32', 'drivers', 'etc', 'hosts'),
    WINDOWS,
    resolve(process.env.ProgramData || 'C:\\ProgramData', 'x')
  ]
  for (const p of blocked) {
    assert.equal(isPathSafe(p), false, `应拒绝：${p}`)
  }
})

test('\\\\?\\ 与 \\\\.\\ 设备路径不能绕过（path.resolve 会原样带着前缀）', () => {
  if (!isWin) {
    return
  }
  const prefix = WINDOWS.replace(/^([A-Za-z]):/, '$1:')
  const bypasses = [
    `\\\\?\\${prefix}\\System32\\config\\SAM`,
    `\\\\.\\${prefix}\\System32\\config\\SAM`,
    `\\\\?\\${prefix}\\System32\\drivers\\etc\\hosts`
  ]
  for (const p of bypasses) {
    assert.equal(isPathSafe(p), false, `设备路径应拒绝：${p}`)
  }
})

test('大小写与分隔符混淆不能绕过', () => {
  if (!isWin) {
    return
  }
  const variants = [
    `${WINDOWS.toUpperCase()}\\System32\\config\\SAM`,
    WINDOWS.toLowerCase() + '\\system32\\config\\SAM',
    WINDOWS.replace(/\\/g, '/') + '/System32/config/SAM'
  ]
  for (const p of variants) {
    assert.equal(isPathSafe(p), false, `应拒绝：${p}`)
  }
})

test('用 .. 绕回敏感目录不能绕过（resolve 之后仍要拦）', () => {
  if (!isWin) {
    assert.equal(isPathSafe('/etc/../etc/passwd'), false)
    return
  }
  const p = resolve(WINDOWS, 'System32', '..', 'System32', 'config', 'SAM')
  assert.equal(isPathSafe(p), false, p)
  // 中途带 .. 的原始串会被遍历正则先挡下
  assert.equal(isPathSafe(`${WINDOWS}\\System32\\..\\System32\\config\\SAM`), false)
})

test('用户级敏感目录：私钥 / 开机自启 / 本应用密钥文件', () => {
  const sensitive = [
    resolve(H, '.ssh', 'id_rsa'),
    resolve(H, '.ssh'),
    resolve(H, '.xnow-terminal', '.xnow-storage-key'),
    resolve(H, '.aws', 'credentials'),
    resolve(H, '.gnupg', 'secring.gpg')
  ]
  if (isWin) {
    sensitive.push(resolve(H, 'AppData/Roaming/Microsoft/Windows/Start Menu/Programs/Startup', 'evil.bat'))
  }
  for (const p of sensitive) {
    assert.equal(isPathSafe(p), false, `应拒绝：${p}`)
  }
})

test('前缀相似的兄弟目录不能误判成敏感目录的子路径', () => {
  if (!isWin) {
    // /etc 与 /etcfoo 是两回事
    assert.equal(isPathSafe('/etcfoo/bar.txt'), true, '/etcfoo 不是 /etc 的子路径')
    return
  }
  // C:\WindowsX 不是 C:\Windows 的子路径
  const sibling = resolve(WINDOWS + 'X', 'a.txt')
  assert.equal(isPathSafe(sibling), true, sibling)
})

test('非字符串/空值一律拒绝，不能抛异常', () => {
  const bad = ['', null, undefined, 123, {}, [], true]
  for (const v of bad) {
    assert.equal(isPathSafe(v), false, `应拒绝：${String(v)}`)
  }
})

test('含空字节的路径一律拒绝（截断攻击）', () => {
  if (!isWin) {
    assert.equal(isPathSafe('/etc/passwd\u0000.txt'), false)
    return
  }
  assert.equal(isPathSafe(`${WINDOWS}\\System32\\config\\SAM\u0000.txt`), false)
  assert.equal(isPathSafe('C:\\Users\\me\\a.txt\u0000'), false)
})
