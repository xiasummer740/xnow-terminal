# Build node-pty for Electron with Spectre fix
$ErrorActionPreference = "Continue"

$rootDir = "F:\summer\vs-code\xnow-terminal"
$ptyDir = Join-Path $rootDir "node_modules\node-pty"
$buildDir = Join-Path $ptyDir "build"
$releaseDir = Join-Path $buildDir "Release"

Set-Location $rootDir

# Step 1: Clean
Write-Host "=== Cleaning ==="
$cleanTargets = @(
    (Join-Path $buildDir "obj"),
    (Join-Path $buildDir "binding.sln"),
    (Join-Path $buildDir "Release"),
    (Join-Path $buildDir "config.gypi"),
    (Join-Path $buildDir "*.vcxproj"),
    (Join-Path $buildDir "*.vcxproj.filters"),
    (Join-Path $buildDir "Makefile")
)
foreach ($t in $cleanTargets) {
    if (Test-Path $t) { Remove-Item $t -Recurse -Force -ErrorAction SilentlyContinue }
}
Start-Sleep -Milliseconds 500
Write-Host "Clean done"

# Step 2: Configure using Electron's node-gyp
Write-Host "=== Configuring for Electron ==="
$env:npm_config_target = "41.2.0"
$env:npm_config_arch = "x64"
$env:npm_config_disturl = "https://electronjs.org/headers"
$env:npm_config_runtime = "electron"
$env:npm_config_devdir = Join-Path $env:USERPROFILE ".electron-gyp"

# Use node-gyp from the project
$nodeGypCmd = (Join-Path $rootDir "node_modules\.bin\node-gyp.cmd")
& $nodeGypCmd configure --directory=$ptyDir 2>&1
Write-Host "Configure done"

# Step 3: Patch vcxproj to disable Spectre
Write-Host "=== Patching vcxproj ==="
$projFiles = @(
    Join-Path $buildDir "conpty.vcxproj",
    Join-Path $buildDir "conpty_console_list.vcxproj",
    Join-Path $buildDir "deps\winpty\src\winpty.vcxproj",
    Join-Path $buildDir "deps\winpty\src\winpty-agent.vcxproj"
)
foreach ($proj in $projFiles) {
    if (Test-Path $proj) {
        $content = Get-Content $proj -Raw
        $originalCount = [regex]::Matches($content, "SpectreMitigation").Count
        $content = $content -replace '<SpectreMitigation>Spectre</SpectreMitigation>', '<SpectreMitigation>false</SpectreMitigation>'
        Set-Content -Path $proj -Value $content
        $newCount = [regex]::Matches((Get-Content $proj -Raw), "SpectreMitigation").Count
        Write-Host "  $([System.IO.Path]::GetFileName($proj)): $originalCount -> $newCount Spectre entries"
    } else {
        Write-Host "  NOT FOUND: $proj"
    }
}

# Step 4: Build
Write-Host "=== Building ==="
& $nodeGypCmd build --directory=$ptyDir 2>&1
Write-Host "Build exit code: $LASTEXITCODE"

# Step 5: Verify
Write-Host "=== Result ==="
if (Test-Path $releaseDir) {
    Get-ChildItem $releaseDir -Filter "*.node" | ForEach-Object { Write-Host "  $($_.Name) $($_.Length) bytes" }
    $hasNodeFiles = (Get-ChildItem $releaseDir -Filter "*.node" | Measure-Object).Count -gt 0
    if ($hasNodeFiles) {
        Write-Host "✅ Build SUCCESSFUL!"
    } else {
        Write-Host "❌ No .node files generated"
    }
} else {
    Write-Host "❌ No build/Release directory"
}
