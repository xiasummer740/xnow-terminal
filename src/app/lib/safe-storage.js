/**
 * Safe storage wrapper using Electron's safeStorage API.
 * Provides OS-level encryption:
 *   - macOS:   Keychain
 *   - Windows: DPAPI (Data Protection API, bound to current user account)
 *   - Linux:   libsecret / gnome-keyring (falls back to an internal key)
 *
 * Encrypted values are stored as base64 strings prefixed with SAFE_PREFIX so
 * they can be distinguished from plain-text or legacy-encrypted values.
 *
 * ⚠️ When safeStorage is unavailable, plaintext fallback is silent by design
 * (to avoid breaking offline/CI usage), but a warning is logged to console.
 */

const SAFE_PREFIX = 'v2:safe:'

let _ss = null

function getSS () {
  if (_ss === null) {
    try {
      const { safeStorage } = require('electron')
      _ss = safeStorage
    } catch (_) {
      _ss = undefined
    }
  }
  return _ss
}

/**
 * Check if safeStorage is available on this platform
 * @returns {boolean}
 */
exports.isSafeStorageAvailable = function () {
  return !!getSS()
}

/**
 * Encrypt a string using the OS-level secure storage.
 * Returns the original string unchanged when safeStorage is unavailable.
 * @param {string} str
 * @returns {string}
 */
exports.safeEncrypt = function (str) {
  if (typeof str !== 'string' || !str) return str
  const ss = getSS()
  if (!ss) {
    console.warn('[safe-storage] safeStorage unavailable — storing passwords in plaintext!')
    return str
  }
  try {
    const buf = ss.encryptString(str)
    return SAFE_PREFIX + buf.toString('base64')
  } catch (e) {
    console.error('[safe-storage] encrypt error:', e.message)
    return str
  }
}

/**
 * Decrypt a string that was encrypted with safeEncrypt.
 * Returns the original string unchanged when it was not produced by safeEncrypt.
 * @param {string} str
 * @returns {string}
 */
exports.safeDecrypt = function (str) {
  if (typeof str !== 'string' || !str) return str
  if (!str.startsWith(SAFE_PREFIX)) return str
  const ss = getSS()
  if (!ss) {
    console.warn('[safe-storage] safeStorage unavailable — cannot decrypt, returning raw value')
    return str
  }
  try {
    const base64 = str.slice(SAFE_PREFIX.length)
    const buf = Buffer.from(base64, 'base64')
    return ss.decryptString(buf)
  } catch (e) {
    console.error('[safe-storage] decrypt error:', e.message)
    return str
  }
}
