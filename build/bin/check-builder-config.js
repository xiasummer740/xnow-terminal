/**
 * 校验发版用的 electron-builder 配置确实是本 fork 的那份（ISSUES #25）
 *
 * 仓库里有两份配置：
 *   ./electron-builder.json       本 fork 的（发版脚本 rx 用的就是这份）
 *   build/electron-builder.json  上游 electerm 的（`npm run pb` 会把它拷到根目录）
 * 19 个上游 workflow 都调 `npm run pb`。本地只要误跑一次，根目录那份就被上游配置覆盖。
 *
 * 为什么必须拦住：被覆盖之后 electron-builder 照样能打包、照样能发 release，
 * 但装出来的应用更新链路是断的 —— 上游配置带 `channel: ${env.WORKFLOW_NAME}`，
 * 有 channel 时产出的清单不叫 `latest.yml`，而客户端只认 `latest.yml`，
 * 于是「一键更新」永远收不到新版本，且现象是"检查更新一直说已是最新"，极难倒查。
 * 所以在打包前先把这份配置认一遍，不是本 fork 的就停住。
 */

const { readFileSync } = require('fs')
const { resolve } = require('path')

// 每一条都对应一个具体后果，不是"配置洁癖"
const RULES = [
  {
    path: 'appId',
    expect: 'com.xnow.terminal',
    why: 'appId 是安装身份，换了等于另一个应用，老用户的更新会装不上去'
  },
  {
    path: 'productName',
    expect: 'XNOW Terminal',
    why: 'productName 进安装包文件名，发版脚本按 XNOW-Terminal-… 找产物'
  },
  {
    path: 'nsis.artifactName',
    // 这串 ${...} 是 electron-builder 自己的占位符，照抄配置文件里的原文，不是模板串
    // eslint-disable-next-line no-template-curly-in-string
    expect: 'XNOW-Terminal-${version}-win-x64-installer.${ext}',
    why: '发版脚本与更新清单都按这个文件名认包'
  },
  {
    path: 'nsis.include',
    expect: 'build/nsis-custom.nsh',
    why: '丢了它就没有「升级静默保留用户数据、手动卸载才询问清除」的卸载逻辑'
  },
  {
    path: 'win.publish.owner',
    expect: 'xiasummer740',
    why: '决定 release 发到哪个账号'
  },
  {
    path: 'win.publish.repo',
    expect: 'xnow-terminal',
    why: '决定 release 发到哪个仓库'
  }
]

function get (obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj)
}

/**
 * @returns {string[]} 问题描述；空数组表示这份配置可用
 */
function findProblems (conf) {
  const problems = []
  if (!conf || typeof conf !== 'object') {
    return ['配置读不出来（不是 JSON 对象）']
  }
  for (const { path, expect, why } of RULES) {
    const actual = get(conf, path)
    if (actual !== expect) {
      problems.push(`${path} = ${JSON.stringify(actual)}，应为 ${JSON.stringify(expect)} —— ${why}`)
    }
  }
  // channel 单独判：它必须是"不存在"，而不是某个特定值
  const channel = get(conf, 'win.publish.channel')
  if (channel) {
    problems.push(
      `win.publish.channel = ${JSON.stringify(channel)}，本 fork 不该有 channel —— ` +
      '有 channel 时 electron-builder 不产出 latest.yml，而客户端只认 latest.yml，' +
      '自动更新会永远收不到新版本'
    )
  }
  return problems
}

/**
 * 不是本 fork 的配置就抛异常（供发版脚本在打包前调用）
 */
function checkBuilderConfig (conf, source = 'electron-builder.json') {
  const problems = findProblems(conf)
  if (problems.length) {
    console.error(`\n❌ ${source} 不是本 fork 的配置（${problems.length} 个问题）：`)
    problems.forEach(p => console.error('   - ' + p))
    console.error('\n   本 fork 的配置在版本库里，被 `npm run pb`（上游 workflow 用）覆盖过就恢复它：')
    console.error('     git checkout -- electron-builder.json')
    console.error('   在此中止，避免发出一个自动更新链路是断的包。\n')
    throw new Error(`${source} 不是本 fork 的配置，已中止`)
  }
  return true
}

exports.RULES = RULES
exports.findProblems = findProblems
exports.checkBuilderConfig = checkBuilderConfig

// 单独跑：node build/bin/check-builder-config.js [路径]
if (require.main === module) {
  const ROOT = resolve(__dirname, '../..')
  const file = resolve(ROOT, process.argv[2] || 'electron-builder.json')
  let conf
  try {
    conf = JSON.parse(readFileSync(file, 'utf8'))
  } catch (e) {
    console.error(`读不了 ${file}: ${e.message}`)
    process.exit(1)
  }
  try {
    checkBuilderConfig(conf, process.argv[2] || 'electron-builder.json')
    console.log(`  ✔ ${process.argv[2] || 'electron-builder.json'} 是本 fork 的配置`)
  } catch (e) {
    process.exit(1)
  }
}
