param([string]$Python = 'python.exe')
$ErrorActionPreference = 'Stop'
$buildDir = Join-Path $PSScriptRoot '.build'
New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
function Fetch-Verified([string]$Url,[string]$Name,[string]$Sha) {
  $path = Join-Path $buildDir $Name
  if (!(Test-Path -LiteralPath $path) -or (Get-FileHash -LiteralPath $path).Hash.ToLower() -ne $Sha) {
    Invoke-WebRequest $Url -OutFile $path
  }
  if ((Get-FileHash -LiteralPath $path).Hash.ToLower() -ne $Sha) { throw "Hash mismatch: $Name" }
  return $path
}
$rust = Fetch-Verified 'https://static.rust-lang.org/rustup/archive/1.29.1/x86_64-pc-windows-msvc/rustup-init.exe' 'rustup-init.exe' '6f4bef66261261fcb43131be8720bab817d403a09edec7455c371974b90bdb7e'
$helper = Fetch-Verified 'https://gist.githubusercontent.com/mmozeiko/7f3162ec2988e81e56d5c4e22cde9977/raw/553d55bb7f0405a2fbd0228b8ed87c2b8ad200f8/portable-msvc.py' 'portable-msvc.py' '1791cccca594ff083ce8d3e0a139e6156d2c312e24332a909e608010f0230a51'
$env:CARGO_HOME = Join-Path $buildDir 'cargo'
$env:RUSTUP_HOME = Join-Path $buildDir 'rustup'
& $rust -y --no-modify-path --profile minimal --default-toolchain 1.90.0 --default-host x86_64-pc-windows-msvc
if ($LASTEXITCODE -ne 0) { throw 'Rust provisioning failed' }
Push-Location $buildDir
try {
  # Compiler/SDK payloads are fetched from Microsoft and checked by manifest SHA.
  & $Python $helper --vs 2022 --msvc-version 14.44 --sdk-version 26100 --accept-license
  if ($LASTEXITCODE -ne 0) { throw 'MSVC provisioning failed' }
} finally { Pop-Location }
