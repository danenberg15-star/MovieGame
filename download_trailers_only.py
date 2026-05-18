# download_trailers_only.py
import os
import time
import requests
import subprocess
import json

TMDB_API_KEY = '0c5eb1c3ddee8977d991539ff01c66d0'
TMDB_BASE_URL = 'https://api.themoviedb.org/3'
OUTPUT_DIR = 'downloaded-movies'
MOVIES_LIST_FILE = 'movies-list.json'  # הקובץ עם רשימת הסרטים

# Create output directory
os.makedirs(OUTPUT_DIR, exist_ok=True)

def sanitize_filename(name):
    """Remove invalid characters from filename"""
    invalid_chars = '<>:"/\\|?*'
    for char in invalid_chars:
        name = name.replace(char, '_')
    return name.replace(' ', '_')[:150]

def fetch_trailer_url(movie_id):
    """Get YouTube trailer URL from TMDB"""
    try:
        url = f"{TMDB_BASE_URL}/movie/{movie_id}/videos"
        params = {'api_key': TMDB_API_KEY, 'language': 'en-US'}
        response = requests.get(url, params=params)
        data = response.json()
        
        if 'results' in data and data['results']:
            # Find official trailer
            for video in data['results']:
                if video['type'] == 'Trailer' and video['site'] == 'YouTube':
                    if video.get('official', False):
                        return f"https://www.youtube.com/watch?v={video['key']}"
            
            # Fallback to any trailer
            for video in data['results']:
                if video['type'] == 'Trailer' and video['site'] == 'YouTube':
                    return f"https://www.youtube.com/watch?v={video['key']}"
        
        return None
    except Exception as e:
        return None

def download_trailer(youtube_url, output_path):
    """Download trailer using yt-dlp as Python module"""
    try:
        cmd = [
            'python', '-m', 'yt_dlp',
            '-f', 'best[ext=mp4]',
            '--no-playlist',
            '-o', output_path,
            youtube_url
        ]
        
        result = subprocess.run(cmd, check=True, capture_output=True, text=True)
        return True
    except subprocess.CalledProcessError as e:
        return False
    except Exception as e:
        return False

def generate_heatmap(video_path, output_path):
    """Generate heatmap using ffmpeg"""
    try:
        cmd = [
            'ffmpeg',
            '-i', video_path,
            '-vf', "select='not(mod(n,30))',scale=320:240,tile=10x10",
            '-frames:v', '1',
            '-y',
            output_path
        ]
        
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except:
        return False

def load_movies_from_file():
    """Load movies list from JSON file"""
    if os.path.exists(MOVIES_LIST_FILE):
        with open(MOVIES_LIST_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return data.get('movies', [])
    else:
        print(f"❌ File not found: {MOVIES_LIST_FILE}")
        print("Please create a JSON file with movies data first.")
        return []

def discover_movies_from_tmdb():
    """Discover movies from TMDB - simpler version"""
    print('📊 Discovering movies from TMDB...\n')
    
    # Directors
    directors = [488, 525, 5247, 5294, 24, 1032, 1243, 1275, 2710, 13848, 11080, 1776, 137081, 138]
    
    # Actors
    actors = [6193, 380, 1158, 2461, 1892, 880, 10297, 1461, 287, 31, 2524, 819, 62, 1205, 7399, 
              1204, 15735, 1038, 6941, 16483, 1100, 976, 5292, 6384, 1231, 776, 8178, 8891, 
              2227, 5064, 72129, 1160, 500, 30614, 514, 3894]
    
    all_movies = {}
    
    # Fetch by directors
    print('🎬 Fetching by directors...')
    for director_id in directors:
        try:
            url = f"{TMDB_BASE_URL}/discover/movie"
            params = {
                'api_key': TMDB_API_KEY,
                'with_crew': director_id,
                'sort_by': 'popularity.desc',
                'primary_release_date.gte': '1985-01-01',
                'language': 'en-US'
            }
            response = requests.get(url, params=params)
            movies = response.json().get('results', [])
            
            for movie in movies:
                if movie['id'] not in all_movies:
                    all_movies[movie['id']] = movie
            
            time.sleep(0.3)
            print('.', end='', flush=True)
        except:
            pass
    
    print(f'\n   Found {len(all_movies)} movies from directors')
    
    # Fetch by actors
    print('🎭 Fetching by actors...')
    for actor_id in actors:
        try:
            url = f"{TMDB_BASE_URL}/discover/movie"
            params = {
                'api_key': TMDB_API_KEY,
                'with_cast': actor_id,
                'sort_by': 'popularity.desc',
                'primary_release_date.gte': '1985-01-01',
                'language': 'en-US'
            }
            response = requests.get(url, params=params)
            movies = response.json().get('results', [])
            
            for movie in movies:
                if movie['id'] not in all_movies:
                    all_movies[movie['id']] = movie
            
            time.sleep(0.3)
            print('.', end='', flush=True)
        except:
            pass
    
    print(f'\n   Total: {len(all_movies)} movies')
    
    # Convert to list and sort by popularity
    movies_list = sorted(all_movies.values(), key=lambda x: x.get('popularity', 0), reverse=True)
    
    # Save to file for future use
    with open(MOVIES_LIST_FILE, 'w', encoding='utf-8') as f:
        json.dump({'total': len(movies_list), 'movies': movies_list}, f, indent=2)
    
    print(f'💾 Saved movies list to {MOVIES_LIST_FILE}\n')
    
    return movies_list

def main():
    print('🚀 Movie Trailer Downloader\n')
    
    # Load or discover movies
    movies_list = load_movies_from_file()
    
    if not movies_list:
        movies_list = discover_movies_from_tmdb()
    
    if not movies_list:
        print('❌ No movies found!')
        return
    
    print(f'✅ Found {len(movies_list)} movies')
    print('\n📥 Downloading trailers...\n')
    
    success = 0
    failed = 0
    skipped = 0
    
    for i, movie in enumerate(movies_list):
        year = movie.get('release_date', '').split('-')[0] if movie.get('release_date') else 'Unknown'
        title = movie.get('title', 'Unknown')
        movie_id = movie.get('id')
        
        print(f"[{i+1}/{len(movies_list)}] {title} ({year})")
        
        # Create filename
        filename = sanitize_filename(title)
        video_path = os.path.join(OUTPUT_DIR, f"{filename}_{year}.mp4")
        heatmap_path = os.path.join(OUTPUT_DIR, f"{filename}_{year}_heatmap.jpg")
        
        # Skip if already downloaded
        if os.path.exists(video_path):
            print('   ⏭️  Already downloaded\n')
            skipped += 1
            continue
        
        # Get trailer URL
        trailer_url = fetch_trailer_url(movie_id)
        
        if not trailer_url:
            print('   ⚠️  No trailer found\n')
            failed += 1
            continue
        
        print('   📥 Downloading...')
        
        if download_trailer(trailer_url, video_path):
            print('   ✅ Downloaded')
            
            # Try to generate heatmap
            if os.path.exists(video_path):
                print('   🎨 Creating heatmap...')
                if generate_heatmap(video_path, heatmap_path):
                    print('   ✅ Heatmap created')
            
            success += 1
        else:
            print('   ❌ Download failed')
            failed += 1
        
        print('')
        time.sleep(1)
    
    print('\n✅ COMPLETE!')
    print(f'✅ Success: {success}')
    print(f'⏭️  Skipped (already exists): {skipped}')
    print(f'❌ Failed: {failed}')
    print(f'📁 Saved to: {OUTPUT_DIR}')

if __name__ == '__main__':
    main()