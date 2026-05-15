fetch('movies.json')
    .then(response => response.json())
    .then(data => {
        const container = document.getElementById('movies-container');
        container.innerHTML = ''; // מנקה את המכולה לפני הטעינה
        data.movies.forEach(movie => {
            const div = document.createElement('div');
            div.className = 'card';
            div.innerHTML = `
                <img src="${movie.poster_url}" class="poster" alt="${movie.title}">
                <h2>${movie.title} (${movie.release_year})</h2>
                <p><strong>במאי:</strong> ${movie.director}</p>
                <audio controls><source src="${movie.audio_url}" type="audio/mpeg"></audio>
            `;
            container.appendChild(div);
        });
    })
    .catch(error => {
        console.error('Error fetching movies:', error);
        document.getElementById('movies-container').innerHTML = '<p style="color:red;">שגיאה בטעינת הנתונים.</p>';
    });