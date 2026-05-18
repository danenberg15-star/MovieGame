const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const baseDir = path.join(__dirname, 'assets', 'review_folder');
const outputDir = path.join(__dirname, 'all_ready_trailers');

// הנתיב המדויק של ה-FFmpeg שלך במחשב
const FFMPEG_PATH = 'C:\\Users\\USER\\AppData\\Local\\Microsoft\\WinGet\\Packages\\Gyan.FFmpeg_Microsoft.Winget.Source_8wekyb3d8bbwe\\ffmpeg-8.1.1-full_build\\bin\\ffmpeg.exe';

function calculateSmartStartTime(jsonPath) {
    try {
        const rawData = fs.readFileSync(jsonPath, 'utf8');
        const jsonData = JSON.parse(rawData);
        
        const videoDuration = jsonData.duration || 120; 
        
        if (!jsonData.heatmap || !Array.isArray(jsonData.heatmap) || jsonData.heatmap.length === 0) {
            console.log(`ℹ️ לא נמצאו נתוני Heatmap, משתמש בדילוג פתיח בסיסי (שנייה 10).`);
            return 10;
        }

        let highestValue = -1;
        let peakTime = 10;

        jsonData.heatmap.forEach(point => {
            if (point.value > highestValue) {
                highestValue = point.value;
                peakTime = point.start_time || 0;
            }
        });

        console.log(`📊 נתוני גרף: אורך טריילר כולל: ${videoDuration} שניות | נקודת שיא צפייה: שנייה ${peakTime.toFixed(1)}`);

        let calculatedStart = 10;

        if (peakTime <= 20) {
            console.log(`⚠️ הפיק נמצא בפתיח האולפנים. מתחיל אוטומטית משנייה 10.`);
            calculatedStart = 10;
        } else {
            calculatedStart = peakTime - 7;
            console.log(`🎯 החלת מרכז כובד: זזים 7 שניות אחורה מהפיק לשנייה ${calculatedStart.toFixed(1)}`);
        }

        if (calculatedStart + 15 > videoDuration) {
            calculatedStart = videoDuration - 15;
            console.log(`🚨 אזהרת סוף וידאו! אין מספיק זמן לחיתוך. מתקן לנקודה קבועה: שנייה ${calculatedStart.toFixed(1)} (15 שניות מהסוף).`);
        }

        return Math.max(0, calculatedStart);

    } catch (error) {
        console.log(`⚠️ שגיאה בקריאת ה-JSON, משתמש בברירת מחדל קבועה (שנייה 10).`);
        return 10;
    }
}

async function processLocalEdit(folderName) {
    const movieTitle = folderName.replace(/_/g, ' ');
    
    const jsonPath = path.join(baseDir, folderName, `${folderName}.info.json`);
    const targetTrailerPath = path.join(outputDir, `${folderName}.mp4`);

    // אם הטריילר החתוך כבר קיים בתיקייה המרכזית, מדלגים מיד
    if (fs.existsSync(targetTrailerPath)) {
        console.log(`⏩ [דילוג] הטריילר החתוך כבר קיים בתיקייה המרכזית עבור: ${movieTitle}`);
        return;
    }

    // בדיקה דינמית של פורמט קובץ המקור (mp4 או webm)
    let fullVideoPath = path.join(baseDir, folderName, `${folderName}.mp4`);
    if (!fs.existsSync(fullVideoPath)) {
        fullVideoPath = path.join(baseDir, folderName, `${folderName}.webm`);
    }

    // אם אף אחד מהפורמטים לא קיים, סימן שההורדה שלו עוד לא הסתיימה
    if (!fs.existsSync(fullVideoPath)) {
        console.log(`⏩ [דילוג] לא נמצא וידאו מלא (mp4/webm) עבור: ${movieTitle}`);
        return;
    }

    try {
        console.log(`\n🎬 עורך מקומית: ${movieTitle}`);
        
        const startTime = calculateSmartStartTime(jsonPath);
        const formattedStartTime = new Date(startTime * 1000).toISOString().substr(11, 8);

        console.log(`✂️ חותך 15 שניות מדויקות החל משנייה ${startTime.toFixed(1)} (${formattedStartTime})...`);

        // ביצוע החיתוך (FFmpeg ימיר אוטומטית מ-webm ל-mp4 במידת הצורך)
        const cutCommand = `"${FFMPEG_PATH}" -y -ss ${formattedStartTime} -t 00:00:15 -i "${fullVideoPath}" -c:v libx264 -c:a aac "${targetTrailerPath}"`;
        execSync(cutCommand, { stdio: 'ignore' });

        console.log(`✅ הצלחה: הטריילר הדינמי מוכן ושמור בתיקייה המרכזית.`);

    } catch (error) {
        console.log(`❌ נכשל בעיבוד של ${movieTitle}: ${error.message}`);
    }
}

async function startSmartEditing() {
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    if (!fs.existsSync(baseDir)) return;
    const folders = fs.readdirSync(baseDir).filter(f => fs.lstatSync(path.join(baseDir, f)).isDirectory());
    
    console.log(`--- מתחיל עריכה חכמה ותומכת פורמטים על ${folders.length} סרטים ---`);

    for (const folder of folders) {
        await processLocalEdit(folder);
    }
    
    console.log(`\n--- סבב העריכה הסתיים! בדוק את התיקייה: ${outputDir} ---`);
}

startSmartEditing();