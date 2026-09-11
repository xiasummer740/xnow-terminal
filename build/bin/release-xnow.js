/**
 * 一键发布脚本
 * 用法：node build/bin/release-xnow.js [patch|minor|major]
 *
 * 示例：
 *   node build/bin/release-xnow.js patch   # 3.17.1 → 3.17.2
 *   node build/bin/release-xnow.js minor   # 3.17.1 → 3.18.0
 *
 * 流程：版本自增 → 完整构建 → electron-builder 打包 → 上传 GitHub → 发布 release
 */

const { execSync } = require('child_process')
const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')
const { inc } = require('semver')
const { checkMainProcessFresh } = require('./check-src-fresh')
const { checkBuilderConfig } = require('./check-builder-config')

const ROOT = resolve(__dirname, '../..')
const bumpType = process.argv[2] || 'patch'

// 打包配置先认一遍（ISSUES #25）：`npm run pb` 会把上游 electerm 的配置拷到根目录，
// 那份带 channel，产出的清单不叫 latest.yml，客户端永远收不到更新 ——
// 而打包和发 release 都不会报错。所以连版本号都还没改之前就先拦。
checkBuilderConfig(
  JSON.parse(readFileSync(resolve(ROOT, 'electron-builder.json'), 'utf8'))
)
console.log('  ✔ electron-builder.json 是本 fork 的配置')

// 读取版本，只改根 package.json
// work/app/package.json 不用在这里写：下面的 `npm run b` 会先 clean 掉整个 work，
// 再由 prepare.js 依据根 package.json 重新生成（版本号自然就是新的）。
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))

const oldVer = rootPkg.version
const newVer = inc(oldVer, bumpType)

console.log(`\n📦 ${oldVer} → ${newVer} (${bumpType})\n`)

rootPkg.version = newVer
writeFileSync(resolve(ROOT, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')

// 必须跑完整构建，不能只跑 vite-build（ISSUES #27）
// electron-builder 打的是 work/app，而 work/app 里的东西来自两处：
//   - 渲染层 work/app/assets ← vite-build 刷新（原来就只有这一步）
//   - 主进程代码 work/app/*.js ← 只有 prepare.js 的 `cp -r src/app work/` 才会刷新
// 原来这里只跑 vite-build，于是打出来的包是「新渲染层 + 上一次跑 `npm run b` 时的旧主进程」，
// 版本号是新的、主进程修复一个都没进去。改成跑 b（clean + compile + prepare-file），
// 代价是每次发版多花几分钟复制 node_modules，换来的是包里代码确实等于当前 src。
console.log('\n🏗️  完整构建（clean + compile + prepare-file）...')
execSync('npm run b', { cwd: ROOT, stdio: 'inherit' })

// 构建完再核一遍：work/app 必须和 src/app 一致。
// 上面那行是「应该没问题」，这里是「出了问题立刻停」—— 打包旧代码是静默失败，
// 版本号、安装包、GitHub release 全都正常，只有用户装上去发现修复没生效。
checkMainProcessFresh(resolve(ROOT, 'src/app'), resolve(ROOT, 'work/app'))

// Git 提交放在构建之后：构建失败就停在这里，不会留下一个「已推送但没产物」的版本号。
// work/app/package.json 也要等构建完才存在（由 prepare.js 生成），所以 git add 只能放在这里；
// 顺带一个好处是这个文件提交完之后不会再被改写，发完版工作区是干净的。
execSync('git add package.json', { cwd: ROOT, stdio: 'inherit' })
execSync('git add -f work/app/package.json', { cwd: ROOT, stdio: 'inherit' })
execSync(`git commit -m "release: v${newVer}"`, { cwd: ROOT, stdio: 'inherit' })
execSync('git push', { cwd: ROOT, stdio: 'inherit' })

// electron-builder 打包 + 发布
console.log('\n📀 打包并发布到 GitHub...')
const ghToken = execSync('gh auth token', { encoding: 'utf8' }).trim()
execSync('npx electron-builder --config electron-builder.json --win --x64 --publish always', {
  cwd: ROOT,
  stdio: 'inherit',
  env: { ...process.env, GH_TOKEN: ghToken }
})

// electron-builder 有时上传不全（latest.yml / .exe 被吞），兜底补传
console.log('\n🔍 检查 Release 文件完整性...')
const installerName = `XNOW-Terminal-${newVer}-win-x64-installer.exe`
const uploadedFiles = execSync(`gh release view v${newVer} --json assets --jq ".assets[].name"`, {
  cwd: ROOT, encoding: 'utf8'
}).trim().split('\n')
if (!uploadedFiles.includes(installerName)) {
  console.log('  ⬆️  补传安装包...')
  execSync(`gh release upload v${newVer} "dist/${installerName}" --clobber`, { cwd: ROOT, stdio: 'inherit' })
}
if (!uploadedFiles.includes('latest.yml')) {
  console.log('  ⬆️  补传 latest.yml...')
  execSync(`gh release upload v${newVer} dist/latest.yml --clobber`, { cwd: ROOT, stdio: 'inherit' })
}

// 发布 draft release
console.log('\n🚀 发布 GitHub Release...')
execSync(`gh release edit v${newVer} --draft=false`, { cwd: ROOT, stdio: 'inherit' })

console.log(`\n✅ v${newVer} 发布完成！`)
console.log(`   https://github.com/xiasummer740/xnow-terminal/releases/tag/v${newVer}`)
