/**
 * ISSUES #1：交给系统浏览器打开外链时的协议白名单
 *
 * shell.openExternal 不能无脑调用：
 *  - file:// 会打开/执行本机文件
 *  - Windows 上一批协议处理器（ms-msdt: / search-ms: / shell: 等）可被当作本地执行入口
 *  - javascript: / data: 是典型脚本注入入口
 *
 * 这里锁死"哪些协议允许交给系统浏览器"，防止以后有人为了方便把白名单放开。
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const { isSafeExternalUrl } = require('../../src/app/lib/safe-open-external')

test('放行浏览器本该处理的常规协议', () => {
  const allowed = [
    'https://example.com',
    'https://example.com/a/b?c=d#e',
    'http://127.0.0.1:8080/index.html',
    'ftp://files.example.com/pub',
    'ftps://files.example.com/pub',
    'mailto:someone@example.com',
    'tel:+8613800138000'
  ]
  for (const url of allowed) {
    assert.equal(isSafeExternalUrl(url), true, `应放行：${url}`)
  }
})

test('拒绝会导致本地文件访问或本地执行的协议', () => {
  const blocked = [
    'file:///C:/Windows/System32/calc.exe',
    'file://C:/Users/Administrator/.ssh/id_rsa',
    'javascript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    // Windows 协议处理器：这些能借系统组件间接跑命令
    'ms-msdt:/id PCWDiagnostic',
    'search-ms:query=x',
    'shell:startup',
    'ms-officecmd:x'
  ]
  for (const url of blocked) {
    assert.equal(isSafeExternalUrl(url), false, `应拒绝：${url}`)
  }
})

test('无法解析的输入一律拒绝，不能抛异常', () => {
  const bad = ['', 'not a url', 'http://', '://example.com', null, undefined, 123, {}]
  for (const v of bad) {
    assert.equal(isSafeExternalUrl(v), false, `应拒绝：${String(v)}`)
  }
})

test('协议大小写与首尾空白不影响判定', () => {
  // URL 解析会归一化协议大小写；空白会被 URL 解析器处理掉
  assert.equal(isSafeExternalUrl('HTTPS://example.com'), true)
  assert.equal(isSafeExternalUrl('FILE:///C:/Windows/System32/calc.exe'), false)
})

test('协议前缀伪装不能绕过（靠 URL 解析而非字符串前缀匹配）', () => {
  // 朴素实现常写成 url.startsWith('http')，这些就能骗过去
  assert.equal(isSafeExternalUrl('httpfile:///C:/evil.exe'), false)
  assert.equal(isSafeExternalUrl('httpsomething:x'), false)
})
