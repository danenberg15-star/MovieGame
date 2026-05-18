import requests

def check(name, url):
    # הוספת זהות דפדפן כדי לעקוף חסימות
    headers = {'User-Agent': 'Mozilla/5.0'}
    try:
        res = requests.head(url, headers=headers, timeout=5, allow_redirects=True)
        status = "זמין ✅" if res.status_code == 200 else f"נכשל ({res.status_code}) ❌"
        print(f"{name}: {status}")
    except:
        print(f"{name}: שגיאת תקשורת ❌")

print("--- בדיקת היתכנות סופית ---")
# תמונה מ-TMDB עם זהות דפדפן
check("תמונת סנדק", "https://image.tmdb.org/t/p/w500/3bhkrj9pkSj9UpgNi5t26mDYIfy.jpg")
# סאונד מ-Myinstants (קישור מעודכן)
check("סאונד סנדק", "https://www.myinstants.com/media/sounds/godfather.mp3")