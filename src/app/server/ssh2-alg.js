/**
 * all supported ssh2 algorithms config
 *
 * 分两档（ISSUES #47）：
 *   · algDefault —— 正常连接用的**强套件**，不再包含已破解的（group1-sha1 / md5 系列）
 *   · algAlt     —— 握手"找不到共同算法"后的**重试**档，才把老古董套件加回去
 *
 * 这么分是因为"永远在提供"和"老设备还能连"可以同时满足：正常连接不主动报价
 * 已破解的算法，真遇到只认这些的老设备，`reTryAltAlg()` 会用 algAlt 重试一次。
 * 原来 group1-sha1 / hmac-md5 是塞在 default 里的 —— 等于每次连接都在报价。
 */
const nodeCrypto = require('crypto')
const browserDH = require('diffie-hellman/browser')

nodeCrypto.createDiffieHellmanGroup = browserDH.createDiffieHellmanGroup
nodeCrypto.createDiffieHellman = browserDH.createDiffieHellman

// 已破解 / 过弱，只留给重试档（ISSUES #47）
// group1-sha1 = 1024 位 Oakley Group 2（Logjam）；md5 系列 MAC 强度已不可接受
const LEGACY_KEX = ['diffie-hellman-group1-sha1']
const LEGACY_HMAC = ['hmac-md5', 'hmac-md5-96']

exports.algDefault = () => ({
  kex: [
    'curve25519-sha256', // (node v13.9.0 or newer)
    'curve25519-sha256@libssh.org', // (node v13.9.0 or newer)
    'diffie-hellman-group14-sha256',
    'diffie-hellman-group15-sha512',
    'diffie-hellman-group16-sha512',
    'diffie-hellman-group17-sha512',
    'diffie-hellman-group18-sha512',
    'ecdh-sha2-nistp256',
    'ecdh-sha2-nistp384',
    'ecdh-sha2-nistp521',
    'diffie-hellman-group-exchange-sha256',
    // sha1 系列保留：还有大量在役设备只认它（OpenSSH 也仍然默认启用 hmac-sha1）
    'diffie-hellman-group14-sha1',
    'diffie-hellman-group-exchange-sha1'
  ],
  hmac: [
    'hmac-sha2-256',
    'hmac-sha2-512',
    'hmac-sha1',
    'hmac-sha2-256-96',
    'hmac-sha2-512-96',
    'hmac-ripemd160',
    'hmac-sha1-96',
    'hmac-sha2-256-etm@openssh.com',
    'hmac-sha2-512-etm@openssh.com',
    'hmac-sha1-etm@openssh.com'
  ],
  compress: [
    'zlib@openssh.com',
    'zlib',
    'none'
  ]
})

exports.algAlt = () => ({
  ...exports.algDefault(),
  // 重试档才把已破解的加回来 —— 老设备只认这些时，`reTryAltAlg()` 还能连上
  kex: [...exports.algDefault().kex, ...LEGACY_KEX],
  hmac: [...exports.algDefault().hmac, ...LEGACY_HMAC],
  cipher: [
    // 'chacha20-poly1305@openssh.com',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    'aes128-gcm',
    'aes128-gcm@openssh.com',
    'aes256-gcm',
    'aes256-gcm@openssh.com',
    'aes256-cbc',
    'aes192-cbc',
    'aes128-cbc',
    'aes128-ctr',
    'aes192-ctr',
    'aes256-ctr',
    // 老设备的最后手段：3des 虽弱，但还有在役设备只认它（重试档才走到这）
    '3des-cbc'
    // 这里原本还有 blowfish-cbc / arcfour256 / arcfour128 / arcfour。
    // 它们**这个 ssh2 构建根本不支持**，而 ssh2 对显式数组里不认识的算法名是**直接抛错**
    // （utils.js generateAlgorithmList: `throw new Error('Unsupported algorithm: ...')`）——
    // 也就是说 algAlt() 一调用就抛，`reTryAltAlg()` 的重试路径**从来没成功过**。
    // 删掉不是"放弃这几个算法"（本来也用不了），而是让兜底路径真的能跑起来。
    // 'cast128-cbc' 同理（一直注释着）
  ],
  serverHostKey: [
    'ssh-rsa',
    'ssh-ed25519',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'ssh-dss',
    'rsa-sha2-512',
    'rsa-sha2-256'
  ]
})
