# Deploy to Vercel WITH all trailer MP4s (gitignored, not in GitHub-only deploys).
# Usage: .\deploy-vercel.ps1
#
# Uses --archive=tgz so the full ~1GB upload includes public/assets/movies/**/trailer.mp4.
# Plain `vercel --prod` often uploads only changed source (~4KB) and drops trailers.

$ErrorActionPreference = "Stop"
$env:CI = "false"

$trailerCount = (Get-ChildItem "public\assets\movies" -Recurse -Filter "trailer.mp4" -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "Local trailers: $trailerCount" -ForegroundColor Yellow
if ($trailerCount -lt 700) {
    Write-Host "ERROR: Expected ~765 trailers in public/assets/movies/. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "`nDeploying to Vercel (archive upload ~1GB, may take a few minutes)..." -ForegroundColor Cyan
vercel deploy --archive=tgz --prod --yes --force
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`nDone: https://movies-trivia-game.vercel.app" -ForegroundColor Green
