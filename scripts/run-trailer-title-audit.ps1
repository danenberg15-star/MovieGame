# Full trailer title audit: OCR scan -> recut flagged -> deploy to Vercel (incremental).
#
# Usage:
#   .\scripts\run-trailer-title-audit.ps1              # full pipeline
#   .\scripts\run-trailer-title-audit.ps1 -Pilot       # audit 20 only, no deploy
#   .\scripts\run-trailer-title-audit.ps1 -AuditOnly   # scan only
#   .\scripts\run-trailer-title-audit.ps1 -SkipDeploy  # audit + recut, no Vercel

param(
  [switch]$Pilot,
  [switch]$AuditOnly,
  [switch]$SkipDeploy,
  [switch]$ForceDownload
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$expand = Join-Path $root "movie-data-generator\expand-database"
$tessdata = Join-Path $expand "tessdata"
$tesseract = "C:\Program Files\Tesseract-OCR\tesseract.exe"

function Ensure-Tessdata {
  New-Item -ItemType Directory -Force -Path $tessdata | Out-Null
  $eng = Join-Path $tessdata "eng.traineddata"
  $heb = Join-Path $tessdata "heb.traineddata"
  if (-not (Test-Path $eng)) {
    $sysEng = "C:\Program Files\Tesseract-OCR\tessdata\eng.traineddata"
    if (Test-Path $sysEng) { Copy-Item $sysEng $eng -Force }
    else { throw "eng.traineddata missing. Install Tesseract OCR first." }
  }
  if (-not (Test-Path $heb)) {
    Write-Host "Downloading heb.traineddata..." -ForegroundColor Cyan
    Invoke-WebRequest -Uri "https://github.com/tesseract-ocr/tessdata_fast/raw/main/heb.traineddata" `
      -OutFile $heb -UseBasicParsing
  }
  if (-not (Test-Path $tesseract)) {
    Write-Host "Installing Tesseract OCR (winget)..." -ForegroundColor Cyan
    winget install UB-Mannheim.TesseractOCR --accept-package-agreements --accept-source-agreements
  }
  $env:TESSDATA_PREFIX = "$tessdata\"
  Write-Host "Tesseract OK (eng+heb)" -ForegroundColor Green
}

Ensure-Tessdata
Set-Location $expand

$auditArgs = @("audit-trailer-titles.js", "--resume")
if ($Pilot) { $auditArgs += @("--limit", "20") }

Write-Host "`n=== Phase 1: OCR audit ===" -ForegroundColor Yellow
node @auditArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($AuditOnly) {
  Write-Host "Audit only — done." -ForegroundColor Green
  exit 0
}

$recutArgs = @("recut-clean-trailers.js", "--resume")
if ($Pilot) { $recutArgs += @("--limit", "10") }
if ($ForceDownload) { $recutArgs += "--force-download" }

Write-Host "`n=== Phase 2: Re-cut flagged trailers ===" -ForegroundColor Yellow
node @recutArgs
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

if ($SkipDeploy -or $Pilot) {
  Write-Host "Skipping Vercel deploy." -ForegroundColor Yellow
  Set-Location $root
  exit 0
}

Set-Location $root
Write-Host "`n=== Phase 3: deploy-vercel-fast (changed MP4s only) ===" -ForegroundColor Yellow
.\deploy-vercel-fast.ps1

Write-Host "`nDone." -ForegroundColor Green
