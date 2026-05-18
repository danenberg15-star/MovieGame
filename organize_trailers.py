# organize_trailers.py
import os
import shutil

MOVIES_DIR = r'public\assets\movies'

def organize_trailers():
    """Move movie_XXX.mp4 files into movie_XXX/trailer.mp4"""
    
    print('📁 Organizing trailers into folders...\n')
    
    success = 0
    skipped = 0
    
    # Get all movie_XXX.mp4 files
    for filename in os.listdir(MOVIES_DIR):
        if not filename.startswith('movie_') or not filename.endswith('.mp4'):
            continue
        
        # Extract movie ID (e.g., movie_001 from movie_001.mp4)
        movie_id = filename.replace('.mp4', '')
        
        # Source file
        source = os.path.join(MOVIES_DIR, filename)
        
        # Target folder and file
        target_folder = os.path.join(MOVIES_DIR, movie_id)
        target_file = os.path.join(target_folder, 'trailer.mp4')
        
        # Skip if already organized
        if os.path.exists(target_file):
            print(f'⏭️  {movie_id} - Already organized')
            skipped += 1
            continue
        
        # Create folder if doesn't exist
        os.makedirs(target_folder, exist_ok=True)
        
        # Move file
        shutil.move(source, target_file)
        
        print(f'✅ {movie_id} - Moved to {movie_id}/trailer.mp4')
        success += 1
    
    print(f'\n✅ COMPLETE!')
    print(f'✅ Organized: {success}')
    print(f'⏭️  Skipped: {skipped}')

if __name__ == '__main__':
    organize_trailers()