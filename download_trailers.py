# download_trailers.py
import os
import time
import requests
import subprocess
from pathlib import Path

TMDB_API_KEY = '0c5eb1c3ddee8977d991539ff01c66d0'
TMDB_BASE_URL = 'https://api.themoviedb.org/3'
OUTPUT_DIR = 'downloaded-movies'
MIN_YEAR = 1985

# Create output directory
os.makedirs(OUTPUT_DIR, exist_ok=True)

# Target directors
TARGET_DIRECTORS = [
    {'name': 'Steven Spielberg', 'id': 488},
    {'name': 'Christopher Nolan', 'id': 525},
    {'name': 'Robert Altman', 'id': 5247},
    {'name': 'Rob Reiner', 'id': 5294},
    {'name': 'Robert Zemeckis', 'id': 24},
    {'name': 'Martin Scorsese', 'id': 1032},
    {'name': 'Woody Allen', 'id': 1243},
    {'name': 'Ron Howard', 'id': 1275},
    {'name': 'James Cameron', 'id': 2710},
    {'name': 'Clint Eastwood', 'id': 13848},
    {'name': 'Guy Ritchie', 'id': 11080},
    {'name': 'Francis Ford Coppola', 'id': 1776},
    {'name': 'Greta Gerwig', 'id': 137081},
    {'name': 'Quentin Tarantino', 'id': 138}
]

# Target actors
TARGET_ACTORS = [
    {'name': 'Leonardo DiCaprio', 'id': 6193},
    {'name': 'Robert De Niro', 'id': 380},
    {'name': 'Al Pacino', 'id': 1158},
    {'name': 'Mel Gibson', 'id': 2461},
    {'name': 'Matt Damon', 'id': 1892},
    {'name': 'Ben Affleck', 'id': 880},
    {'name': 'Matthew McConaughey', 'id': 10297},
    {'name': 'George Clooney', 'id': 1461},
    {'name': 'Brad Pitt', 'id': 287},
    {'name': 'Tom Hanks', 'id': 31},
    {'name': 'Tom Hardy', 'id': 2524},
    {'name': 'Edward Norton', 'id': 819},
    {'name': 'Bruce Willis', 'id': 62},
    {'name': 'Richard Gere', 'id': 1205},
    {'name': 'Ben Stiller', 'id': 7399},
    {'name': 'Julia Roberts', 'id': 1204},
    {'name': 'Helen Mirren', 'id': 15735},
    {'name': 'Jodie Foster', 'id': 1038},
    {'name': 'Cameron Diaz', 'id': 6941},
    {'name': 'Sylvester Stallone', 'id': 16483},
    {'name': 'Arnold Schwarzenegger', 'id': 1100},
    {'name': 'Jason Statham', 'id': 976},
    {'name': 'Denzel Washington', 'id': 5292},
    {'name': 'Keanu Reeves', 'id': 6384},
    {'name': 'Gwyneth Paltrow', 'id': 1231},
    {'name': 'Eddie Murphy', 'id': 776},
    {'name': 'Chris Tucker', 'id': 8178},
    {'name': 'John Travolta', 'id': 8891},
    {'name': 'Nicole Kidman', 'id': 2227},
    {'name': 'Meryl Streep', 'id': 5064},
    {'name': 'Jennifer Lawrence', 'id': 72129},
    {'name': 'Michelle Pfeiffer', 'id': 1160},
    {'name': 'Tom Cruise', 'id': 500},
    {'name': 'Ryan Gosling', 'id': 30614},
    {'name': 'Jack Nicholson', 'id': 514},
    {'name': 'Christian Bale', 'id': 3894}
]

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
        print(f"   ⚠️  Error fetching trailer: {e}")
        return None

def download_trailer(youtube_url, output_path):
    """Download trailer using yt-dlp"""
    try:
        cmd = [
            'yt-dlp',
            '-f', 'best[ext=mp4]',
            '--no-playlist',
            '-o', output_path,
            youtube_url
        ]
        
        subprocess.run(cmd, check=True, capture_output=True)
        return True
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

