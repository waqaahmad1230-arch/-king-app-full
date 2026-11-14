import { db } from '../src/firebase';
import { collection, getDocs, addDoc, Timestamp } from 'firebase/firestore';
import { top20TrendingGamePixGames } from '../src/data/trendingGamePixFeed';

async function main() {
  console.log('--- INSERTING TOP 20 TRENDING GAMEPIX GAMES (PROPERTY PN8G3) INTO FIRESTORE king_games (STATUS: PENDING) ---');
  
  const gamesCol = collection(db, 'king_games');
  const existingSnap = await getDocs(gamesCol);
  
  const existingUrls = new Set<string>();
  const existingTitles = new Set<string>();
  
  existingSnap.forEach(d => {
    const data = d.data();
    if (data.url) existingUrls.add(data.url.trim().toLowerCase());
    if (data.link) existingUrls.add(data.link.trim().toLowerCase());
    if (data.title) existingTitles.add(data.title.trim().toLowerCase());
  });
  
  let inserted = 0;
  let skipped = 0;

  for (const game of top20TrendingGamePixGames) {
    const normUrl = game.url.trim().toLowerCase();
    const normTitle = game.title.trim().toLowerCase();
    
    // Check if already in Firestore
    if (existingUrls.has(normUrl) || existingTitles.has(normTitle)) {
      console.log(`Skipping already existing game: ${game.title}`);
      skipped++;
      continue;
    }

    const payload = {
      title: game.title,
      name: game.title,
      category: game.category,
      source: 'GamePix (PN8G3)',
      url: game.url,
      link: game.url,
      thumbnail: game.thumbnail,
      image: game.thumbnail,
      description: game.description,
      rating: game.rating,
      plays: game.plays,
      status: 'pending',
      approved: false,
      isApproved: false,
      featuredOnHome: false,
      discoveredAt: new Date().toISOString(),
      createdAt: Timestamp.now(),
    };

    const docRef = await addDoc(gamesCol, payload);
    console.log(`[+] Added ${game.title} (ID: ${docRef.id}) -> status: pending`);
    existingUrls.add(normUrl);
    existingTitles.add(normTitle);
    inserted++;
  }

  console.log(`\nDONE! Inserted: ${inserted}, Skipped: ${skipped}, Total Checked: ${top20TrendingGamePixGames.length}`);
  process.exit(0);
}

main().catch(err => {
  console.error('Fatal error populating games:', err);
  process.exit(1);
});
