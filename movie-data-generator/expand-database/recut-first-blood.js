// Quick recut for First Blood only
import path from 'path';
import { recutMovieTrailer } from './lib/trailerPipeline.js';

const movie = {
  movieId: 'movie_911',
  tmdbId: 1368,
  title: 'First Blood',
};

console.log(`Recutting ${movie.title}...`);
await recutMovieTrailer(movie.movieId, movie.tmdbId, movie.title);
console.log('Done!');
