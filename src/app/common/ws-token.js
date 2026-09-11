/**
 * 本机 WS 服务的鉴权 token（ISSUES #3）
 *
 * 原来用的是 `common/uid.js` 的 `nanoid(7)` —— 拿**给所有 ID 用的短随机串**当鉴权凭据：
 * 7 个字符 / 64 进制 = 42 bit，强度明显不够，而且和会话 ID、终端 ID 共用同一个生成器，
 * 那些 ID 会出现在界面、日志、URL 里，等于把鉴权凭据和到处可见的标识混在一个熵池。
 *
 * 这里单独用 32 字节 CSPRNG 生成（256 bit，base64url 43 字符），
 * 不复用 uid()，避免改 ID 长度影响别处。
 */

const { randomBytes } = require('crypto')

function generateWsToken () {
  return randomBytes(32).toString('base64url')
}

module.exports = { generateWsToken }
