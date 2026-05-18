const fs = require('fs');
const axios = require('axios');
const path = require('path');
const cheerio = require('cheerio');

const baseDir = path.join(__dirname, 'assets', 'review_folder');

// הגדרות דפדפן למניעת חסימות
const axiosConfig = {
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    },
    timeout: 10000
};

async function downloadFile(url, targetPath) {
    try {
        const response = await axios.get(url, { ...axiosConfig, responseType: 'stream' });
        const writer = fs.createWriteStream(targetPath);
        response.data.pipe(writer);
        return new Promise((resolve, reject) => {
            writer.on('finish', resolve);
            writer.on('error', reject);
        });
    } catch (e) { return false; }
}

// מקור 1: Myinstants
async function getMyinstantsAudio(movieTitle) {
    try {
        const searchUrl = `https://www.myinstants.com/search/?name=${encodeURIComponent(movieTitle)}`;
        const { data } = await axios.get(searchUrl, axiosConfig);
        const $ = cheerio.load(data);
        const links = [];
        $('.instant .small-button').each((i, el) => {
            if (i < 5) {
                const onclick = $(el).attr('onclick');
                const match = onclick?.match(/\((['"])(.*?)\1/);
                if (match && match[2]) {
                    const cleanPath = match[2].replace('/media/sounds/', '');
                    links.push(`https://www.myinstants.com/media/sounds/${cleanPath}`);
                }
            }
        });
        return links;
    } catch (e) { return []; }
}

// מקור 2: Soundboard (מקור חלופי יציב לציטוטים)
async function getSoundboardAudio(movieTitle) {
    try {
        const searchUrl = `https://www.soundboard.com/search?q=${encodeURIComponent(movieTitle)}`;
        const { data } = await axios.get(searchUrl, axiosConfig);
        const $ = cheerio.load(data);
        const links = [];
        // כאן אנחנו מחפשים קישורים שמסתיימים ב-mp3 או דפים עם כפתורי השמעה
        $('a[href*=".mp3"]').each((i, el) => {
            if (i < 3) links.push($(el).attr('href'));
        });
        return links;
    } catch (e) { return []; }
}

async function startAudioHunting() {
    if (!fs.existsSync(baseDir)) {
        console.error("❌ תיקיית review_folder לא נמצאה!");
        return;
    }

    const folders = fs.readdirSync(baseDir).filter(f => fs.lstatSync(path.join(baseDir, f)).isDirectory());
    console.log(`--- מתחיל ציד אודיו עבור ${folders.length} תיקיות סרטים ---`);

    for (const folder of folders) {
        const movieTitle = folder.replace(/_/g, ' ');
        const moviePath = path.join(baseDir, folder);
        
        console.log(`\n🔊 מחפש סאונד עבור: ${movieTitle}`);

        // איסוף מכל המקורות
        const source1 = await getMyinstantsAudio(movieTitle);
        const source2 = await getSoundboardAudio(movieTitle);
        const allLinks = [...source1, ...source2].slice(0, 8); // מקסימום 8 אופציות סה"כ

        if (allLinks.length === 0) {
            console.log(`   ⚠️  לא נמצאו תוצאות אודיו.`);
            continue;
        }

        for (let i = 0; i < allLinks.length; i++) {
            const fileName = `audio_option_${i + 1}.mp3`;
            const targetPath = path.join(moviePath, fileName);
            
            // בודק אם הקובץ כבר קיים כדי לא להוריד סתם
            if (fs.existsSync(targetPath)) continue;

            const success = await downloadFile(allLinks[i], targetPath);
            if (success) {
                console.log(`   ✅ הורד: ${fileName}`);
            }
        }
    }
    console.log("\n--- הסתיים ציד האודיו! ---");
}

startAudioHunting();