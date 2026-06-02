// Trailer URLs: production serves /assets/movies/.../trailer.mp4 from Vercel
// (deployed via `vercel --prod`, includes gitignored MP4s via .vercelignore).

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

  return vercelTrailerPath(movieId);
}

/** @deprecated Kept for scripts; app uses vercelTrailerPath only. */
export function firebaseTrailerUrl(movieId) {
  return vercelTrailerPath(movieId);
}
