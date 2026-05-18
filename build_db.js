const fs = require('fs');
const axios = require('axios');
const path = require('path');
const cheerio = require('cheerio');

const API_KEY = "0c5eb1c3ddee8977d991539ff01c66d0";
const baseDir = path.join(__dirname, 'assets', 'review_folder');

// הגדרות סינון
const START_YEAR = 1976; 
const ANIMATION_GENRE_ID = 16;
const ALLOWED_STUDIOS = [2, 3]; // 2 = Walt Disney Pictures, 3 = Pixar
const ALLOWED_COUNTRIES = ['US', 'GB'];

if (!fs.existsSync(baseDir)) fs.mkdirSync(baseDir, { recursive: true });

async function downloadFile(url, targetPath) {
    try {
        const response = await axios.get(url, { responseType: 'stream', timeout: 7000 });
        const writer = fs.createWriteStream(targetPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (e) { return false; }
}

async function getAudioOptions(movieTitle) {
    try {
        const searchUrl = `https://www.myinstants.com/search/?name=${encodeURIComponent(movieTitle)}`;
        const { data } = await axios.get(searchUrl);
        const $ = cheerio.load(data);
        const links = [];
        $('.instant .small-button').each((i, el) => {
            if (i < 5) {
                const onclick = $(el).attr('onclick');
                const match = onclick?.match(/'([^']+)'/);
                if (match) links.push(`https://www.myinstants.com/media/sounds/${match[1]}`);
            }
        });
        return links;
    } catch (e) { return []; }
}

async function buildMassiveReviewDatabase() {
    console.log("--- מתחיל סריקה עמוקה של 50 דפים (5 אופציות לכל סרט) ---");
    let successCount = 0;

    for (let page = 1; page <= 50; page++) {
        try {
            const res = await axios.get(`https://api.themoviedb.org/3/discover/movie`, {
                params: {
                    api_key: API_KEY,
                    language: 'en-US',
                    sort_by: 'vote_average.desc',
                    'vote_count.gte': 800,
                    'primary_release_date.gte': `${START_YEAR}-01-01`,
                    with_original_language: 'en',
                    page: page
                }
            });

            for (const m of res.data.results) {
                const releaseYear = parseInt(m.release_date?.split('-')[0]) || 0;
                const isAnimation = m.genre_ids.includes(ANIMATION_GENRE_ID);
                
                // בדיקת פרטים נוספים (מדינה ואולפנים)
                const movieDetails = await axios.get(`https://api.themoviedb.org/3/movie/${m.id}`, {
                    params: { api_key: API_KEY }
                });
                
                const data = movieDetails.data;
                const countries = data.production_countries.map(c => c.iso_3166_1);
                const studios = data.production_companies.map(c => c.id);

                if (!countries.some(c => ALLOWED_COUNTRIES.includes(c))) continue;
                if (isAnimation && !studios.some(id => ALLOWED_STUDIOS.includes(id))) continue;

                const movieFolder = path.join(baseDir, m.title.replace(/[^a-z0-9]/gi, '_'));
                if (!fs.existsSync(movieFolder)) fs.mkdirSync(movieFolder);

                console.log(`\n🎬 [${++successCount}] מעבד: ${m.title} (${releaseYear})`);

                // הורדת 5 תמונות
                const backdrops = (data.images?.backdrops || []).slice(0, 5);
                // אם אין תמונות בפרטים, ננסה להביא מה-API הייעודי לתמונות
                if (backdrops.length === 0) {
                    const imgRes = await axios.get(`https://api.themoviedb.org/3/movie/${m.id}/images`, { params: { api_key: API_KEY } });
                    const extraBackdrops = imgRes.data.backdrops.slice(0, 5);
                    for (let i = 0; i < extraBackdrops.length; i++) {
                        await downloadFile(`https://image.tmdb.org/t/p/w780${extraBackdrops[i].file_path}`, path.join(movieFolder, `image_${i + 1}.jpg`));
                    }
                }

                // הורדת 5 קבצי קול
                const audioLinks = await getAudioOptions(m.title);
                for (let i = 0; i < audioLinks.length; i++) {
                    await downloadFile(audioLinks[i], path.join(movieFolder, `audio_${i + 1}.mp3`));
                }
            }
            console.log(`--- דף ${page}/50 נסרק ---`);
        } catch (err) {
            console.error(`שגיאה בדף ${page}`);
        }
    }
    console.log("\n--- הסתיים! המאגר מוכן בתיקיית assets/review_folder ---");
}

buildMassiveReviewDatabase();