/**
 * ISSUES #27：发布链路必须把「当前源码」打进包里
 *
 * 这块的失败模式是**静默**的：构建步骤少跑一步，版本号、安装包、GitHub release
 * 全都正常，只有用户装上去才发现修复没生效。所以要两件事：
 *   1. 校验器本身可信 —— 拿临时目录造「真值/假值」测它认不认得出（永远返回通过的校验比没有更糟）
 *   2. 链路本身别被改回去 —— 把「发布脚本必须跑完整构建」钉成测试，
 *      以后有人（包括我）图快把 npm run b 换回 vite-build，这里会红
 */

const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('fs')
const os = require('os')
const { join, resolve } = require('path')
const { compareTree, checkMainProcessFresh } = require('../../build/bin/check-src-fresh')
const { findProblems } = require('../../build/bin/check-builder-config')

const ROOT = resolve(__dirname, '../..')

function fixture (files) {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'xnow-rc-'))
  for (const [rel, content] of Object.entries(files)) {
    const p = join(dir, rel)
    fs.mkdirSync(join(p, '..'), { recursive: true })
    fs.writeFileSync(p, content)
  }
  return dir
}

const cleanups = []
function withTwoTrees (srcFiles, workFiles, fn) {
  const src = fixture(srcFiles)
  const work = fixture(workFiles)
  cleanups.push(src, work)
  return fn(src, work)
}

test.after(() => {
  for (const d of cleanups) {
    try { fs.rmSync(d, { recursive: true, force: true }) } catch (e) {}
  }
})

test('两棵树一致 → 没有问题，且确实检查了文件', () => {
  withTwoTrees(
    { 'app.js': 'a', 'lib/x.js': 'xx', 'lib/deep/y.js': 'yyy' },
    { 'app.js': 'a', 'lib/x.js': 'xx', 'lib/deep/y.js': 'yyy' },
    (src, work) => {
      const r = compareTree(src, work)
      assert.deepEqual(r.problems, [])
      assert.equal(r.checked, 3, '应该数到 3 个文件（含子目录里的）')
    }
  )
})

test('内容差一个字节 → 认得出（不能只看有没有文件）', () => {
  withTwoTrees(
    { 'app.js': 'a', 'lib/x.js': 'xx' },
    { 'app.js': 'a', 'lib/x.js': 'xz' },
    (src, work) => {
      const r = compareTree(src, work)
      assert.equal(r.checked, 2)
      assert.deepEqual(r.problems, ['内容不一致: lib/x.js'])
    }
  )
})

test('打包目录缺文件 → 报「缺失」而不是「不一致」', () => {
  withTwoTrees(
    { 'app.js': 'a', 'common/path-safe.js': 'p' },
    { 'app.js': 'a' },
    (src, work) => {
      const r = compareTree(src, work)
      assert.deepEqual(r.problems, ['缺失: common/path-safe.js'])
    }
  )
})

test('子目录里的差异不会被漏掉', () => {
  withTwoTrees(
    { 'a/b/c/d.js': 'old', 'a/b/e.js': 'same' },
    { 'a/b/c/d.js': 'new', 'a/b/e.js': 'same' },
    (src, work) => {
      const r = compareTree(src, work)
      assert.deepEqual(r.problems, ['内容不一致: a/b/c/d.js'])
    }
  )
})

test('打包目录多了源码里没有的文件 → 不算问题（只做单向检查）', () => {
  // 发布流程会先 clean 掉整个 work，所以不存在「源码已删、包里还在」的残留；
  // node_modules 这类只存在于打包目录的东西更不该报错。
  withTwoTrees(
    { 'app.js': 'a' },
    { 'app.js': 'a', 'node_modules/foo/index.js': 'x', 'assets/index.html': 'html' },
    (src, work) => {
      assert.deepEqual(compareTree(src, work).problems, [])
    }
  )
})

test('checkMainProcessFresh：一致返回文件数，不一致抛异常', () => {
  withTwoTrees(
    { 'app.js': 'a', 'lib/x.js': 'xx' },
    { 'app.js': 'a', 'lib/x.js': 'xx' },
    (src, work) => {
      assert.equal(checkMainProcessFresh(src, work), 2)
    }
  )
  withTwoTrees(
    { 'app.js': 'a' },
    { 'app.js': 'b' },
    (src, work) => {
      assert.throws(() => checkMainProcessFresh(src, work), /不是最新的/)
    }
  )
})

