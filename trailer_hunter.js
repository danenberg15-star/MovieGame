const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yts = require('yt-search');

const baseDir = path.join(__dirname, 'assets', 'review_folder');
// נתיב ה-FFmpeg שלך
const FFMPEG_PATH = 'C:\\Users\\USER\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';

async function processMovie(folderName) {
    const movieTitle = folderName.replace(/_/g, ' ');
    const targetPath = path.join(baseDir, folderName, 'trailer_30s.mp3');

    if (fs.existsSync(targetPath)) return;

    try {
        console.log(`🔍 מחפש טריילר עבור: ${movieTitle}...`);
        const r = await yts(movieTitle + " official trailer");
        const video = r.videos[0];

        if (!video) {
            console.log(`❌ לא נמצא סרטון ל-${movieTitle}`);
            return;
        }

        console.log(`🚀 מוריד וחותך 30 שניות מיוטיוב (באמצעות yt-dlp)...`);

        // פקודה אחת שמורידה, חותכת והופכת ל-MP3
        // --postprocessor-args: אומר ל-ffmpeg לחתוך מהתחלה עד שנייה 30
        const command = `yt-dlp -x --audio-format mp3 --ffmpeg-location "${FFMPEG_PATH}" --postprocessor-args "-ss 00:00:00 -t 00:00:30" -o "${targetPath.replace('.mp3', '.%(ext)s')}" "${video.url}"`;

        execSync(command, { stdio: 'ignore' });
        
        console.log(`✅ הצלחה: ${movieTitle}`);

    } catch (error) {
        console.log(`❌ נכשל ב-${movieTitle}. ייתכן שצריך לעדכן את yt-dlp.`);
    }
}

async function startTrailerHunting() {
    if (!fs.existsSync(baseDir)) return;
    const folders = fs.readdirSync(baseDir).filter(f => fs.lstatSync(path.join(baseDir, f)).isDirectory());
    
    console.log(`--- מתחיל ציד טריילרים סופי (${folders.length} סרטים) ---`);

    for (const folder of folders) {
        await processMovie(folder);
    }
    
    console.log("\n--- הסתיים! ---");
}

startTrailerHunting();