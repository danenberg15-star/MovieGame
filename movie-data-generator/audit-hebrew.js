// Quick audit of Hebrew coverage in movies-clean.json
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '..');
const SRC = path.join(REPO_ROOT, 'src', 'data', 'movies-clean.json');

const isLatin = (s) =>
  typeof s === 'string' &&
  /^[\x00-\x7F\s\d:,''.!?()\-–—&\/]+$/.test(s) &&
  /[A-Za-z]/.test(s);

const movies = JSON.parse(fs.readFileSync(SRC, 'utf8')).movies;
const titleLatin = movies.filter((m) => isLatin(m.title?.he));
let latinDecoys = 0;
let cleanMovies = 0;
const worst = [];
for (const m of movies) {
  const dhe = m.decoy_answers?.he || [];
  const n = dhe.filter(isLatin).length;
  latinDecoys += n;
  if (n === 0) cleanMovies++;
  else worst.push({ id: m.id, he: m.title.he, n, samples: dhe.filter(isLatin).slice(0, 3) });
}
worst.sort((a, b) => b.n - a.n);
console.log('Total movies:', movies.length);
console.log('title.he that look English:', titleLatin.length);
console.log('Total English decoys in decoy_answers.he:', latinDecoys);
console.log('Movies with 100% Hebrew decoys:', cleanMovies, `/ ${movies.length}`);
console.log('Worst offenders:', worst.slice(0, 5));
