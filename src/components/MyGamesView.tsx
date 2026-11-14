import React, { useState, useEffect } from 'react';
import { ArrowLeft, Play, AlertCircle } from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { GamePlayer } from './GamePlayer';
import { generateUniqueFlappyHtml } from '../utils/gameGenerators';

interface MyGamesViewProps {
  onBack: () => void;
}

export default function MyGamesView({ onBack }: MyGamesViewProps) {
  const [games, setGames] = useState<any[]>([]);
  const [activeGame, setActiveGame] = useState<any | null>(null);

  useEffect(() => {
    if (!auth.currentUser) return;
    const q = query(collection(db, 'user_uploaded_games'), where('userId', '==', auth.currentUser.uid));
    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setGames(list);
      },
      (err) => {
        console.warn('[MyGamesView] Snapshot notice:', err);
      }
    );
    return () => unsubscribe();
  }, []);

  const handlePlay = (game: any) => {
    // Generate HTML locally using the config
    const html = generateUniqueFlappyHtml(game);
    setActiveGame({ ...game, html });
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#0f0f0f] text-white p-4 pb-20 overflow-y-auto">
      <div className="flex items-center gap-4 mb-6">
        <button onClick={onBack}><ArrowLeft /></button>
        <h1 className="text-xl font-black">My Games</h1>
      </div>
      
      {games.length === 0 ? (
        <div className="text-center py-20 text-zinc-500">No games uploaded yet.</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {games.map(game => (
            <div key={game.id} className="bg-zinc-900 p-4 rounded-xl">
              <h3 className="font-bold truncate">{game.title}</h3>
              <p className={`text-xs ${game.status === 'approved' ? 'text-green-400' : game.status === 'rejected' ? 'text-red-400' : 'text-amber-400'}`}>{game.status.toUpperCase()}</p>
              {game.status === 'approved' && (
                <button onClick={() => handlePlay(game)} className="mt-2 w-full bg-blue-600 p-2 rounded-lg font-bold flex items-center justify-center gap-2"><Play size={16}/> Play</button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeGame && (
        <GamePlayer 
          srcDoc={activeGame.html} 
          gameTitle={activeGame.title} 
          onClose={() => setActiveGame(null)} 
        />
      )}
    </div>
  );
}
