/**
 * Rebuild node-pty for Electron with Spectre fix
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const rootDir = __dirname;
const ptyBuildDir = path.join(rootDir, 'node_modules', 'node-pty', 'build');

// Clean build
if (fs.existsSync(ptyBuildDir)) {
  const releaseDir = path.join(ptyBuildDir, 'Release');
  if (fs.existsSync(releaseDir)) {
    fs.rmSync(releaseDir, { recursive: true, force: true });
    console.log('Cleaned Release dir');
  }
  const objDir = path.join(ptyBuildDir, 'obj');
  if (fs.existsSync(objDir)) {
    fs.rmSync(objDir, { recursive: true, force: true });
    console.log('Cleaned obj dir');
  }
  const slnFile = path.join(ptyBuildDir, 'binding.sln');
  if (fs.existsSync(slnFile)) {
    fs.unlinkSync(slnFile);
    console.log('Cleaned binding.sln');
  }
}

// Run electron-rebuild
console.log('Running electron-rebuild...');
try {
  execSync('npx electron-rebuild -f -w node-pty', {
    cwd: rootDir,
    stdio: 'inherit',
    timeout: 300000
  });
  console.log('\n✅ electron-rebuild succeeded!');
} catch (e) {
  console.error('\n❌ electron-rebuild failed:', e.message);
  process.exit(1);
}

// Check result
const releaseFiles = fs.readdirSync(path.join(ptyBuildDir, 'Release'));
console.log('\nBuild artifacts:');
releaseFiles.filter(f => f.endsWith('.node')).forEach(f => {
  const size = fs.statSync(path.join(ptyBuildDir, 'Release', f)).size;
  console.log(`  ${f}: ${(size / 1024).toFixed(1)} KB`);
});
