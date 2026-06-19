/**
 * ⚠️ 安全模式 — 手动编译 node-pty（非必要请勿运行）
 *
 * 警告：手动编译 node-pty 可能破坏预编译二进制，导致终端无法工作。
 * electron-builder 打包时会自动处理 node-pty 编译（electron-rebuild），
 * 不需要手动跑此脚本。
 *
 * 正确方式：
 *   npx electron-builder --win --x64
 *
 * 如果确实需要手动编译（如开发 Electron ABI 不匹配问题），请传 --force 参数：
 *   node build-pty-electron.js --force
 */

const { spawnSync } = require('child_process')
const path = require('path')
const fs = require('fs')

// ── 安全检查 ──
const args = process.argv.slice(2)
const forceMode = args.includes('--force')

console.log('')
console.log(' ╔═══════════════════════════════════════════════════════╗')
console.log(' ║                                                       ║')
console.log(' ║   ⚠️  手动编译 node-pty 可能导致终端无法工作         ║')
console.log(' ║                                                       ║')
console.log(' ║  electron-builder 打包时会自动调用 electron-rebuild   ║')
console.log(' ║   正确处理 node-pty 编译。                           ║')
console.log(' ║                                                       ║')
console.log(' ║  正确构建方式：                                       ║')
console.log(' ║    npx electron-builder --win --x64                   ║')
console.log(' ║                                                       ║')
console.log(' ║  强制运行此脚本：                                     ║')
console.log(' ║    node build-pty-electron.js --force                 ║')
console.log(' ║                                                       ║')
console.log(' ╚═══════════════════════════════════════════════════════╝')
console.log('')

if (!forceMode) {
  console.log('❌ 已中止。如确需手动编译，请加 --force 参数。')
  process.exit(0)
}

console.log('⚠️  强制模式已启用，开始手动编译 node-pty...')
console.log('')

// ═══════════════════════════════════════════════════════════════
// 以下为原始编译逻辑，仅在 --force 模式下执行
// ═══════════════════════════════════════════════════════════════

const ROOT = __dirname
const PTY_DIR = path.join(ROOT, 'node_modules', 'node-pty')
const BUILD_DIR = path.join(PTY_DIR, 'build')

function clean () {
  console.log('=== Cleaning ===')
  const targets = ['obj', 'binding.sln', 'Release', 'config.gypi']
  for (const t of targets) {
    const p = path.join(BUILD_DIR, t)
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true })
    }
  }
  try {
    const files = fs.readdirSync(BUILD_DIR)
    for (const f of files) {
      if (f.endsWith('.vcxproj') || f.endsWith('.vcxproj.filters') || f.endsWith('.vcxproj.user')) {
        fs.unlinkSync(path.join(BUILD_DIR, f))
      }
    }
    const walkDir = (dir) => {
      try {
        fs.readdirSync(dir).forEach(f => {
          const full = path.join(dir, f)
          if (fs.statSync(full).isDirectory()) {
            walkDir(full)
          } else if (f.endsWith('.vcxproj') || f.endsWith('.vcxproj.filters')) {
            fs.unlinkSync(full)
          }
        })
      } catch {}
    }
    walkDir(BUILD_DIR)
  } catch {}
  console.log('Clean done')
}

function configure () {
  console.log('\n=== Configuring for Electron 41.2.0 ===')
  const nodeGyp = path.join(ROOT, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js')
  const result = spawnSync('node', [
    nodeGyp,
    'configure',
    `--directory=${PTY_DIR}`
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_target: '41.2.0',
      npm_config_arch: 'x64',
      npm_config_disturl: 'https://electronjs.org/headers',
      npm_config_runtime: 'electron',
      npm_config_devdir: path.join(require('os').homedir(), '.electron-gyp')
    }
  })
  if (result.status !== 0) {
    console.error('Configure failed')
    process.exit(1)
  }
  console.log('Configure done')
}

function patchVcxproj () {
  console.log('\n=== Patching vcxproj to disable Spectre ===')
  const projFiles = [
    path.join(BUILD_DIR, 'conpty.vcxproj'),
    path.join(BUILD_DIR, 'conpty_console_list.vcxproj'),
    path.join(BUILD_DIR, 'deps', 'winpty', 'src', 'winpty.vcxproj'),
    path.join(BUILD_DIR, 'deps', 'winpty', 'src', 'winpty-agent.vcxproj')
  ]

  for (const proj of projFiles) {
    if (fs.existsSync(proj)) {
      let content = fs.readFileSync(proj, 'utf8')
      const before = (content.match(/SpectreMitigation/g) || []).length
      content = content.replace(/<SpectreMitigation>Spectre<\/SpectreMitigation>/g, '<SpectreMitigation>false</SpectreMitigation>')
      fs.writeFileSync(proj, content)
      const after = (content.match(/SpectreMitigation/g) || []).length
      const isFalse = content.includes('<SpectreMitigation>false</SpectreMitigation>')
      console.log(`  ${path.basename(proj)}: ${before} entries → ${after} entries, false=${isFalse}`)
    } else {
      console.log(`  NOT FOUND: ${proj}`)
    }
  }
}

function build () {
  console.log('\n=== Building ===')
  const result = spawnSync('node', [
    path.join(ROOT, 'node_modules', 'node-gyp', 'bin', 'node-gyp.js'),
    'build',
    `--directory=${PTY_DIR}`
  ], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      npm_config_target: '41.2.0',
      npm_config_arch: 'x64',
      npm_config_disturl: 'https://electronjs.org/headers',
      npm_config_runtime: 'electron',
      npm_config_devdir: path.join(require('os').homedir(), '.electron-gyp')
    }
  })
  console.log(`Build exit code: ${result.status}`)
  return result.status === 0
}

function verify () {
  console.log('\n=== Result ===')
  const releaseDir = path.join(BUILD_DIR, 'Release')
  if (fs.existsSync(releaseDir)) {
    const files = fs.readdirSync(releaseDir).filter(f => f.endsWith('.node'))
    for (const f of files) {
      const stat = fs.statSync(path.join(releaseDir, f))
      console.log(`  ${f}: ${(stat.size / 1024).toFixed(1)} KB`)
    }
    return files.length > 0
  }
  return false
}

clean()
configure()
patchVcxproj()
build()

if (verify()) {
  console.log('\n✅ Build SUCCESSFUL!')
  console.log('⚠️  注意：手动编译的 node-pty 可能覆盖预编译版本，')
  console.log('   如果终端无法工作，请重新 npm install 恢复。')
  process.exit(0)
} else {
  console.log('\n❌ Build FAILED')
  process.exit(1)
}
