/**
 * 把上游 electerm 的 electron-builder 配置拷到根目录（上游 CI workflow 用）
 *
 * 注意这里拷的是**上游那份**（build/electron-builder.json），会覆盖根目录本 fork 的配置。
 * 上游的 workflow 需要它（build/bin/build-common.js 会按上游的字段结构去改写配置）；
 * 本 fork 的本地发版用的是根目录那份，不需要也不该跑这个命令。
 *
 * 误跑一次的后果（ISSUES #25）：根目录配置变成上游的，之后本地发版打出来的包
 * 自动更新链路是断的（上游配置带 channel → 不产出 latest.yml → 客户端只认 latest.yml），
 * 而打包和发 release 全程不报错。所以这里做两件事：
 *   1. 覆盖前备份成 electron-builder.json.bak（已存在就不覆盖，留住最早那份 ——
 *      万一配置里有还没提交的本地改动，`git checkout` 是救不回来的，只能靠这个备份）
 *   2. 明确喊一声"你刚把本 fork 的配置换掉了"，以及怎么恢复
 */

const { cp } = require('shelljs')
const { existsSync, readFileSync } = require('fs')
const { resolve } = require('path')

const ROOT = resolve(__dirname, '../..')
const target = resolve(ROOT, 'electron-builder.json')
const backup = resolve(ROOT, 'electron-builder.json.bak')

if (existsSync(target) && !existsSync(backup)) {
  cp(target, backup)
  console.log('已备份覆盖前的配置到 electron-builder.json.bak')
}

cp('-r', 'build/electron-builder.json', './')

// 拷完确认这次确实换掉了，才喊话
const { appId } = JSON.parse(readFileSync(target, 'utf8'))
if (appId !== 'com.xnow.terminal') {
  console.warn('\n⚠️  根目录 electron-builder.json 已被换成上游 electerm 的配置（appId: ' + appId + '）。')
  console.warn('   这只在跑上游 CI workflow 时才需要。本地发版（npm run rx）用的是本 fork 的配置，')
  console.warn('   跑完请恢复：')
  console.warn('     git checkout -- electron-builder.json')
  console.warn('   （npm run rx 会在打包前校验这份配置，不恢复会直接中止）\n')
}
