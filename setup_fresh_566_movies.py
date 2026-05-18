# setup_fresh_566_movies.py
import os
import shutil
import json
import requests
import time

# ==================== CONFIGURATION ====================
TMDB_API_KEY = '0c5eb1c3ddee8977d991539ff01c66d0'
TMDB_BASE_URL = 'https://api.themoviedb.org/3'

# Paths
MOVIES_LIST = 'movies-list.json'
FINAL_TRAILERS_DIR = r'final trailers'
MOVIES_DIR = r'public\assets\movies'
BACKUP_DIR = r'public\assets\movies_OLD_109_BACKUP'
OUTPUT_JSON = r'public\assets\movies\movies-database.json'

# ==================== STEP 1: BACKUP OLD 109 ====================
def backup_old_movies():
    """Move old movie_001 to movie_109 to backup folder"""
    print('=' * 60)
    print('STEP 1: Backing up old 109 movies')
    print('=' * 60)
    
    os.makedirs(BACKUP_DIR, exist_ok=True)
    
    backed_up = 0
    
    for i in range(1, 110):
        movie_id = f"movie_{str(i).zfill(3)}"
        old_folder = os.path.join(MOVIES_DIR, movie_id)
        backup_folder = os.path.join(BACKUP_DIR, movie_id)
        
        if os.path.exists(old_folder):
            shutil.move(old_folder, backup_folder)
            print(f'✅ Backed up: {movie_id}')
            backed_up += 1
    
    print(f'\n✅ Backed up {backed_up} old movies to: {BACKUP_DIR}\n')

# ==================== STEP 2: ORGANIZE NEW TRAILERS ====================
def organize_new_trailers():
    """Move movie_XXX.mp4 files into movie_XXX/trailer.mp4 folders"""
    print('=' * 60)
    print('STEP 2: Organizing new 566 trailers into folders')
    print('=' * 60)
    
    organized = 0
    
    # Get all movie_XXX.mp4 files from final trailers
    for filename in os.listdir(FINAL_TRAILERS_DIR):
        if not filename.startswith('movie_') or not filename.endswith('.mp4'):
            continue
        
        movie_id = filename.replace('.mp4', '')
        
        # Source file
        source = os.path.join(FINAL_TRAILERS_DIR, filename)
        
        # Target folder and file
        target_folder = os.path.join(MOVIES_DIR, movie_id)
        target_file = os.path.join(target_folder, 'trailer.mp4')
        
        # Skip if already exists
        if os.path.exists(target_file):
            print(f'⏭️  {movie_id} - Already exists')
            continue
        
        # Create folder
        os.makedirs(target_folder, exist_ok=True)
        
        # Copy file
        shutil.copy2(source, target_file)
        
        print(f'✅ {movie_id} - Organized')
        organized += 1
    
    print(f'\n✅ Organized {organized} trailers\n')

