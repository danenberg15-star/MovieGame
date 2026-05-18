# enrich_movies_from_tmdb.py
import os
import json
import requests
import time

# ==================== CONFIGURATION ====================
TMDB_API_KEY = '0c5eb1c3ddee8977d991539ff01c66d0'
TMDB_BASE_URL = 'https://api.themoviedb.org/3'

INPUT_JSON = r'public\assets\movies\movies-database.json'
OUTPUT_JSON = r'public\assets\movies\movies-database-enriched.json'

# ==================== TMDB API FUNCTIONS ====================

def get_movie_translations(tmdb_id):
    """Get Hebrew title from TMDB translations"""
    try:
        url = f"{TMDB_BASE_URL}/movie/{tmdb_id}/translations"
        params = {'api_key': TMDB_API_KEY}
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        # Look for Hebrew translation
        for translation in data.get('translations', []):
            if translation.get('iso_3166_1') == 'IL' or translation.get('iso_639_1') == 'he':
                hebrew_title = translation.get('data', {}).get('title')
                if hebrew_title:
                    return hebrew_title
        
        return None
    except:
        return None

def get_similar_movies(tmdb_id, original_title, count=9):
    """Get similar movies for decoy answers"""
    try:
        url = f"{TMDB_BASE_URL}/movie/{tmdb_id}/similar"
        params = {
            'api_key': TMDB_API_KEY,
            'language': 'en-US'
        }
        response = requests.get(url, params=params, timeout=10)
        data = response.json()
        
        decoys = []
        for movie in data.get('results', [])[:count]:
            title = movie.get('title')
            if title and title != original_title:
                decoys.append(title)
        
        return decoys
    except:
        return []

def get_hebrew_translation_for_decoys(decoys):
    """Get Hebrew translations for decoy movie titles"""
    hebrew_decoys = []
    
    for title in decoys:
        try:
            # Search for the movie
            url = f"{TMDB_BASE_URL}/search/movie"
            params = {
                'api_key': TMDB_API_KEY,
                'query': title,
                'language': 'en-US'
            }
            response = requests.get(url, params=params, timeout=10)
            data = response.json()
            
            if data.get('results'):
                movie_id = data['results'][0].get('id')
                hebrew_title = get_movie_translations(movie_id)
                
                if hebrew_title:
                    hebrew_decoys.append(hebrew_title)
                else:
                    hebrew_decoys.append(title)  # Fallback to English
            else:
                hebrew_decoys.append(title)
            
            time.sleep(0.2)  # Rate limiting
            
        except:
            hebrew_decoys.append(title)
    
    return hebrew_decoys

def get_movie_awards(tmdb_id):
    """Get awards/nominations from TMDB (limited info)"""
    # Note: TMDB doesn't have comprehensive Oscar data
    # This is a placeholder - you might need a separate Oscar API
    return []

def is_movie_enriched(movie):
    """Check if movie is already enriched"""
    # Check if has English decoys
    if movie.get('decoy_answers', {}).get('en'):
        if len(movie['decoy_answers']['en']) >= 9:
            return True
    return False

def save_progress(database, output_path):
    """Save current progress to file"""
    try:
        with open(output_path, 'w', encoding='utf-8') as f:
            json.dump(database, f, indent=2, ensure_ascii=False)
        return True
    except Exception as e:
        print(f'   ⚠️  Failed to save: {e}')
        return False

# ==================== MAIN ENRICHMENT ====================

