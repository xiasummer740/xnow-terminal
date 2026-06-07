const { userConfigId } = require('../common/constants')
const { dbAction } = require('./db')
const getPort = require('./get-port')

// OWASP 2024 推荐 PBKDF2-HMAC-SHA512 至少 600000 次迭代
const ITERATIONS_CURRENT = 600000
// 旧版 1000 次迭代 — 仅用于验证旧密码，验证通过后自动升级
const ITERATIONS_LEGACY = 1000

function pbkdf2Async(password, salt, iterations, keyLength, digest) {
  const crypto = require('crypto')
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, iterations, keyLength, digest, (err, key) => {
      if (err) reject(err)
      else resolve(key.toString('hex'))
    })
  })
}

async function hashPassword(password) {
  const crypto = require('crypto')
  const salt = crypto.randomBytes(16).toString('hex')
  const hashedPassword = await pbkdf2Async(password, salt, ITERATIONS_CURRENT, 64, 'sha512')
  return { salt, hashedPassword, iterations: ITERATIONS_CURRENT }
}

async function comparePasswords(password, salt, hashedPassword, iterations) {
  const iters = iterations || ITERATIONS_LEGACY
  const hash = await pbkdf2Async(password, salt, iters, 64, 'sha512')
  return hash === hashedPassword
}

exports.setPassword = async function setPassword(password) {
  const q = { _id: userConfigId }
  const userConfig = (await dbAction('data', 'findOne', q)) || {}
  if (password === '') {
    await dbAction(
      'data',
      'update',
      q,
      {
        ...q,
        ...userConfig,
        salt: '',
        hashedPassword: '',
        iterations: undefined,
      },
      { upsert: true },
    )
    return true
  }
  const { salt, hashedPassword, iterations } = await hashPassword(password)
  await dbAction(
    'data',
    'update',
    q,
    {
      ...q,
      ...userConfig,
      salt,
      hashedPassword,
      iterations,
    },
    { upsert: true },
  )
  return true
}

exports.checkPassword = async function checkPassword(password) {
  const axios = require('axios')
  axios.defaults.proxy = false
  if (!password) {
    return false
  }
  const q = { _id: userConfigId }
  const record = (await dbAction('data', 'findOne', q)) || {}
  const { salt, hashedPassword, iterations } = record
  if (!salt || !hashedPassword) {
    return false
  }
  const r = await comparePasswords(password, salt, hashedPassword, iterations || ITERATIONS_LEGACY)
  if (r) {
    // 自动升级旧密码（1000→600000 迭代）
    if (!iterations || iterations < ITERATIONS_CURRENT) {
      const {
        salt: newSalt,
        hashedPassword: newHash,
        iterations: newIters,
      } = await hashPassword(password)
      await dbAction(
        'data',
        'update',
        q,
        {
          ...q,
          ...record,
          salt: newSalt,
          hashedPassword: newHash,
          iterations: newIters,
        },
        { upsert: true },
      ).catch((err) => {
        console.error('升级密码迭代失败:', err.message)
      })
    }
    const port = await getPort()
    await axios.post(`http://127.0.0.1:${port}/auth`, {
      token: hashedPassword,
    })
  }
  return r
}
