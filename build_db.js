const fs = require('fs');
const axios = require('axios');
const path = require('path');
const cheerio = require('cheerio');

const API_KEY = "0c5eb1c3ddee8977d991539ff01c66d0";
const baseDir = path.join(__dirname, 'assets', 'review_folder');

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
                const match = onclick.match(/'([^']+)'/);
                if (match) links.push(`https://www.myinstants.com/media/sounds/${match[1]}`);
            }
        });
        return links;
    } catch (e) { return []; }
}

async function buildReviewDatabase() {
    console.log("--- מתחיל איסוף מורחב (5 אופציות לכל סרט) ---");
    
    try {
        const res = await axios.get(`https://api.themoviedb.org/3/discover/movie`, {
            params: {
                api_key: API_KEY,
                language: 'en-US',
                sort_by: 'vote_average.desc',
                'vote_count.gte': 1000,
                'primary_release_date.gte': '1976-01-01',
                with_original_language: 'en',
                page: 1 // לצורך הבדיקה נתחיל בדף הראשון
            }
        });

        for (const m of res.data.results) {
            const movieFolder = path.join(baseDir, m.title.replace(/[^a-z0-9]/gi, '_'));
            if (!fs.existsSync(movieFolder)) fs.mkdirSync(movieFolder);

            console.log(`\n🎬 מעבד: ${m.title}`);

            // 1. הורדת 5 תמונות
            const imgRes = await axios.get(`https://api.themoviedb.org/3/movie/${m.id}/images`, {
                params: { api_key: API_KEY }
            });
            const backdrops = imgRes.data.backdrops.slice(0, 5);
            for (let i = 0; i < backdrops.length; i++) {
                const imgUrl = `https://image.tmdb.org/t/p/w780${backdrops[i].file_path}`;
                await downloadFile(imgUrl, path.join(movieFolder, `image_${i + 1}.jpg`));
            }
            console.log(`   🖼️  הורדו ${backdrops.length} תמונות`);

            // 2. הורדת 5 קבצי קול
            const audioLinks = await getAudioOptions(m.title);
            for (let i = 0; i < audioLinks.length; i++) {
                await downloadFile(audioLinks[i], path.join(movieFolder, `audio_${i + 1}.mp3`));
            }
            console.log(`   🎵 הורדו ${audioLinks.length} קבצי קול`);
        }
    } catch (err) {
        console.error("שגיאה:", err.message);
    }
    console.log("\n--- הסתיים! בדוק את תיקיית assets/review_folder ---");
}

buildReviewDatabase();