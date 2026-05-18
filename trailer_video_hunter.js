const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const yts = require('yt-search');

const baseDir = path.join(__dirname, 'assets', 'review_folder');

// הנתיב המדויק של ה-FFmpeg שלך במחשב
const FFMPEG_PATH = 'C:\\Users\\USER\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';

async function downloadFullTrailerAndMetadata(folderName) {
    const movieTitle = folderName.replace(/_/g, ' ');
    
    // הגדרת נתיבי הקבצים לפי שם התיקייה (שם הסרט)
    const videoTargetPath = path.join(baseDir, folderName, `${folderName}.mp4`);
    const jsonTargetPath = path.join(baseDir, folderName, `${folderName}.info.json`);

    // אם שני הקבצים כבר קיימים, מדלגים כדי לחסוך זמן
    if (fs.existsSync(videoTargetPath) && fs.existsSync(jsonTargetPath)) {
        console.log(`⏩ כבר קיימים חומרי גלם עבור: ${movieTitle}`);
        return;
    }

    try {
        console.log(`\n🔍 מחפש טריילר עבור: ${movieTitle}...`);
        const r = await yts(movieTitle + " official trailer");
        const video = r.videos[0];

        if (!video) {
            console.log(`❌ לא נמצא סרטון ביוטיוב ל-${movieTitle}`);
            return;
        }

        console.log(`📥 מוריד טריילר מלא (480p) + נתוני Heatmap ומטא-דאטה...`);
        
        // פקודת yt-dlp שמורידה את הוידאו המלא ב-480p ומייצרת קובץ info.json עם ה-Heatmap
        // --write-info-json: אומר לו לשמור את כל נתוני הווידאו כולל גרף הצפיות
        const command = `yt-dlp -f "bv*[height<=480]+ba/b[height<=480]" --write-info-json --ffmpeg-location "${FFMPEG_PATH}" -o "${baseDir}\\${folderName}\\${folderName}.%(ext)s" "${video.url}"`;
        
        execSync(command, { stdio: 'inherit' });

        console.log(`✅ הצלחה: חומרי הגלם נשמרו עבור ${movieTitle}`);

    } catch (error) {
        console.log(`❌ נכשל בהורדת חומרי הגלם של ${movieTitle}`);
    }
}

async function startDataCollection() {
    if (!fs.existsSync(baseDir)) {
        console.error("❌ תיקיית review_folder לא נמצאה!");
        return;
    }

    const folders = fs.readdirSync(baseDir).filter(f => fs.lstatSync(path.join(baseDir, f)).isDirectory());
    console.log(`--- מתחיל איסוף חומרי גלם מלאים עבור ${folders.length} סרטים ---`);

    for (const folder of folders) {
        await downloadFullTrailerAndMetadata(folder);
    }
    
    console.log("\n--- שלב איסוף המידע הסתיים בהצלחה! כל הקבצים מוכנים על המחשב ---");
}

startDataCollection();