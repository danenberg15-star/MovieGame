# Sync the movie database from the single source of truth to the public copy.
#
# Single source of truth:  src/data/movies-clean.json
# Runtime fallback copy:    public/movies-clean.json  (fetched by the app when
#                           Firebase is unavailable — see src/utils/gameLogic.js)
#
# Never edit public/movies-clean.json by hand. Edit src/data/movies-clean.json
# (or let the expand-database pipeline write it), then run this script.
#
# Usage:
#   .\scripts\sync-movies-json.ps1            # copy + verify
#   .\scripts\sync-movies-json.ps1 -Check     # verify only (CI-style, no copy)

param([switch]$Check)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$src = Join-Path $root "src\data\movies-clean.json"
$pub = Join-Path $root "public\movies-clean.json"

if (-not (Test-Path $src)) { throw "Source of truth missing: $src" }

$srcHash = (Get-FileHash $src -Algorithm MD5).Hash
$pubHash = if (Test-Path $pub) { (Get-FileHash $pub -Algorithm MD5).Hash } else { "" }

if ($srcHash -eq $pubHash) {
  Write-Host "In sync: public/movies-clean.json matches src/data/movies-clean.json" -ForegroundColor Green
  exit 0
}

if ($Check) {
  Write-Host "OUT OF SYNC: public/movies-clean.json differs from src/data/movies-clean.json" -ForegroundColor Red
  Write-Host "Run: .\scripts\sync-movies-json.ps1" -ForegroundColor Yellow
  exit 1
}

Copy-Item $src $pub -Force
Write-Host "Synced src/data/movies-clean.json -> public/movies-clean.json" -ForegroundColor Green
