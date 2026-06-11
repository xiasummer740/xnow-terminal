# Script to build node-pty with Spectre mitigation disabled
$ErrorActionPreference = "Continue"

$buildDir = "F:\summer\vs-code\xnow-terminal\node_modules\node-pty\build"
$projDir = "F:\summer\vs-code\xnow-terminal\node_modules\node-pty"

Write-Host "=== Cleaning build artifacts ==="
$objDir = Join-Path $buildDir "obj"
if (Test-Path $objDir) { Remove-Item $objDir -Recurse -Force -ErrorAction SilentlyContinue; Write-Host "Removed obj" }
$slnFile = Join-Path $buildDir "binding.sln"
if (Test-Path $slnFile) { Remove-Item $slnFile -Force -ErrorAction SilentlyContinue; Write-Host "Removed binding.sln" }

Write-Host "=== Configuring ==="
Set-Location "F:\summer\vs-code\xnow-terminal"
npx node-gyp configure --directory=node_modules/node-pty 2>&1
Write-Host "Configure done"

Write-Host "=== Patching vcxproj files ==="
$projFiles = @(
    "conpty.vcxproj",
    "conpty_console_list.vcxproj",
    "deps/winpty/src/winpty.vcxproj",
    "deps/winpty/src/winpty-agent.vcxproj"
)
foreach ($proj in $projFiles) {
    $fullPath = Join-Path $buildDir $proj
    if (Test-Path $fullPath) {
        $content = Get-Content $fullPath -Raw
        $content = $content -replace '<Globals>', '<Globals><SpectreMitigation>false</SpectreMitigation>'
        Set-Content -Path $fullPath -Value $content
        Write-Host "  Patched: $proj"
    }
}

Write-Host "=== Building ==="
npx node-gyp build --directory=node_modules/node-pty 2>&1
Write-Host "Build exit code: $LASTEXITCODE"

Write-Host "=== Result ==="
$releaseDir = Join-Path $buildDir "Release"
if (Test-Path $releaseDir) {
    Get-ChildItem $releaseDir -Filter "*.node" | ForEach-Object { Write-Host "  $($_.Name) $($_.Length) bytes" }
} else {
    Write-Host "No build/Release directory"
}
