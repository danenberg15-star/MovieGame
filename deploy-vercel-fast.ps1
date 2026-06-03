# FAST Vercel deploy — uploads ONLY changed files (relies on Vercel hash dedup).
# Usage: .\deploy-vercel-fast.ps1
#
# Unlike deploy-vercel.ps1 (which re-uploads the full ~1GB tgz archive every time),
# this does a normal `vercel deploy` so the CLI hashes each file and skips the ones
# already present on Vercel from a previous deploy. After a baseline archive deploy,
# changing a few trailers means only those few KB upload — seconds instead of minutes.
#
# NOTE: the FIRST time you switch to this method, Vercel may still upload all ~360MB
# of trailers once (to register per-file hashes). Every run after that is fast.
# If trailers ever go missing on production, fall back to: .\deploy-vercel.ps1

$ErrorActionPreference = "Stop"
$env:CI = "false"

$trailerCount = (Get-ChildItem "public\assets\movies" -Recurse -Filter "trailer.mp4" -ErrorAction SilentlyContinue | Measure-Object).Count
Write-Host "Local trailers: $trailerCount" -ForegroundColor Yellow
if ($trailerCount -lt 700) {
    Write-Host "ERROR: Expected ~765 trailers in public/assets/movies/. Aborting." -ForegroundColor Red
    exit 1
}

Write-Host "`nFast deploy (incremental, only changed files upload)..." -ForegroundColor Cyan
vercel deploy --prod --yes
if ($LASTEXITCODE -ne 0) { exit 1 }

Write-Host "`nDone: https://movies-trivia-game.vercel.app" -ForegroundColor Green
Write-Host "If trailers are missing, re-run the full archive deploy: .\deploy-vercel.ps1" -ForegroundColor DarkYellow
