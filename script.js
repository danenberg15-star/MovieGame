const movieData = {
    "movies": [
      {
        "title": "טיטאניק",
        "release_year": 1997,
        "director": "ג'יימס קמרון",
        "poster_url": "https://upload.wikimedia.org/wikipedia/he/thumb/2/22/Titanic_poster.jpg/250px-Titanic_poster.jpg",
        "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
      },
      {
        "title": "התחלה",
        "release_year": 2010,
        "director": "כריסטופר נולאן",
        "poster_url": "https://upload.wikimedia.org/wikipedia/he/thumb/2/2e/Inception_Poster.jpg/250px-Inception_Poster.jpg",
        "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3"
      },
      {
        "title": "גלדיאטור",
        "release_year": 2000,
        "director": "רידלי סקוט",
        "poster_url": "https://upload.wikimedia.org/wikipedia/he/thumb/4/44/Gladiator_Poster.jpg/250px-Gladiator_Poster.jpg",
        "audio_url": "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3"
      }
    ]
};

const container = document.getElementById('movies-container');
container.innerHTML = ''; 

movieData.movies.forEach(movie => {
    const div = document.createElement('div');
    div.className = 'card';
    div.innerHTML = `
        <img src="${movie.poster_url}" class="poster" style="width:100%; border-radius:8px;" onerror="this.src='https://via.placeholder.com/250x350?text=Check+Internet'">
        <h2>${movie.title} (${movie.release_year})</h2>
        <p><strong>במאי:</strong> ${movie.director}</p>
        <audio controls><source src="${movie.audio_url}" type="audio/mpeg"></audio>
    `;
    container.appendChild(div);
});