/**
 * Release 产物清单 + 完整性判定（ISSUES #32）
 *
 * electron-builder 的 `--publish always` 会**间歇性**漏传文件：打包正常、
 * release 正常、`gh release view` 也正常，只有用户那边出问题。
 * 实测 `v3.17.8` / `v3.17.10` 的 release 里没有 `.blockmap`，
 * 而本地 `dist/` 里明明有 —— 于是那两版的用户更新时走的是 116MB 全量下载。
 *
 * 原来脚本里只有 `.exe` 和 `latest.yml` 的兜底，**没管 blockmap**，
 * 所以漏了也没人知道。这里把「一个 release 该有哪些文件」收敛成一份可测的清单，
 * 发布脚本照着核 —— 别再靠人记得。
 */

/**
 * 一个 release 必须有的文件
 * @param {string} version 不带 v 前缀的版本号
 * @returns {Array<{name: string, why: string}>}
 */
function requiredAssets (version) {
  const installer = `XNOW-Terminal-${version}-win-x64-installer.exe`
  return [
    { name: installer, why: '安装包本体' },
    { name: `${installer}.blockmap`, why: '差量更新用，缺了退化成全量下载' },
    { name: 'latest.yml', why: '客户端靠它判断有没有新版本' }
  ]
}

/**
 * @param {string[]} uploadedNames release 上已有的文件名
 * @param {string} version
 * @returns {Array<{name: string, why: string}>} 缺的（空数组 = 齐了）
 */
function findMissingAssets (uploadedNames, version) {
  const have = new Set(uploadedNames)
  return requiredAssets(version).filter((a) => !have.has(a.name))
}

module.exports = { requiredAssets, findMissingAssets }
