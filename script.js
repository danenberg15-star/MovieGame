const movieData = {
    "movies": [
      {
        "title": "טיטאניק",
        "release_year": 1997,
        "director": "ג'יימס קמרון",
        "poster_url": "https://picsum.photos/seed/titanic/250/350"
      },
      {
        "title": "התחלה",
        "release_year": 2010,
        "director": "כריסטופר נולאן",
        "poster_url": "https://picsum.photos/seed/inception/250/350"
      },
      {
        "title": "גלדיאטור",
        "release_year": 2000,
        "director": "רידלי סקוט",
        "poster_url": "https://picsum.photos/seed/gladiator/250/350"
      }
    ]
};

const container = document.getElementById('movies-container');
if (container) {
    container.innerHTML = ''; 

    movieData.movies.forEach(movie => {
        const div = document.createElement('div');
        div.className = 'card';
        div.innerHTML = `
            <img src="${movie.poster_url}" class="poster" style="width:100%; border-radius:8px; background:#333;">
            <h2>${movie.title} (${movie.release_year})</h2>
            <p><strong>במאי:</strong> ${movie.director}</p>
        `;
        container.appendChild(div);
    });
}