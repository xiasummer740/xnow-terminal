/**
 * ⚠️  WARNING: This is obfuscation (字符偏移混淆), NOT encryption.
 *
 * This module provides a simple character-shift obfuscation for
 * low-sensitivity use (e.g. hiding tokens in config files from casual
 * shoulder-surfing). It provides NO cryptographic security.
 *
 * For actual encryption use enc.js (AES-256-GCM + scrypt) instead.
 *
 * @deprecated — 新代码不要使用，密码/密钥等敏感数据请走 enc.js
 */

exports.enc = (str) => {
  if (typeof str !== 'string') {
    return str
  }
  return str.split('').map((s, i) => {
    return String.fromCharCode((s.charCodeAt(0) + i + 1) % 65536)
  }).join('')
}

exports.dec = (str) => {
  if (typeof str !== 'string') {
    return str
  }
  return str.split('').map((s, i) => {
    return String.fromCharCode((s.charCodeAt(0) - i - 1 + 65536) % 65536)
  }).join('')
}
