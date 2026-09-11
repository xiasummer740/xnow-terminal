/**
 * 校验「准备打包的目录」里的主进程代码确实等于源码目录（ISSUES #27）
 *
 * 背景：electron-builder 打的是 work/app，而 work/app 里的东西来自两处 ——
 *   渲染层 work/app/assets ← vite-build 刷新
 *   主进程代码 work/app/*.js ← 只有 prepare.js 的 `cp -r src/app work/` 才会刷新
 * 发布脚本原先只跑 vite-build，于是包是「新渲染层 + 上一次跑 npm run b 时的旧主进程」。
 * 这种错误是静默的：版本号、安装包、GitHub release 全都正常，只有用户装上去才发现修复没生效。
 * 所以在打包前比一遍目录内容，不一致就直接失败。
 *
 * 抽成独立模块（而不是写在 release-xnow.js 里）是为了能拿临时目录当真值/假值来测它本身 ——
 * 一个永远返回「通过」的校验比没有校验更糟，因为发布时不会再有人去核对它报了什么。
 *
 * 只做单向检查（源码里每个文件都在打包目录里且内容相同）：
 * 发布流程一开始会 clean 掉整个 work，不存在打包目录里残留「源码已删除文件」的情形。
 */

const { readdirSync, readFileSync } = require('fs')
const { resolve } = require('path')

/**
 * 递归比较两棵目录树里源码侧出现的每个文件
 * @returns {{checked: number, problems: string[]}}
 */
function compareTree (srcDir, workDir) {
  const problems = []
  let checked = 0

  const walk = (rel) => {
    for (const entry of readdirSync(resolve(srcDir, rel), { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(childRel)
        continue
      }
      checked++
      let workBuf
      try {
        workBuf = readFileSync(resolve(workDir, childRel))
      } catch (e) {
        problems.push(`缺失: ${childRel}`)
        continue
      }
      if (!readFileSync(resolve(srcDir, childRel)).equals(workBuf)) {
        problems.push(`内容不一致: ${childRel}`)
      }
    }
  }
  walk('')

  return { checked, problems }
}

/**
 * 不一致就抛异常（供发布脚本在打包前调用）；一致返回检查过的文件数
 */
function checkMainProcessFresh (srcDir, workDir) {
  const { checked, problems } = compareTree(srcDir, workDir)
  if (problems.length) {
    console.error(`\n❌ 打包目录与源码不一致（查了 ${checked} 个文件，${problems.length} 个有问题）：`)
    problems.slice(0, 20).forEach(p => console.error('   - ' + p))
    if (problems.length > 20) {
      console.error(`   …另有 ${problems.length - 20} 个`)
    }
    console.error(`\n   源码目录: ${srcDir}`)
    console.error(`   打包目录: ${workDir}`)
    console.error('\n   打包目录的主进程代码只由 `npm run prepare-file`')
    console.error('   （build/bin/prepare.js 里的 `cp -r src/app work/`）刷新。')
    console.error('   在此中止，避免把旧主进程代码当成新版本发出去。\n')
    throw new Error('打包目录里的主进程代码不是最新的，已中止')
  }
  console.log(`  ✔ 打包目录与源码一致（${checked} 个文件）`)
  return checked
}

exports.compareTree = compareTree
exports.checkMainProcessFresh = checkMainProcessFresh

// 单独跑：node build/bin/check-src-fresh.js —— 不发版也能查当前 work/app 新不新
if (require.main === module) {
  const ROOT = resolve(__dirname, '../..')
  try {
    checkMainProcessFresh(
      resolve(ROOT, 'src/app'),
      resolve(ROOT, process.argv[2] || 'work/app')
    )
  } catch (e) {
    process.exit(1)
  }
}
