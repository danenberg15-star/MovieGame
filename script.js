fetch('movies_db.json')
    .then(res => res.json())
    .then(data => {
        const container = document.getElementById('movies-container');
        if (!container) return;

        container.innerHTML = data.map(movie => `
            <div class="card" style="margin-bottom:30px; background:#222; color:white; padding:15px; border-radius:12px;">
                <img src="${movie.image}" style="width:100%; border-radius:8px; aspect-ratio: 16/9; object-fit: cover; background:#333;">
                <h2 style="margin:10px 0;">${movie.title} (${movie.year})</h2>
                <audio controls style="width:100%; filter: invert(1);">
                    <source src="${movie.audio}" type="audio/mpeg">
                </audio>
            </div>
        `).join('');
    })
    .catch(err => console.error("Database not found. Run build_db.js first."));