# Builds AURORA and prepares dist-infinityfree/ : the folder whose CONTENT
# goes into the subdomain's htdocs/ (FileZilla or the InfinityFree file manager).
# Usage (from the project root):  powershell -File deploy/infinityfree/build.ps1

$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..")
Set-Location $root

if (-not (Select-String -Path ".env" -Pattern "^NEXT_PUBLIC_YOUTUBE_API_KEY=.+" -Quiet -ErrorAction SilentlyContinue)) {
  Write-Warning "NEXT_PUBLIC_YOUTUBE_API_KEY is missing from .env: online search will not work."
}

npm run build
if ($LASTEXITCODE -ne 0) { throw "Build failed" }

$dist = Join-Path $root "dist-infinityfree"
if (Test-Path $dist) { Remove-Item -Recurse -Force $dist }
New-Item -ItemType Directory -Path $dist | Out-Null

# Copy the static export, except the multi-GB installers (InfinityFree caps files at 10 MB;
# the download buttons point to GitHub Releases instead).
Get-ChildItem -Path "out" -Force | Where-Object { $_.Name -ne "download" } |
  Copy-Item -Destination $dist -Recurse -Force
Copy-Item (Join-Path $PSScriptRoot ".htaccess") $dist -Force

$big = Get-ChildItem $dist -Recurse -File | Where-Object { $_.Length -gt 10MB }
if ($big) { Write-Warning "Files over 10 MB (rejected by InfinityFree):"; $big | ForEach-Object { $_.FullName } }

$count = (Get-ChildItem $dist -Recurse -File).Count
Write-Host "Ready: $dist ($count files). Upload its CONTENT into the subdomain's htdocs/."
