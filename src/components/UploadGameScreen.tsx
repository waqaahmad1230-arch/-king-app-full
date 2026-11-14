import React, { useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { db, auth } from '../firebase'; // Adjust path as needed
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

interface UploadGameScreenProps {
  onBack: () => void;
}

export default function UploadGameScreen({ onBack }: UploadGameScreenProps) {
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('Action');
  const [description, setDescription] = useState('');
  const [gameUrl, setGameUrl] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !gameUrl) {
      alert('Title and Game URL are required');
      return;
    }

    setLoading(true);
    try {
      if (!auth.currentUser) throw new Error('Not logged in');
      
      await addDoc(collection(db, 'user_uploaded_games'), {
        title,
        category,
        description,
        thumbnailUrl: `https://via.placeholder.com/300x200?text=${encodeURIComponent(title)}`,
        gameUrl,
        userId: auth.currentUser.uid,
        userEmail: auth.currentUser.email,
        status: 'pending',
        createdAt: serverTimestamp(),
        plays: 0,
        earnings: 0
      });
      
      alert('Game Submitted Successfully!');
      onBack();
    } catch (error) {
      console.error('Error submitting game:', error);
      alert('Failed to submit game');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-zinc-950 p-6 overflow-y-auto">
      <button onClick={onBack} className="text-white mb-6">
        <ArrowLeft className="w-6 h-6" />
      </button>
      <h1 className="text-2xl font-black text-white mb-6">Upload Your Game</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-zinc-400 mb-1">Game Title</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700" required />
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">Category</label>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700">
            <option>Action</option>
            <option>Racing</option>
            <option>Puzzle</option>
            <option>Sports</option>
            <option>Adventure</option>
          </select>
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">Description</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700 h-24" />
        </div>
        <div>
          <label className="block text-zinc-400 mb-1">Game Link (HTML5 URL)</label>
          <input type="url" value={gameUrl} onChange={(e) => setGameUrl(e.target.value)} placeholder="https://your-game-link.com" className="w-full bg-zinc-900 text-white p-3 rounded-xl border border-zinc-700" required />
        </div>
        <button type="submit" disabled={loading} className="w-full py-4 bg-green-600 text-white font-bold rounded-2xl hover:bg-green-500">
          {loading ? 'Uploading...' : 'Submit Game'}
        </button>
      </form>
    </div>
  );
}
