/**
 * 一键发布脚本
 * 用法：node build/bin/release-xnow.js [patch|minor|major]
 *
 * 示例：
 *   node build/bin/release-xnow.js patch   # 3.17.1 → 3.17.2
 *   node build/bin/release-xnow.js minor   # 3.17.1 → 3.18.0
 *
 * 流程：版本自增 → vite 构建 → electron-builder 打包 → 上传 GitHub → 发布 release
 */

const { execSync } = require('child_process')
const { readFileSync, writeFileSync } = require('fs')
const { resolve } = require('path')
const { inc } = require('semver')

const ROOT = resolve(__dirname, '../..')
const bumpType = process.argv[2] || 'patch'

// 读取版本
const rootPkg = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8'))
const workPkg = JSON.parse(readFileSync(resolve(ROOT, 'work/app/package.json'), 'utf8'))

const oldVer = rootPkg.version
const newVer = inc(oldVer, bumpType)

console.log(`\n📦 ${oldVer} → ${newVer} (${bumpType})\n`)

// 更新版本号
rootPkg.version = newVer
workPkg.version = newVer
writeFileSync(resolve(ROOT, 'package.json'), JSON.stringify(rootPkg, null, 2) + '\n')
writeFileSync(resolve(ROOT, 'work/app/package.json'), JSON.stringify(workPkg, null, 2) + '\n')

// Git 提交（work/app/package.json 在 .gitignore 中，需要用 -f 强制添加）
execSync('git add package.json', { cwd: ROOT, stdio: 'inherit' })
execSync('git add -f work/app/package.json', { cwd: ROOT, stdio: 'inherit' })
execSync(`git commit -m "release: v${newVer}"`, { cwd: ROOT, stdio: 'inherit' })
execSync('git push', { cwd: ROOT, stdio: 'inherit' })

// Vite 构建
console.log('\n🏗️  Vite 构建...')
execSync('npm run vite-build', { cwd: ROOT, stdio: 'inherit' })

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
const uploadedFiles = execSync(`gh release view v${newVer} --json assets -q '.assets[].name'`, {
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
