import React, { useState, useEffect } from 'react';
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  updateDoc,
  addDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Check, XCircle, Trash2 } from 'lucide-react';
import { AUTHORIZED_ADMIN_EMAIL } from '../services/centralContentService';

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

    const isAdmin = currentUser.email === AUTHORIZED_ADMIN_EMAIL;
    const q = isAdmin
      ? query(collection(db, 'user_uploaded_games'), orderBy('createdAt', 'desc'))
      : query(collection(db, 'user_uploaded_games'), where('userId', '==', currentUser.uid));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list: any[] = [];
        snapshot.forEach((docSnap) => list.push({ id: docSnap.id, ...docSnap.data() }));
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

  const handleAction = async (game: any, action: 'approved' | 'rejected' | 'unpublished') => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email !== AUTHORIZED_ADMIN_EMAIL) {
      showToast('Admin authorization required to moderate user games.');
      return;
    }

    try {
      const docRef = doc(db, 'user_uploaded_games', game.id);
      await updateDoc(docRef, { status: action });

      if (action === 'approved') {
        const resolvedUrl = (game.gameUrl || game.url || game.link || '').trim();
        const resolvedThumb = (game.thumbnailUrl || game.thumbnail || game.image || '').trim();
        await addDoc(collection(db, 'king_games'), {
          title: (game.title || 'User Submitted Game').trim(),
          name: (game.title || 'User Submitted Game').trim(),
          description: game.description || 'User submitted HTML5 game',
          url: resolvedUrl,
          link: resolvedUrl,
          thumbnail: resolvedThumb,
          image: resolvedThumb,
          category: game.category || 'Action',
          source: 'User Submission',
          status: 'approved',
          publicationStatus: 'published',
          approved: true,
          isApproved: true,
          published: true,
          isUserGame: true,
          sourceUploadId: game.id,
          submittedByUid: game.userId,
          approvedAt: serverTimestamp(),
          createdAt: new Date().toISOString(),
          rating: 4.8,
          plays: '1.0K Plays',
        });
      }

      if (game.userId) {
        await addDoc(collection(db, 'user_notifications'), {
          userId: game.userId,
          title:
            action === 'approved'
              ? 'Game Approved!'
              : action === 'unpublished'
              ? 'Game Unpublished'
              : 'Game Rejected',
          message:
            action === 'approved'
              ? `Your game ${game.title} is now live!`
              : action === 'unpublished'
              ? `Your game ${game.title} was unpublished by an admin.`
              : 'Your game was rejected. Check submission guidelines.',
          type: 'game_status_update',
          gameId: game.id,
          read: false,
          createdAt: serverTimestamp(),
        });
      }

      showToast(`User game ${action} successfully!`);
    } catch (err: any) {
      console.error(err);
      showToast(err?.message || 'Action failed.');
    }
  };

  const handleDeleteSubmission = async (gameId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.email !== AUTHORIZED_ADMIN_EMAIL) {
      showToast('Admin authorization required to delete submissions.');
      return;
    }
    try {
      await deleteDoc(doc(db, 'user_uploaded_games', gameId));
      showToast('Submission removed.');
    } catch (err: any) {
      showToast(err?.message || 'Could not remove submission.');
    }
  };

  if (loading) return <div className="p-4 text-white text-xs">Loading user game submissions...</div>;

  const counts = uploads.reduce((acc, g) => {
    acc[g.status as string] = (acc[g.status as string] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="w-full p-4 bg-[#070c17] border border-emerald-500/30 rounded-2xl space-y-4 overflow-x-auto">
      <h3 className="text-sm font-black text-emerald-400 uppercase tracking-wider">
        User Game Submissions ({uploads.length})
      </h3>
      <div className="flex gap-4 text-xs text-zinc-400">
        <span className="text-amber-400">Pending: {counts.pending || 0}</span>
        <span className="text-emerald-400">Approved: {counts.approved || 0}</span>
        <span className="text-red-400">Rejected: {counts.rejected || 0}</span>
      </div>
      {uploads.length === 0 ? (
        <div className="text-xs text-slate-500 py-2">No user-submitted games yet.</div>
      ) : (
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
            {uploads.map((g) => (
              <tr key={g.id} className="border-b border-zinc-800">
                <td className="p-2 flex items-center gap-2">
                  {g.thumbnailUrl && (
                    <img src={g.thumbnailUrl} alt={g.title} className="w-10 h-10 rounded-lg object-cover" />
                  )}
                  <span className="font-bold">{g.title}</span>
                </td>
                <td className="p-2">{g.userEmail}</td>
                <td className="p-2">{g.category}</td>
                <td className="p-2">
                  <span
                    className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                      g.status === 'pending'
                        ? 'bg-amber-900 text-amber-200'
                        : g.status === 'approved'
                        ? 'bg-emerald-900 text-emerald-200'
                        : 'bg-red-900 text-red-200'
                    }`}
                  >
                    {g.status}
                  </span>
                </td>
                <td className="p-2">
                  <div className="flex gap-1.5">
                    {g.status !== 'approved' && (
                      <button
                        type="button"
                        onClick={() => void handleAction(g, 'approved')}
                        title="Approve"
                        className="p-1.5 bg-emerald-600 rounded-lg hover:bg-emerald-500 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {g.status === 'pending' && (
                      <button
                        type="button"
                        onClick={() => void handleAction(g, 'rejected')}
                        title="Reject"
                        className="p-1.5 bg-red-600 rounded-lg hover:bg-red-500 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => void handleDeleteSubmission(g.id)}
                      title="Delete Submission"
                      className="p-1.5 bg-zinc-800 hover:bg-rose-700 rounded-lg cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
