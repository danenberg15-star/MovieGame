const fs = require('fs');
const axios = require('axios');
const path = require('path');

// המפתח האישי שלך
const API_KEY = "0c5eb1c3ddee8977d991539ff01c66d0"; 

const scenesDir = path.join(__dirname, 'assets', 'scenes');
if (!fs.existsSync(scenesDir)) fs.mkdirSync(scenesDir, { recursive: true });

async function buildLocalDatabase() {
    console.log("--- מתחיל הורדת 100 סצנות למכשיר ---");
    let allMovies = [];

    try {
        // משיכת 5 דפים כדי להגיע ל-100 סרטים
        for (let page = 1; page <= 5; page++) {
            const res = await axios.get(`https://api.themoviedb.org/3/movie/top_rated`, {
                params: { api_key: API_KEY, language: 'he-IL', page: page }
            });
            allMovies.push(...res.data.results);
        }

        const finalData = [];
        for (let i = 0; i < allMovies.length; i++) {
            const m = allMovies[i];
            const fileName = `scene_${i}.jpg`;
            const localPath = `assets/scenes/${fileName}`;
            const imgUrl = `https://image.tmdb.org/t/p/w780${m.backdrop_path}`;
            
            try {
                const response = await axios.get(imgUrl, { responseType: 'stream' });
                const writer = fs.createWriteStream(path.join(__dirname, localPath));
                response.data.pipe(writer);

                // מחכים שהקובץ יסיים להיכתב לפני שממשיכים
                await new Promise((resolve) => writer.on('finish', resolve));

                finalData.push({
                    id: i,
                    title: m.title,
                    year: m.release_date ? m.release_date.split('-')[0] : "N/A",
                    image: localPath,
                    audio: `https://www.myinstants.com/media/sounds/${m.title.toLowerCase().replace(/ /g, "-")}.mp3`
                });
                console.log(`✅ [${i+1}/100] הורדה למכשיר: ${m.title}`);
            } catch (e) {
                console.log(`❌ דילוג על: ${m.title} (אין תמונה זמינה)`);
            }
        }

        fs.writeFileSync('movies_db.json', JSON.stringify(finalData, null, 4));
        console.log("\n--- הסתיים! 100 סרטים וסצנות מוכנים אופליין ---");
    } catch (err) {
        console.error("❌ שגיאה בחיבור ל-TMDB. בדוק את ה-API Key.");
    }
}

buildLocalDatabase();