def enrich_movies():
    """Enrich all movies with Hebrew translations and decoy answers"""
    
    print('=' * 60)
    print('ENRICHING MOVIES DATABASE FROM TMDB')
    print('=' * 60)
    print()
    
    # Load existing database or create from input
    if os.path.exists(OUTPUT_JSON):
        print(f'📂 Loading existing enriched database...')
        with open(OUTPUT_JSON, 'r', encoding='utf-8') as f:
            database = json.load(f)
        print(f'✅ Loaded {len(database["movies"])} movies\n')
    else:
        print(f'📂 Creating new enriched database from input...')
        with open(INPUT_JSON, 'r', encoding='utf-8') as f:
            database = json.load(f)
        print(f'✅ Loaded {len(database["movies"])} movies\n')
    
    movies = database['movies']
    total = len(movies)
    
    # Count already enriched
    already_enriched = sum(1 for m in movies if is_movie_enriched(m))
    
    print(f'📋 Total movies: {total}')
    print(f'✅ Already enriched: {already_enriched}')
    print(f'⏳ To process: {total - already_enriched}\n')
    
    enriched = 0
    skipped = 0
    failed = 0
    
    for idx, movie in enumerate(movies):
        movie_id = movie['id']
        tmdb_id = movie['tmdb_id']
        title_en = movie['title']['en']
        
        print(f"[{idx + 1}/{total}] {movie_id} - {title_en}")
        
        # Skip if already enriched
        if is_movie_enriched(movie):
            print(f'   ⏭️  Already enriched, skipping\n')
            skipped += 1
            continue
        
        try:
            # 1. Get Hebrew title
            print(f'   🔍 Fetching Hebrew translation...')
            hebrew_title = get_movie_translations(tmdb_id)
            
            if hebrew_title:
                movie['title']['he'] = hebrew_title
                print(f'   ✅ Hebrew: {hebrew_title}')
            else:
                print(f'   ⚠️  No Hebrew translation found, keeping English')
                movie['title']['he'] = title_en
            
            # 2. Get similar movies for decoys
            print(f'   🔍 Fetching similar movies for decoys...')
            decoys_en = get_similar_movies(tmdb_id, title_en, count=9)
            
            if len(decoys_en) >= 9:
                movie['decoy_answers']['en'] = decoys_en[:9]
                print(f'   ✅ Got {len(decoys_en)} English decoys')
                
                # 3. Get Hebrew translations for decoys
                print(f'   🔍 Translating decoys to Hebrew...')
                decoys_he = get_hebrew_translation_for_decoys(decoys_en[:9])
                movie['decoy_answers']['he'] = decoys_he
                print(f'   ✅ Translated decoys to Hebrew')
            else:
                print(f'   ⚠️  Not enough similar movies found ({len(decoys_en)}/9)')
                movie['decoy_answers']['en'] = decoys_en
                movie['decoy_answers']['he'] = decoys_en
            
            # 4. Translate cast/crew names to Hebrew
            if movie.get('director') and movie['director'].get('name'):
                movie['director']['name']['he'] = movie['director']['name']['en']
            
            if movie.get('producer') and movie['producer'].get('name'):
                movie['producer']['name']['he'] = movie['producer']['name']['en']
            
            for cast_member in movie.get('cast', []):
                if cast_member.get('name'):
                    cast_member['name']['he'] = cast_member['name']['en']
            
            enriched += 1
            print(f'   ✅ Enriched successfully')
            
            # Save progress after every movie
            print(f'   💾 Saving progress...')
            if save_progress(database, OUTPUT_JSON):
                print(f'   ✅ Saved\n')
            else:
                print(f'   ⚠️  Save failed but continuing\n')
            
            # Rate limiting
            time.sleep(0.5)
            
        except Exception as e:
            print(f'   ❌ Error: {e}\n')
            failed += 1
            continue
    
    # Update total
    database['total'] = len(movies)
    
    # Final save
    print('\n💾 Final save...')
    save_progress(database, OUTPUT_JSON)
    
    print('=' * 60)
    print('✅ ENRICHMENT COMPLETE!')
    print('=' * 60)
    print(f'✅ Newly enriched: {enriched} movies')
    print(f'⏭️  Skipped (already done): {skipped} movies')
    print(f'❌ Failed: {failed} movies')
    print(f'📁 Saved to: {OUTPUT_JSON}')
    print()
    print('📋 What was added:')
    print('   ✅ Hebrew movie titles from TMDB')
    print('   ✅ 9 decoy answers (similar movies) in English')
    print('   ✅ 9 decoy answers translated to Hebrew')
    print('   ✅ Cast/crew names (Hebrew = English for now)')
    print()

# ==================== MAIN ====================

def main():
    print('\n')
    print('🎬' * 30)
    print('TMDB ENRICHMENT - HEBREW TRANSLATIONS & DECOYS')
    print('🎬' * 30)
    print('\n')
    
    try:
        enrich_movies()
        
        print('\n📋 Next step:')
        print('   The enriched file is ready:')
        print(f'   {OUTPUT_JSON}')
        print()
        
    except Exception as e:
        print(f'\n❌ ERROR: {e}')
        import traceback
        traceback.print_exc()

if __name__ == '__main__':
    main()