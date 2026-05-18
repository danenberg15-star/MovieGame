// filter-movies-by-criteria.js
const fs = require('fs');
const path = require('path');

// Target directors (English names as they appear in TMDB)
const TARGET_DIRECTORS = [
  'Steven Spielberg',
  'Christopher Nolan',
  'Robert Altman',
  'Rob Reiner',
  'Robert Zemeckis',
  'Martin Scorsese',
  'Woody Allen',
  'Ron Howard',
  'James Cameron',
  'Clint Eastwood',
  'Guy Ritchie',
  'Francis Ford Coppola'
];

// Target actors/actresses
const TARGET_ACTORS = [
  'Leonardo DiCaprio',
  'Robert De Niro',
  'Al Pacino',
  'Mel Gibson',
  'Matt Damon',
  'Ben Affleck',
  'Matthew McConaughey',
  'George Clooney',
  'Brad Pitt',
  'Tom Hanks',
  'Tom Hardy',
  'Edward Norton',
  'Bruce Willis',
  'Richard Gere',
  'Ben Stiller',
  'Julia Roberts',
  'Helen Mirren',
  'Jodie Foster',
  'Cameron Diaz',
  'Sylvester Stallone',
  'Arnold Schwarzenegger',
  'Jason Statham',
  'Denzel Washington',
  'Keanu Reeves',
  'Gwyneth Paltrow',
  'Eddie Murphy',
  'Chris Tucker',
  'John Travolta',
  'Nicole Kidman',
  'Meryl Streep',
  'Jennifer Lawrence',
  'Michelle Pfeiffer'
];

// Target Oscar categories (last 40 years: 1985-2025)
const TARGET_OSCAR_TYPES = [
  'Best Picture',
  'Best Original Screenplay',
  'Best Adapted Screenplay',
  'Best Original Score',
  'Best Original Song'
];

const MIN_YEAR = 1985;

// Normalize name for comparison
function normalizeName(name) {
  if (!name) return '';
  return name.toLowerCase().trim().replace(/[.\s]+/g, ' ');
}

// Check if director matches
function hasTargetDirector(movie) {
  if (!movie.director || !movie.director.name || !movie.director.name.en) {
    return false;
  }
  
  const directorName = normalizeName(movie.director.name.en);
  
  return TARGET_DIRECTORS.some(target => {
    const targetNorm = normalizeName(target);
    return directorName === targetNorm;
  });
}

// Check if actor matches
function hasTargetActor(movie) {
  if (!movie.cast || !Array.isArray(movie.cast)) {
    return false;
  }
  
  for (const actor of movie.cast) {
    if (!actor.name || !actor.name.en) continue;
    
    const actorName = normalizeName(actor.name.en);
    
    const matches = TARGET_ACTORS.some(target => {
      const targetNorm = normalizeName(target);
      return actorName === targetNorm;
    });
    
    if (matches) return true;
  }
  
  return false;
}

// Check if has target Oscar
function hasTargetOscar(movie) {
  if (!movie.oscars || !Array.isArray(movie.oscars) || movie.oscars.length === 0) {
    return false;
  }
  
  if (!movie.year || movie.year < MIN_YEAR) {
    return false;
  }
  
  for (const oscar of movie.oscars) {
    if (!oscar.type || !oscar.type.en) continue;
    
    const oscarType = oscar.type.en;
    
    const matches = TARGET_OSCAR_TYPES.some(target => 
      oscarType.toLowerCase().includes(target.toLowerCase()) ||
      target.toLowerCase().includes(oscarType.toLowerCase())
    );
    
    if (matches) return true;
  }
  
  return false;
}

// Main function
async function filterMovies() {
  console.log('🎬 Starting movie filter...\n');
  
  // Read movies index
  const indexPath = path.join(__dirname, 'public', 'assets', 'movies', 'movies-index.json');
  const indexData = JSON.parse(fs.readFileSync(indexPath, 'utf8'));
  
  console.log(`📂 Total movies in index: ${indexData.movies.length}\n`);
  
  const filteredMovies = [];
  const matchReasons = {};
  
  // Process each movie
  for (const movieRef of indexData.movies) {
    const movieDataPath = path.join(__dirname, 'public', 'assets', 'movies', movieRef.id, 'data.json');
    
    if (!fs.existsSync(movieDataPath)) {
      console.log(`⚠️  Missing data for ${movieRef.id}`);
      continue;
    }
    
    const movieData = JSON.parse(fs.readFileSync(movieDataPath, 'utf8'));
    
    const reasons = [];
    
    // Check director
    if (hasTargetDirector(movieData)) {
      reasons.push(`Director: ${movieData.director.name.en}`);
    }
    
    // Check actors
    if (hasTargetActor(movieData)) {
      const matchingActors = movieData.cast
        .filter(actor => {
          const actorName = normalizeName(actor.name.en);
          return TARGET_ACTORS.some(target => normalizeName(target) === actorName);
        })
        .map(actor => actor.name.en);
      
      reasons.push(`Actor(s): ${matchingActors.join(', ')}`);
    }
    
    // Check Oscars
    if (hasTargetOscar(movieData)) {
      const matchingOscars = movieData.oscars
        .filter(oscar => {
          return TARGET_OSCAR_TYPES.some(target => 
            oscar.type.en.toLowerCase().includes(target.toLowerCase())
          );
        })
        .map(oscar => oscar.type.en);
      
      reasons.push(`Oscar(s): ${matchingOscars.join(', ')}`);
    }
    
    // If matches any criteria, add to filtered list
    if (reasons.length > 0) {
      filteredMovies.push(movieRef);
      matchReasons[movieRef.id] = reasons;
      
      console.log(`✅ ${movieData.title.en} (${movieData.year})`);
      reasons.forEach(reason => console.log(`   - ${reason}`));
    }
  }
  
  console.log(`\n📊 Filtered movies: ${filteredMovies.length} / ${indexData.movies.length}`);
  
  // Create new filtered index
  const filteredIndex = {
    total: filteredMovies.length,
    movies: filteredMovies,
    filters_applied: {
      directors: TARGET_DIRECTORS,
      actors: TARGET_ACTORS,
      oscar_categories: TARGET_OSCAR_TYPES,
      oscar_min_year: MIN_YEAR
    },
    match_reasons: matchReasons
  };
  
  // Save to new file
  const outputPath = path.join(__dirname, 'public', 'assets', 'movies', 'movies-index-filtered.json');
  fs.writeFileSync(outputPath, JSON.stringify(filteredIndex, null, 2));
  
  console.log(`\n💾 Saved to: ${outputPath}`);
  
  // Print summary
  console.log('\n📈 Summary:');
  console.log(`   Total movies: ${indexData.movies.length}`);
  console.log(`   Filtered movies: ${filteredMovies.length}`);
  console.log(`   Percentage: ${((filteredMovies.length / indexData.movies.length) * 100).toFixed(1)}%`);
}

// Run
filterMovies().catch(error => {
  console.error('❌ Error:', error);
  process.exit(1);
});