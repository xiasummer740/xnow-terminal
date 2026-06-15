/**
 * Safe storage wrapper using Electron's safeStorage API.
 * Provides OS-level encryption:
 *   - macOS:   Keychain
 *   - Windows: DPAPI (Data Protection API, bound to current user account)
 *   - Linux:   libsecret / gnome-keyring (falls back to internal AES-256-GCM)
 *
 * Encrypted values use prefixes to distinguish encryption levels:
 *   v2:safe:     OS-level encryption (safeStorage)
 *   v2:fb:       AES-256-GCM fallback (used when safeStorage unavailable)
 *   v2:insecure: 明文标记（仅当降级加密也失败时的最后手段，app 应检测并警告）
 */

const { safeStorage } = require('electron')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const os = require('os')

const SAFE_PREFIX = 'v2:safe:'
const FALLBACK_PREFIX = 'v2:fb:'
const INSECURE_PREFIX = 'v2:insecure:'
const KEY_FILENAME = '.xnow-storage-key'

let _ss = null
let _fallbackKey = null

function getSS () {
  if (_ss === null) {
    try {
      _ss = safeStorage
    } catch (_) {
      _ss = undefined
    }
  }
  return _ss
}

/**
 * Check if OS-level safeStorage is available
 * @returns {boolean}
 */
exports.isSafeStorageAvailable = function () {
  const ss = getSS()
  return ss && ss.isEncryptionAvailable()
}

/**
 * Get or create the fallback AES-256-GCM key.
 * Key is stored in user's home directory with restricted permissions.
 * @returns {string|null} hex-encoded 32-byte key, or null if impossible
 */
function getFallbackKey () {
  if (_fallbackKey) return _fallbackKey
  const keyDir = path.join(os.homedir(), '.xnow-terminal')
  const keyPath = path.join(keyDir, KEY_FILENAME)
  try {
    if (fs.existsSync(keyPath)) {
      _fallbackKey = fs.readFileSync(keyPath, 'utf8').trim()
    } else {
      fs.mkdirSync(keyDir, { recursive: true })
      _fallbackKey = crypto.randomBytes(32).toString('hex')
      fs.writeFileSync(keyPath, _fallbackKey, { mode: 0o600 })
    }
    return _fallbackKey
  } catch (e) {
    console.error('[safe-storage] 无法创建降级加密密钥文件:', e.message)
    return null
  }
}

/**
 * AES-256-GCM encrypt with machine-local key (fallback when safeStorage unavailable)
 */
function fallbackEncrypt (str) {
  const keyHex = getFallbackKey()
  if (!keyHex) return null
  const key = Buffer.from(keyHex, 'hex')
  const iv = crypto.randomBytes(12)
  const salt = crypto.randomBytes(16)
  const derivedKey = crypto.scryptSync(key, salt, 32)
  const cipher = crypto.createCipheriv('aes-256-gcm', derivedKey, iv)
  let encrypted = cipher.update(str, 'utf8', 'hex')
  encrypted += cipher.final('hex')
  const authTag = cipher.getAuthTag()
  return FALLBACK_PREFIX +
    iv.toString('hex') + ':' +
    salt.toString('hex') + ':' +
    authTag.toString('hex') + ':' +
    encrypted
}

/**
 * AES-256-GCM decrypt with machine-local key
 */
function fallbackDecrypt (str) {
  const keyHex = getFallbackKey()
  if (!keyHex) return null
  const body = str.slice(FALLBACK_PREFIX.length)
  const parts = body.split(':')
  if (parts.length < 4) return null
  const iv = Buffer.from(parts[0], 'hex')
  const salt = Buffer.from(parts[1], 'hex')
  const authTag = Buffer.from(parts[2], 'hex')
  const ciphertext = parts.slice(3).join(':')
  const key = Buffer.from(keyHex, 'hex')
  const derivedKey = crypto.scryptSync(key, salt, 32)
  try {
    const decipher = crypto.createDecipheriv('aes-256-gcm', derivedKey, iv)
    decipher.setAuthTag(authTag)
    let decrypted = decipher.update(ciphertext, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    return decrypted
  } catch (e) {
    console.error('[safe-storage] fallback decrypt error:', e.message)
    return null
  }
}

/**
 * Encrypt a string.
 * Uses OS-level safeStorage if available, otherwise falls back to
 * AES-256-GCM with a machine-local key. If even that fails, stores
 * with an INSECURE marker — the app should detect and warn the user.
 *
 * @param {string} str
 * @returns {string} encrypted string with prefix, or original on error
 */
exports.safeEncrypt = function (str) {
  if (typeof str !== 'string' || !str) return str
  const ss = getSS()
  // Level 1: OS-level encryption
  if (ss && ss.isEncryptionAvailable()) {
    try {
      const buf = ss.encryptString(str)
      return SAFE_PREFIX + buf.toString('base64')
    } catch (e) {
      console.error('[safe-storage] encrypt error:', e.message)
    }
  }
  // Level 2: AES-256-GCM fallback
  const fb = fallbackEncrypt(str)
  if (fb) {
    console.warn(
      '[safe-storage] 系统级加密不可用，使用 AES-256-GCM 降级加密。' +
      '密码存储在本地密钥文件中，安全性低于系统级加密。'
    )
    return fb
  }
  // Level 3: 明文标记（最后手段，可被检测到）
  console.error(
    '[safe-storage] 危险：所有加密方式均不可用！' +
    '凭据将以不安全方式标记存储。请检查系统环境。'
  )
  return INSECURE_PREFIX + str
}

/**
 * Decrypt a string that was encrypted with safeEncrypt.
 * Supports all encryption levels.
 *
 * @param {string} str
 * @returns {string}
 */
exports.safeDecrypt = function (str) {
  if (typeof str !== 'string' || !str) return str

  // Level 1: OS-level decryption
  if (str.startsWith(SAFE_PREFIX)) {
    const ss = getSS()
    if (ss && ss.isEncryptionAvailable()) {
      try {
        const base64 = str.slice(SAFE_PREFIX.length)
        const buf = Buffer.from(base64, 'base64')
        return ss.decryptString(buf)
      } catch (e) {
        console.error('[safe-storage] decrypt error:', e.message)
        return str
      }
    }
    // safeStorage 不可用但数据是 v2:safe: 格式 —— 尝试降级解密
    const fb = fallbackDecrypt(str.slice(SAFE_PREFIX.length))
    if (fb !== null) return fb
    console.warn('[safe-storage] 无法解密 v2:safe: 数据，返回原始值')
    return str
  }

  // Level 2: AES-256-GCM fallback
  if (str.startsWith(FALLBACK_PREFIX)) {
    const result = fallbackDecrypt(str)
    if (result !== null) return result
    console.error('[safe-storage] fallback decrypt failed, returning raw value')
    return str
  }

  // Level 3: insecure marker — just strip the prefix
  if (str.startsWith(INSECURE_PREFIX)) {
    console.warn('[safe-storage] 读取到不安全存储的数据')
    return str.slice(INSECURE_PREFIX.length)
  }

  return str
}
