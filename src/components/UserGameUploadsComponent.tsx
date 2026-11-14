import React, { useState, useEffect } from 'react';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Loader2, Check, XCircle, ExternalLink } from 'lucide-react';

export function UserGameUploadsComponent({ showToast }: { showToast: (msg: string) => void }) {
  const [uploads, setUploads] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      setUploads([]);
      setLoading(false);
      return;
    }

    const isAdmin = currentUser.email === 'waqaahmad1230@gmail.com';
    const q = isAdmin
      ? query(collection(db, 'user_uploaded_games'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'user_uploaded_games'), where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach(doc => list.push({ id: doc.id, ...doc.data() }));
        setUploads(list);
        setLoading(false);
      },
      (err) => {
        console.warn('[UserGameUploads] Snapshot notice:', err);
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const handleAction = async (game: any, action: 'approved' | 'rejected') => {
    try {
      const docRef = doc(db, 'user_uploaded_games', game.id);
      await updateDoc(docRef, { status: action });

      if (action === 'approved') {
        await addDoc(collection(db, 'king_games'), {
          ...game,
          status: 'approved',
          isUserGame: true,
          approvedAt: serverTimestamp(),
          admobEnabled: true,
          // Map fields for king_games
          link: game.gameUrl,
          thumbnail: game.thumbnailUrl,
          category: game.category,
        });
      }

      await addDoc(collection(db, 'user_notifications'), {
        userId: game.userId,
        title: action === 'approved' ? 'Game Approved!' : 'Game Rejected',
        message: action === 'approved' ? `Your game ${game.title} is now live!` : 'Your game was rejected. Check rules.',
        type: 'game_status_update',
        gameId: game.id,
        read: false,
        createdAt: serverTimestamp(),
      });

      showToast(`Game ${action} successfully!`);
    } catch (err) {
      console.error(err);
      showToast('Action failed.');
    }
  };

  if (loading) return <div className="p-4 text-white">Loading...</div>;

  const counts = uploads.reduce((acc, g) => {
    acc[g.status as string] = (acc[g.status as string] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="w-full p-4 bg-[#070c17] border border-emerald-500/30 rounded-2xl space-y-4 overflow-x-auto">
      <h3 className="text-lg font-black text-emerald-400">User Game Uploads</h3>
      <div className="flex gap-4 text-xs text-zinc-400">
        <span className="text-amber-400">Pending: {counts.pending || 0}</span>
        <span className="text-emerald-400">Approved: {counts.approved || 0}</span>
        <span className="text-red-400">Rejected: {counts.rejected || 0}</span>
      </div>
      <table className="w-full text-left text-xs text-white">
        <thead className="text-zinc-500 uppercase border-b border-zinc-800">
          <tr>
            <th className="p-2">Game</th>
            <th className="p-2">User Email</th>
            <th className="p-2">Category</th>
            <th className="p-2">Status</th>
            <th className="p-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {uploads.map(g => (
            <tr key={g.id} className="border-b border-zinc-800">
              <td className="p-2 flex items-center gap-2">
                <img src={g.thumbnailUrl} className="w-10 h-10 rounded-lg" />
                <span className="font-bold">{g.title}</span>
              </td>
              <td className="p-2">{g.userEmail}</td>
              <td className="p-2">{g.category}</td>
              <td className="p-2">
                <span className={`px-2 py-1 rounded ${g.status === 'pending' ? 'bg-amber-900 text-amber-200' : g.status === 'approved' ? 'bg-emerald-900 text-emerald-200' : 'bg-red-900 text-red-200'}`}>
                  {g.status}
                </span>
              </td>
              <td className="p-2">
                {g.status === 'pending' && (
                  <div className="flex gap-2">
                    <button onClick={() => handleAction(g, 'approved')} className="p-2 bg-green-600 rounded-lg hover:bg-green-500"><Check className="w-4 h-4"/></button>
                    <button onClick={() => handleAction(g, 'rejected')} className="p-2 bg-red-600 rounded-lg hover:bg-red-500"><XCircle className="w-4 h-4"/></button>
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