def fetch_movies_by_director(director_id):
    """Fetch movies by director from TMDB"""
    try:
        url = f"{TMDB_BASE_URL}/discover/movie"
        params = {
            'api_key': TMDB_API_KEY,
            'with_crew': director_id,
            'sort_by': 'popularity.desc',
            'primary_release_date.gte': f'{MIN_YEAR}-01-01',
            'language': 'en-US'
        }
        response = requests.get(url, params=params)
        time.sleep(0.3)
        return response.json().get('results', [])
    except:
        return []

def fetch_movies_by_actor(actor_id):
    """Fetch movies by actor from TMDB"""
    try:
        url = f"{TMDB_BASE_URL}/discover/movie"
        params = {
            'api_key': TMDB_API_KEY,
            'with_cast': actor_id,
            'sort_by': 'popularity.desc',
            'primary_release_date.gte': f'{MIN_YEAR}-01-01',
            'language': 'en-US'
        }
        response = requests.get(url, params=params)
        time.sleep(0.3)
        return response.json().get('results', [])
    except:
        return []

def fetch_oscar_winners():
    """Fetch potential Oscar winners"""
    movies = []
    try:
        for year in range(MIN_YEAR, 2026):
            url = f"{TMDB_BASE_URL}/discover/movie"
            params = {
                'api_key': TMDB_API_KEY,
                'primary_release_year': year,
                'sort_by': 'vote_average.desc',
                'vote_count.gte': 1000,
                'language': 'en-US'
            }
            response = requests.get(url, params=params)
            results = response.json().get('results', [])
            movies.extend(results[:3])
            time.sleep(0.3)
    except:
        pass
    
    return movies

def main():
    print('🚀 Movie Trailer Downloader\n')
    print('📊 Discovering movies...\n')
    
    all_movies = {}
    
    # Fetch by directors
    print('📽️  Directors:')
    for director in TARGET_DIRECTORS:
        print(f"   🎬 {director['name']}...")
        movies = fetch_movies_by_director(director['id'])
        for movie in movies:
            if movie['id'] not in all_movies:
                all_movies[movie['id']] = {**movie, 'via': [director['name']]}
            else:
                all_movies[movie['id']]['via'].append(director['name'])
    
    # Fetch by actors
    print('\n🎭 Actors:')
    for actor in TARGET_ACTORS:
        print(f"   🎭 {actor['name']}...")
        movies = fetch_movies_by_actor(actor['id'])
        for movie in movies:
            if movie['id'] not in all_movies:
                all_movies[movie['id']] = {**movie, 'via': [actor['name']]}
            else:
                all_movies[movie['id']]['via'].append(actor['name'])
    
    # Fetch Oscar winners
    print('\n🏆 Oscar Winners...')
    oscar_movies = fetch_oscar_winners()
    for movie in oscar_movies:
        if movie['id'] not in all_movies:
            all_movies[movie['id']] = {**movie, 'via': ['Oscar']}
        else:
            all_movies[movie['id']]['via'].append('Oscar')
    
    # Sort by popularity
    movies_list = sorted(all_movies.values(), key=lambda x: x.get('popularity', 0), reverse=True)
    
    print(f'\n✅ Found {len(movies_list)} movies')
    print('\n📥 Downloading trailers...\n')
    
    success = 0
    failed = 0
    
    for i, movie in enumerate(movies_list):
        year = movie.get('release_date', '').split('-')[0] if movie.get('release_date') else 'Unknown'
        title = movie.get('title', 'Unknown')
        
        print(f"[{i+1}/{len(movies_list)}] {title} ({year})")
        
        # Get trailer URL
        trailer_url = fetch_trailer_url(movie['id'])
        
        if not trailer_url:
            print('   ⚠️  No trailer found\n')
            failed += 1
            continue
        
        # Create filename
        filename = sanitize_filename(title)
        video_path = os.path.join(OUTPUT_DIR, f"{filename}_{year}.mp4")
        heatmap_path = os.path.join(OUTPUT_DIR, f"{filename}_{year}_heatmap.jpg")
        
        print('   📥 Downloading...')
        
        if download_trailer(trailer_url, video_path):
            print('   ✅ Downloaded')
            
            # Try to generate heatmap
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
    print(f'Success: {success}')
    print(f'Failed: {failed}')
    print(f'Saved to: {OUTPUT_DIR}')

if __name__ == '__main__':
    main()