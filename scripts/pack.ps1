# Builds the release exe and drops it in a zip (spec S13: a folder with an
# exe, no installer). Run it as: npm run pack

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "cargo is not on PATH - install rustup (stable-x86_64-pc-windows-msvc)"
}

$conf = Get-Content (Join-Path $root "src-tauri\tauri.conf.json") -Raw | ConvertFrom-Json
$version = $conf.version
$name = "Plain-$version"

Write-Host "building $name..."
Push-Location $root
try {
    & npx tauri build --no-bundle
    if ($LASTEXITCODE -ne 0) { throw "tauri build exited with $LASTEXITCODE" }
}
finally {
    Pop-Location
}

$exe = Join-Path $root "src-tauri\target\release\plain.exe"
if (-not (Test-Path $exe)) { throw "no exe at $exe" }

$out = Join-Path $root "dist-win"
$folder = Join-Path $out $name
$zip = Join-Path $out "$name-win-x64.zip"
if (Test-Path $folder) { Remove-Item $folder -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Force -Path $folder | Out-Null

Copy-Item $exe $folder
Copy-Item (Join-Path $root "README.md") $folder

Compress-Archive -Path $folder -DestinationPath $zip
$exeMb = [math]::Round((Get-Item $exe).Length / 1MB, 1)
$zipMb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "plain.exe $exeMb MB -> $zip ($zipMb MB)"
