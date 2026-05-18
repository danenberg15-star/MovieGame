import requests
import os
import json
import time

# הגדרות בסיסיות
API_KEY = "8522680e92d97d953683f2191590d33e"
BASE_URL = "https://api.themoviedb.org/3"
HEADERS = {'User-Agent': 'Mozilla/5.0'}

# יצירת תיקיות
os.makedirs('assets/posters', exist_ok=True)
os.makedirs('assets/audio', exist_ok=True)

def get_top_100():
    all_movies = []
    # TMDB נותן 20 סרטים לדף, אז ניקח 5 דפים
    for page in range(1, 6):
        url = f"{BASE_URL}/movie/top_rated?api_key={API_KEY}&language=he-IL&page={page}"
        res = requests.get(url).json()
        all_movies.extend(res.get('results', []))
    return all_movies

def download_assets():
    movies = get_top_100()
    final_data = []

    for i, m in enumerate(movies):
        title = m['title']
        movie_id = m['id']
        year = m['release_date'][:4]
        
        # 1. הורדת פוסטר
        poster_path = f"assets/posters/movie_{i}.jpg"
        poster_url = f"https://image.tmdb.org/t/p/w500{m['poster_path']}"
        try:
            img_data = requests.get(poster_url, headers=HEADERS).content
            with open(poster_path, 'wb') as f:
                f.write(img_data)
        except:
            poster_path = "https://via.placeholder.com/500x750?text=No+Poster"

        # 2. קישור סאונד (כרגע נשים קישור ל-Myinstants מבוסס חיפוש שם הסרט)
        # בהמשך נוכל לשכלל את זה להורדה אוטומטית
        audio_name = title.lower().replace(" ", "-")
        audio_url = f"https://www.myinstants.com/media/sounds/{audio_name}.mp3"

        final_data.append({
            "id": i,
            "title": title,
            "year": year,
            "poster": poster_path,
            "audio": audio_url
        })
        print(f"[{i+1}/100] עובד על: {title}")
        time.sleep(0.1) # מניעת חסימה

    # שמירה לקובץ JSON שהמשחק יקרא
    with open('movies_db.json', 'w', encoding='utf-8') as f:
        json.dump(final_data, f, ensure_ascii=False, indent=4)

if __name__ == "__main__":
    download_assets()