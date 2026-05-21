# Get the latest tag
$latestTag = git tag --sort=-v:refname | Select-Object -First 1

if ($latestTag) {
    # Parse version
    $version = $latestTag -replace 'v', ''
    $parts = $version -split '\.'
    $major = [int]$parts[0]
    $minor = [int]$parts[1]
    $patch = [int]$parts[2]
    
    # Increment patch version
    $patch++
    $newVersion = "v$major.$minor.$patch"
} else {
    # First tag
    $newVersion = "v1.0.0"
}

Write-Host "Latest tag: $latestTag" -ForegroundColor Yellow
Write-Host "New tag: $newVersion" -ForegroundColor Green

# Build
Write-Host "`nBuilding..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed!" -ForegroundColor Red
    exit 1
}

# Git operations
Write-Host "`nCommitting..." -ForegroundColor Cyan
git add .
git commit -m "$args"

Write-Host "`nCreating tag: $newVersion" -ForegroundColor Cyan
git tag $newVersion

Write-Host "`nPushing..." -ForegroundColor Cyan
git push origin main
git push origin $newVersion

Write-Host "`n✅ Deployed successfully with tag: $newVersion" -ForegroundColor Green