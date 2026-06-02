# Database expansion pipeline

Adds N new movies to the database, end-to-end, using the same heatmap-based
15-second trailer cut as the original pipeline.

## How it works

1. **`1-discover-candidates.js [N]`** — Query TMDB `/discover/movie`:
   - last 50 years, non-animated, >= 5000 votes
   - sorted by `vote_average.desc`
   - skips movies already in `src/data/movies-clean.json` (matched by normalized title + year ±1)
   - writes `staging/candidates.json`

2. **`2-fetch-and-cut.js [--limit N] [--resume]`** — for each candidate:
   - pulls full TMDB details (en + he), credits, similar (for decoys), Hebrew titles for decoys
   - finds an official YouTube trailer via TMDB videos, falls back to `yt-search`
   - downloads with `yt-dlp -f bv*[height<=480]+ba/b[height<=480] --write-info-json` to
     `staging/raw_youtube/{tmdb_id}/`
   - reads the YouTube heatmap from `info.json`, picks a 15s window around the peak
     (peak - 7s, but never before 10s; clamps to `duration - 15`)
   - cuts with `ffmpeg -c:v libx264 -c:a aac` to
     `staging/movies/{movie_id}/trailer.mp4`
   - writes per-movie `data.json` and the aggregated `staging/new-movies.json`
     + `staging/report.json`
   - `--resume` skips movies that are already staged

3. **`3-publish-staging.js [--dry-run] [--no-firebase]`** (manual):
   - copies each `staging/movies/{movie_id}/trailer.mp4` to
     `public/assets/movies/{movie_id}/trailer.mp4`
   - merges staged entries into `src/data/movies-clean.json` and
     `public/movies-clean.json`
   - uploads the merged movies array to Firebase RTDB at `movies/movies`

After publishing, run the repo's normal deploy:

```powershell
cd ..\..
.\deploy.ps1 "Expand database by N movies"
```

## Requirements

- `yt-dlp` on PATH (`yt-dlp --version` should work)
- `ffmpeg` at the path in `common.js` (`FFMPEG_PATH`, override with env var)
- `TMDB_API_KEY` in `movie-data-generator/.env`
- `npm install` in `movie-data-generator/` (firebase, axios, yt-search, dotenv, fs-extra)

## Typical run

```powershell
cd movie-data-generator\expand-database
node 1-discover-candidates.js 200
node 2-fetch-and-cut.js --limit 3        # smoke test first
node 2-fetch-and-cut.js --resume         # full run, resumable
# review staging/report.json + spot-check staging/movies/movie_NNN/trailer.mp4
node 3-publish-staging.js --dry-run
node 3-publish-staging.js                # real publish + Firebase upload
cd ..\..
.\deploy.ps1 "Expand database by 200 movies"
```
