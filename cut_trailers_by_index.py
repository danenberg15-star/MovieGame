# cut_trailers_by_tmdb_list.py
import os
import subprocess
import cv2
import numpy as np
import json
from pathlib import Path
import glob
import re

# Paths
MOVIES_LIST = 'movies-list.json'
DOWNLOADED_MOVIES_DIR = 'downloaded-movies'
FINAL_TRAILERS_DIR = 'final trailers'
TRAILER_DURATION = 15  # seconds

os.makedirs(FINAL_TRAILERS_DIR, exist_ok=True)

def load_movies_list():
    """Load TMDB movies list JSON"""
    with open(MOVIES_LIST, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return data['movies']

def sanitize_for_search(title):
    """Convert movie title to search pattern"""
    # Remove special characters and extra spaces
    clean = re.sub(r'[^\w\s]', '', title)
    clean = re.sub(r'\s+', '_', clean.strip())
    return clean

def find_trailer_file(title, year):
    """
    Find trailer file by movie title and year
    Returns full path if found, None otherwise
    """
    # Clean title for filename matching
    clean_title = sanitize_for_search(title)
    
    # Try multiple patterns
    patterns = [
        f"{clean_title}_{year}.mp4",
        f"{clean_title}.mp4",
        f"{clean_title}*.mp4"
    ]
    
    for pattern in patterns:
        full_pattern = os.path.join(DOWNLOADED_MOVIES_DIR, pattern)
        matches = glob.glob(full_pattern)
        
        # Filter out heatmaps
        matches = [m for m in matches if '_heatmap' not in m]
        
        if matches:
            return matches[0]
    
    return None

def get_video_duration(video_path):
    """Get video duration in seconds"""
    try:
        cmd = [
            'ffprobe',
            '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            video_path
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, check=True)
        return float(result.stdout.strip())
    except:
        return None

def analyze_video_for_best_segment(video_path, video_duration):
    """
    Analyze video frames to find the most action-packed segment
    Returns start_time for 15-second clip
    """
    try:
        # Sample 30 frames throughout the video
        cap = cv2.VideoCapture(video_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        fps = cap.get(cv2.CAP_PROP_FPS)
        
        if total_frames == 0 or fps == 0:
            return None
        
        # Sample frames
        sample_count = 30
        frame_interval = total_frames // sample_count
        
        energy_map = []
        
        for i in range(sample_count):
            frame_number = i * frame_interval
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_number)
            ret, frame = cap.read()
            
            if not ret:
                continue
            
            # Calculate frame energy (brightness + motion indicator)
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            brightness = np.mean(gray)
            variance = np.var(gray)  # High variance = more detail/action
            
            energy = brightness * 0.3 + variance * 0.7
            
            time_sec = frame_number / fps
            
            energy_map.append({
                'index': i,
                'energy': energy,
                'time': time_sec
            })
        
        cap.release()
        
        # Sort by energy
        energy_map.sort(key=lambda x: x['energy'], reverse=True)
        
        # Exclude first 20% and last 20% (to avoid title screens)
        safe_start = video_duration * 0.2
        safe_end = video_duration * 0.8
        
        # Find best segment that fits in safe zone
        for segment in energy_map:
            segment_time = segment['time']
            
            # Check if this segment + 15 seconds fits in safe zone
            if safe_start <= segment_time <= (safe_end - TRAILER_DURATION):
                return segment_time
        
        # Fallback: use middle of the video
        return (video_duration - TRAILER_DURATION) / 2
        
    except Exception as e:
        print(f"   ⚠️  Video analysis failed: {e}")
        return None

def cut_trailer(input_path, output_path, start_time):
    """Cut 15 seconds from video starting at start_time"""
    try:
        cmd = [
            'ffmpeg',
            '-i', input_path,
            '-ss', str(start_time),
            '-t', str(TRAILER_DURATION),
            '-c:v', 'libx264',
            '-c:a', 'aac',
            '-b:a', '128k',
            '-y',
            output_path
        ]
        
        subprocess.run(cmd, check=True, capture_output=True)
        return True
    except Exception as e:
        print(f"   ❌ Cut failed: {e}")
        return False

def main():
    print('✂️  Cutting trailers to 15 seconds (TMDB version)\n')
    
    # Load movies list
    movies = load_movies_list()
    print(f'📋 Loaded {len(movies)} movies from TMDB list\n')
    
    success = 0
    failed = 0
    skipped = 0
    not_found = 0
    
    for i, movie in enumerate(movies):
        tmdb_id = movie.get('id')
        title = movie.get('title', 'Unknown')
        release_date = movie.get('release_date', '')
        year = release_date.split('-')[0] if release_date else 'Unknown'
        
        movie_id = f"movie_{str(i+1).zfill(3)}"
        
        print(f"[{i+1}/{len(movies)}] {movie_id} - {title} ({year})")
        
        # Output path
        output_filename = f"{movie_id}.mp4"
        output_path = os.path.join(FINAL_TRAILERS_DIR, output_filename)
        
        # Skip if already processed
        if os.path.exists(output_path):
            print('   ⏭️  Already processed\n')
            skipped += 1
            continue
        
        # Find input file
        input_path = find_trailer_file(title, year)
        
        if not input_path:
            print(f'   ❌ File not found')
            not_found += 1
            continue
        
        print(f'   ✅ Found: {os.path.basename(input_path)}')
        
        # Get duration
        duration = get_video_duration(input_path)
        
        if not duration:
            print('   ❌ Cannot get video duration\n')
            failed += 1
            continue
        
        if duration < TRAILER_DURATION:
            print(f'   ⚠️  Video too short ({duration:.1f}s), copying as-is')
            subprocess.run(['copy', input_path, output_path], shell=True)
            success += 1
            print('')
            continue
        
        print(f'   📊 Analyzing video (duration: {duration:.1f}s)...')
        
        # Analyze video
        start_time = analyze_video_for_best_segment(input_path, duration)
        
        if start_time is None:
            # Fallback to middle
            start_time = (duration - TRAILER_DURATION) / 2
            print(f'   ⚠️  Using middle segment as fallback')
        
        print(f'   ✂️  Cutting from {start_time:.1f}s to {start_time + TRAILER_DURATION:.1f}s')
        
        # Cut video
        if cut_trailer(input_path, output_path, start_time):
            print(f'   ✅ Saved as: {output_filename}')
            success += 1
        else:
            failed += 1
        
        print('')
    
    print('\n✅ COMPLETE!')
    print(f'✅ Success: {success}')
    print(f'⏭️  Skipped (already exists): {skipped}')
    print(f'❌ Not found: {not_found}')
    print(f'❌ Failed: {failed}')
    print(f'📁 Output: {FINAL_TRAILERS_DIR}')

if __name__ == '__main__':
    main()