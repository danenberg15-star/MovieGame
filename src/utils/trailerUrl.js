// Trailer URLs: Vercel ships movie_001–movie_599; newer files are gitignored (~800MB).
// Upload those to Firebase Storage (see movie-data-generator/upload-trailers-to-storage.js).

const STORAGE_BUCKET = 'moviezguess.firebasestorage.app';

/** Last movie id whose trailer.mp4 is on the Vercel static deploy. */
const LAST_VERCEL_TRAILER_NUM = 599;

export function firebaseTrailerUrl(movieId) {
  if (!movieId) return '';
  const objectPath = `trailers/${movieId}/trailer.mp4`;
  const encoded = encodeURIComponent(objectPath);
  return `https://firebasestorage.googleapis.com/v0/b/${STORAGE_BUCKET}/o/${encoded}?alt=media`;
}

function movieNumber(movieId) {
  const match = String(movieId || '').match(/movie_(\d+)/i);
  return match ? parseInt(match[1], 10) : 0;
}

function isLocalDevHost() {
  if (typeof window === 'undefined') return false;
  const host = window.location.hostname;
  return host === 'localhost' || host === '127.0.0.1';
}

function vercelTrailerPath(movieId) {
  return `/assets/movies/${movieId}/trailer.mp4`;
}

/**
 * @param {string | { id?: string, trailer?: string }} movieOrId
 */
export function getTrailerUrl(movieOrId) {
  const movie = typeof movieOrId === 'string' ? { id: movieOrId } : movieOrId;
  const movieId = movie?.id;
  const trailer = movie?.trailer;

  if (trailer?.startsWith('https://')) {
    return trailer;
  }

  if (!movieId) return '';

  if (isLocalDevHost()) {
    return vercelTrailerPath(movieId);
  }

  const num = movieNumber(movieId);
  if (num > 0 && num <= LAST_VERCEL_TRAILER_NUM) {
    return vercelTrailerPath(movieId);
  }

  return firebaseTrailerUrl(movieId);
}