# ==================== STEP 3: BUILD DATABASE ====================
def load_movies_list():
    """Load TMDB movies list"""
    with open(MOVIES_LIST, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data['movies']

def get_movie_details(tmdb_id):
    """Fetch full movie details from TMDB"""
    try:
        url = f"{TMDB_BASE_URL}/movie/{tmdb_id}"
        params = {
            'api_key': TMDB_API_KEY,
            'language': 'en-US',
            'append_to_response': 'credits'
        }
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        if 'success' in data and not data['success']:
            return None
        
        return data
    except Exception as e:
        print(f'   ⚠️  API Error: {e}')
        return None

def extract_movie_data(movie_basic, movie_details, movie_id):
    """Extract and format movie data"""
    
    title_en = movie_basic.get('title', 'Unknown')
    year = movie_basic.get('release_date', '').split('-')[0] if movie_basic.get('release_date') else None
    
    # Extract cast (top 10 actors)
    cast = []
    if movie_details and 'credits' in movie_details:
        for person in movie_details['credits'].get('cast', [])[:10]:
            cast.append({
                "name": {
                    "en": person.get('name', ''),
                    "he": person.get('name', '')
                },
                "image": f"https://image.tmdb.org/t/p/w200{person.get('profile_path')}" if person.get('profile_path') else None
            })
    
    # Extract director
    director = None
    if movie_details and 'credits' in movie_details:
        for person in movie_details['credits'].get('crew', []):
            if person.get('job') == 'Director':
                director = {
                    "name": {
                        "en": person.get('name', ''),
                        "he": person.get('name', '')
                    },
                    "image": f"https://image.tmdb.org/t/p/w200{person.get('profile_path')}" if person.get('profile_path') else None
                }
                break
    
    # Extract producer
    producer = None
    if movie_details and 'credits' in movie_details:
        for person in movie_details['credits'].get('crew', []):
            if person.get('job') == 'Producer':
                producer = {
                    "name": {
                        "en": person.get('name', ''),
                        "he": person.get('name', '')
                    },
                    "image": f"https://image.tmdb.org/t/p/w200{person.get('profile_path')}" if person.get('profile_path') else None
                }
                break
    
    # Poster
    poster = f"https://image.tmdb.org/t/p/w500{movie_details.get('poster_path')}" if movie_details and movie_details.get('poster_path') else None
    
    movie_data = {
        "id": movie_id,
        "tmdb_id": movie_basic.get('id'),
        "title": {
            "en": title_en,
            "he": title_en  # Will need translation
        },
        "year": int(year) if year else None,
        "director": director,
        "producer": producer,
        "cast": cast,
        "poster": poster,
        "trailer": f"/assets/movies/{movie_id}/trailer.mp4",
        "oscars": [],
        "decoy_answers": {
            "en": [],
            "he": []
        }
    }
    
    return movie_data

def build_database():
    """Build complete movies database"""
    print('=' * 60)
    print('STEP 3: Building movies database from TMDB')
    print('=' * 60)
    
    # Load movies list
    movies_list = load_movies_list()
    print(f'📋 Loaded {len(movies_list)} movies from TMDB list\n')
    
    # Scan for movies with trailers
    all_movies = []
    success = 0
    failed = 0
    
    for i in range(1, 740):
        movie_id = f"movie_{str(i).zfill(3)}"
        trailer_path = os.path.join(MOVIES_DIR, movie_id, 'trailer.mp4')
        
        # Check if trailer exists
        if not os.path.exists(trailer_path):
            continue
        
        # Get movie from TMDB list
        if i - 1 >= len(movies_list):
            print(f'⚠️  {movie_id} - Out of range in TMDB list')
            continue
        
        movie_basic = movies_list[i - 1]
        title = movie_basic.get('title', 'Unknown')
        
        print(f"[{success + failed + 1}] {movie_id} - {title}")
        
        # Get full details from TMDB
        tmdb_id = movie_basic.get('id')
        movie_details = get_movie_details(tmdb_id)
        
        if not movie_details:
            print(f'   ❌ Failed to fetch from TMDB')
            failed += 1
            time.sleep(1)
            continue
        
        # Extract data
        movie_data = extract_movie_data(movie_basic, movie_details, movie_id)
        all_movies.append(movie_data)
        
        print(f'   ✅ Added')
        success += 1
        
        # Rate limiting
        time.sleep(0.3)
    
    # Save database
    database = {
        "total": len(all_movies),
        "movies": all_movies
    }
    
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(database, f, indent=2, ensure_ascii=False)
    
    print(f'\n✅ Database saved to: {OUTPUT_JSON}')
    print(f'📊 Success: {success} movies')
    print(f'📊 Failed: {failed} movies')
    print(f'📊 TOTAL: {len(all_movies)} movies\n')

# ==================== MAIN ====================
def main():
    print('\n')
    print('🎬' * 30)
    print('FRESH 566 MOVIES SETUP - CLEAN START')
    print('🎬' * 30)
    print('\n')
    
    try:
        # Step 1: Backup old 109
        backup_old_movies()
        
        # Step 2: Organize new trailers
        organize_new_trailers()
        
        # Step 3: Build database
        build_database()
        
        print('\n')
        print('=' * 60)
        print('✅ ALL DONE!')
        print('=' * 60)
        print(f'✅ Old 109 movies backed up to: {BACKUP_DIR}')
        print(f'✅ New 566 trailers organized in: {MOVIES_DIR}')
        print(f'✅ Database created at: {OUTPUT_JSON}')
        print('\n📋 Next steps:')
        print('   1. Add Hebrew translations (separate script)')
        print('   2. Generate decoy answers (separate script)')
        print('   3. Add Oscar data (optional)')
        
    except Exception as e:
        print(f'\n❌ ERROR: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()