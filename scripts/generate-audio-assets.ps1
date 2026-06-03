# Generate royalty-free procedural cinema SFX + ambient loops (CC0 — created for this project).
# Requires ffmpeg (same path as movie-data-generator).

$ErrorActionPreference = "Stop"
$FF = "C:\Users\USER\AppData\Local\Microsoft\WinGet\Packages\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\ffmpeg-8.1.1-full_build\bin\ffmpeg.exe"
if (-not (Test-Path $FF)) { $FF = "ffmpeg" }

$root = Join-Path $PSScriptRoot "..\public\assets\audio"
$sfx = Join-Path $root "sfx"
$music = Join-Path $root "music"
New-Item -ItemType Directory -Force -Path $sfx, $music | Out-Null

function Invoke-Ff($args) {
  & $FF @args 2>&1 | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "ffmpeg failed: $args" }
}

# Short UI click — soft tick
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=880:duration=0.06", "-af", "afade=t=out:st=0.02:d=0.04,volume=0.4", (Join-Path $sfx "ui-click.mp3"))

# UI back — lower tone
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.08", "-af", "afade=t=out:st=0.03:d=0.05,volume=0.35", (Join-Path $sfx "ui-back.mp3"))

# Curtain open — noise sweep
Invoke-Ff @("-y", "-f", "lavfi", "-i", "anoisesrc=d=1.2:color=pink", "-af", "afade=t=in:st=0:d=0.3,afade=t=out:st=0.7:d=0.5,lowpass=f=800,volume=0.5", (Join-Path $sfx "curtain-open.mp3"))

# Mode select — two-tone chime
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=523:duration=0.12", "-f", "lavfi", "-i", "sine=frequency=659:duration=0.15", "-filter_complex", "[0][1]concat=n=2:v=0:a=1,afade=t=out:st=0.2:d=0.07,volume=0.45", (Join-Path $sfx "mode-select.mp3"))

# Seat pick — cushioned thud
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=120:duration=0.15", "-af", "afade=t=out:st=0.05:d=0.1,volume=0.55", (Join-Path $sfx "seat-pick.mp3"))

# Game start — rising two-tone
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=330:duration=0.4", "-f", "lavfi", "-i", "sine=frequency=440:duration=0.4", "-filter_complex", "[0][1]concat=n=2:v=0:a=1,afade=t=out:st=0.3:d=0.1,volume=0.5", (Join-Path $sfx "game-start.mp3"))

# Anchor reveal — projector / swell
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=180:duration=1.0", "-af", "afade=t=in:st=0:d=0.4,afade=t=out:st=0.6:d=0.4,volume=0.45", (Join-Path $sfx "anchor-reveal.mp3"))

# Modal open — soft whoosh
Invoke-Ff @("-y", "-f", "lavfi", "-i", "anoisesrc=d=0.35:color=white", "-af", "afade=t=in:st=0:d=0.05,afade=t=out:st=0.2:d=0.15,highpass=f=2000,volume=0.25", (Join-Path $sfx "modal-open.mp3"))

# Home ambient — gentle pad loop (45s)
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=110:duration=45", "-f", "lavfi", "-i", "sine=frequency=165:duration=45", "-filter_complex", "[0][1]amix=inputs=2:weights=0.6 0.4,volume=0.12", "-c:a", "libmp3lame", "-b:a", "96k", (Join-Path $music "home-ambient.mp3"))

# Lobby tension — low pulse loop (40s)
Invoke-Ff @("-y", "-f", "lavfi", "-i", "sine=frequency=65:duration=40", "-af", "volume=0.15,tremolo=f=0.5:d=0.4", "-c:a", "libmp3lame", "-b:a", "96k", (Join-Path $music "lobby-tension.mp3"))

Write-Host "Generated audio assets in $root" -ForegroundColor Green
Get-ChildItem $sfx, $music | Format-Table Name, @{n='KB';e={[math]::Round($_.Length/1KB)}}