test('发布脚本必须跑完整构建，不能只跑 vite-build', () => {
  const text = fs.readFileSync(resolve(ROOT, 'build/bin/release-xnow.js'), 'utf8')
  // work/app 的主进程代码只有 prepare-file 会刷新；vite-build 只管渲染层。
  // 一旦这里退回成 vite-build，包里就是「新渲染层 + 旧主进程」。
  assert.match(text, /execSync\('npm run b'/, '发布前必须跑 npm run b（含 prepare-file）')
  assert.match(text, /checkMainProcessFresh\(/, '打包前必须校验打包目录等于源码')
  // 打包动作本身不能被删掉或改写
  assert.match(text, /electron-builder --config electron-builder\.json --win --x64 --publish always/)
})

test('prepare.js 里那一步「把 src/app 拷进 work」还在', () => {
  // 发布脚本跑的是 npm run b，而 b 之所以能刷新主进程代码，全靠这一行。
  // 这行没了，上面的 checkMainProcessFresh 会拦下来 —— 但要在这里先说清楚原因。
  const text = fs.readFileSync(resolve(ROOT, 'build/bin/prepare.js'), 'utf8')
  assert.match(text, /cp\('-r', 'src\/app', 'work\/'\)/)
})

// ── ISSUES #25：发版用的 electron-builder 配置必须还是本 fork 的那份 ──────────
// `npm run pb` 会把上游 electerm 的配置拷到根目录。被覆盖后打包、发 release 全都不报错，
// 但上游那份带 channel，产出的清单不叫 latest.yml，客户端永远收不到更新。

test('发版用的那份真配置能通过校验（回归基线）', () => {
  const conf = JSON.parse(fs.readFileSync(resolve(ROOT, 'electron-builder.json'), 'utf8'))
  assert.deepEqual(findProblems(conf), [])
})

test('仓库里上游那份配置必须被判为不可用（真文件，不是造的）', () => {
  // 用 build/electron-builder.json 这个**真文件**做反面样本：
  // 它就是 pb 会拷过来的东西，校验器必须认得出它不能用。
  const upstream = JSON.parse(fs.readFileSync(resolve(ROOT, 'build/electron-builder.json'), 'utf8'))
  const problems = findProblems(upstream)
  assert.ok(problems.length > 0, '上游那份应该被判为不可用')
  assert.ok(problems.some(p => p.includes('appId')), '应指出 appId 不对')
  // 这条是断更新链路的元凶，必须单独报出来
  assert.ok(problems.some(p => p.includes('channel')), '应指出多了 channel（会让清单不叫 latest.yml）')
})

test('只缺 channel 一条也要拦（其余字段对得上也不行）', () => {
  const fork = JSON.parse(fs.readFileSync(resolve(ROOT, 'electron-builder.json'), 'utf8'))
  const problems = findProblems(fork)
  assert.deepEqual(problems, [], '前提：原配置本身是干净的')

  const withChannel = JSON.parse(JSON.stringify(fork))
  withChannel.win.publish.channel = 'win-nsis'
  const p2 = findProblems(withChannel)
  assert.equal(p2.length, 1, '只应该报 channel 这一条')
  assert.match(p2[0], /latest\.yml/)
})

test('channel 为空串视为没有（不能因此误报）', () => {
  const fork = JSON.parse(fs.readFileSync(resolve(ROOT, 'electron-builder.json'), 'utf8'))
  fork.win.publish.channel = ''
  assert.deepEqual(findProblems(fork), [])
})

test('配置读不出来时判为不可用，而不是当作没问题', () => {
  for (const bad of [null, undefined, 123, 'x', []]) {
    assert.ok(findProblems(bad).length > 0, `不该放行：${JSON.stringify(bad)}`)
  }
})

test('发布脚本必须在打包前校验配置', () => {
  const text = fs.readFileSync(resolve(ROOT, 'build/bin/release-xnow.js'), 'utf8')
  assert.match(text, /checkBuilderConfig\(/, '打包前必须校验 electron-builder 配置是本 fork 的')
  // 校验必须发生在构建之前：构建要跑几分钟，等构建完再拦就白跑了
  const checkAt = text.indexOf('checkBuilderConfig(')
  const buildAt = text.indexOf("execSync('npm run b'")
  assert.ok(checkAt !== -1 && buildAt !== -1)
  assert.ok(checkAt < buildAt, '配置校验应该在构建之前')
})
