# Builds the release exe, signs it, and drops it in a zip (spec S13: a folder with
# an exe, no installer). Run it as: npm run pack
#
# SIGNING. The exe is signed with the owner's Certum Cloud Code Signing certificate,
# the same one pii-shield-desktop releases with. Its private key is not a file: it
# lives in Certum's cloud HSM and is reachable only while SimplySign Desktop holds an
# open session (tray icon -> "Connect to SimplySign" -> account e-mail + the token
# from the SimplySign phone app; a session lasts about two hours). While the session
# is open the certificate is visible in the CurrentUser\My store and signtool signs
# through it. Without a session the certificate is simply not there, so the check
# below stops this script BEFORE the three-minute build, not after.
#
#   npm run pack                  signed release build; refuses to run unsigned
#   npm run pack -- -Unsigned     local test build; the zip is named *-unsigned so it
#                                 cannot be mistaken for a release

param([switch]$Unsigned)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot

# The certificate identity. Both pinned from the live certificate on 2026-08-06:
#   subject  CN=Grigorii Moskalev, O=Grigorii Moskalev, L=Limassol, S=Limassol, C=CY
#   issuer   CN=Certum Code Signing 2021 CA, O=Asseco Data Systems S.A., C=PL
#   valid    2026-08-06 -> 2027-08-06 (a renewal keeps the CN, so nothing changes here)
$signerCN = "Grigorii Moskalev"
$issuerMatch = "Certum"
# RFC 3161 timestamp authority. Without a timestamp the signature stops verifying the
# day the certificate expires; with one, every exe ever shipped stays valid.
$timestampUrl = "http://time.certum.pl"

function Find-SigningCert {
    $found = @(Get-ChildItem Cert:\CurrentUser\My -CodeSigningCert | Where-Object {
        $_.Subject -like "*CN=$signerCN*" -and $_.Issuer -like "*$issuerMatch*" -and
        $_.NotBefore -le (Get-Date) -and $_.NotAfter -gt (Get-Date)
    })
    if ($found.Count -eq 0) {
        throw @"
no valid code-signing certificate for "$signerCN" ($issuerMatch) in CurrentUser\My.
SimplySign is not connected. To sign:
  1. Phone: open the SimplySign app, let it generate a token.
  2. Here: run SimplySign Desktop (G:\Programms\proCertum\SimplySignDesktop.exe), tray icon
     -> "Connect to SimplySign" -> account e-mail + that token -> OK, close the confirmation.
  3. Run npm run pack again. The session lasts ~2 hours; the build takes ~3 minutes.
For an unsigned local test build: npm run pack -- -Unsigned
"@
    }
    # During a renewal the old and the new certificate overlap; the newest is the one
    # that stays valid longest, which is the one a release wants.
    return $found | Sort-Object NotAfter -Descending | Select-Object -First 1
}

function Find-Signtool {
    $kits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    $tool = Get-ChildItem (Join-Path $kits "*\x64\signtool.exe") -ErrorAction SilentlyContinue |
        Sort-Object { [version]$_.Directory.Parent.Name } -Descending | Select-Object -First 1
    if (-not $tool) { throw "signtool.exe not found under $kits - install the Windows 10/11 SDK (signing tools)" }
    return $tool.FullName
}

if (-not (Get-Command cargo -ErrorAction SilentlyContinue)) {
    throw "cargo is not on PATH - install rustup (stable-x86_64-pc-windows-msvc)"
}

# Fail fast: check the signing session and the tool before the long build.
if (-not $Unsigned) {
    $cert = Find-SigningCert
    $signtool = Find-Signtool
    Write-Host "signing as $($cert.Subject) (thumbprint $($cert.Thumbprint), valid to $($cert.NotAfter.ToString('yyyy-MM-dd')))"
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
$suffix = if ($Unsigned) { "-win-x64-unsigned.zip" } else { "-win-x64.zip" }
$zip = Join-Path $out "$name$suffix"
if (Test-Path $folder) { Remove-Item $folder -Recurse -Force }
if (Test-Path $zip) { Remove-Item $zip -Force }
New-Item -ItemType Directory -Force -Path $folder | Out-Null

Copy-Item $exe $folder
Copy-Item (Join-Path $root "README.md") $folder
$shipped = Join-Path $folder "plain.exe"

if ($Unsigned) {
    Write-Host "UNSIGNED build - do not publish this zip"
}
else {
    # The copy is signed, not the cargo output, so target\release stays a plain build.
    # SHA-256 digest, RFC 3161 timestamp (/tr, not the legacy /t that Certum lists as a
    # known signtool failure). One signature against Certum's 5000/month quota.
    Write-Host "signing plain.exe..."
    & $signtool sign /sha1 $cert.Thumbprint /fd SHA256 /tr $timestampUrl /td SHA256 $shipped
    if ($LASTEXITCODE -ne 0) {
        throw @"
signtool failed ($LASTEXITCODE). The certificate is in the store but the private key was not reachable:
the SimplySign session has probably expired (or a PIN dialog is waiting). Reconnect and run npm run pack again.
"@
    }

    # Trust the signature only after Windows itself agrees, and only with a timestamp.
    $sig = Get-AuthenticodeSignature $shipped
    if ($sig.Status -ne "Valid") { throw "signature on plain.exe is $($sig.Status): $($sig.StatusMessage)" }
    if ($null -eq $sig.TimeStamperCertificate) { throw "plain.exe is signed but NOT timestamped ($timestampUrl unreachable?) - refusing to ship it" }
    if ($sig.SignerCertificate.Thumbprint -ne $cert.Thumbprint) { throw "plain.exe was signed by a different certificate than expected" }
    Write-Host "signed: $($sig.SignerCertificate.Subject); timestamp: $($sig.TimeStamperCertificate.Subject)"
}

Compress-Archive -Path $folder -DestinationPath $zip
$exeMb = [math]::Round((Get-Item $shipped).Length / 1MB, 1)
$zipMb = [math]::Round((Get-Item $zip).Length / 1MB, 1)
Write-Host "plain.exe $exeMb MB -> $zip ($zipMb MB)"
