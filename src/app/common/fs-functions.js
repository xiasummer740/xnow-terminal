/**
 * 本机 WS 文件服务允许调用的函数名单（ISSUES #3）
 *
 * 这份名单原本只交给前端（`getConstants().fsFunctions`），前端照着它拼 API ——
 * 但**服务端从来没校验过**：`server/fs.js` 直接 `fs[func](...args)`，
 * func 完全由客户端消息决定。于是名单形同虚设：
 *   - 原型链成员（`constructor` / `__proto__` / `toString`）也摸得到
 *   - 名单外的 `fs/promises` 函数（`rm` / `symlink` / `chown` …）照样能调
 * 现在前后端共用这一份，服务端按它校验。
 *
 * 改名单要同步想清楚：加进来的函数就等于开给本机 WS 客户端。
 */
module.exports = [
  'run',
  'runWinCmd',
  'access',
  'statAsync',
  'lstatAsync',
  'cp',
  'mv',
  'mkdir',
  'touch',
  'chmod',
  'rename',
  'unlink',
  'rmrf',
  'readdirAsync',
  'readFile',
  'readFileAsBase64',
  'writeFile',
  'openFile',
  'zipFolder',
  'unzipFile',
  'readCustom',
  'exists',
  'readdir',
  'realpath',
  'statCustom',
  'openCustom',
  'closeCustom',
  'writeCustom',
  'getFolderSize'
]
