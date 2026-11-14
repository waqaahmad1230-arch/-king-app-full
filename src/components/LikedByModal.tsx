import React, { useState, useEffect } from 'react';
import { X, Heart, Loader2, Sparkles, UserCheck } from 'lucide-react';
import CreatorAvatar, { CreatorDisplayName } from './CreatorAvatar';
import { fetchVideoLikedByUsers, LikedUserItem } from '../services/videoSocialService';
import { useAuth } from '../context/AuthContext';

interface LikedByModalProps {
  isOpen: boolean;
  onClose: () => void;
  videoId: string | null;
  videoTitle?: string;
  totalLikesCount?: number;
}

function formatLikedTime(timestamp: any): string {
  if (!timestamp) return 'Recently';
  let date: Date;
  if (typeof timestamp?.toDate === 'function') {
    date = timestamp.toDate();
  } else if (timestamp?.seconds) {
    date = new Date(timestamp.seconds * 1000);
  } else if (typeof timestamp === 'string' || typeof timestamp === 'number') {
    date = new Date(timestamp);
  } else {
    return 'Recently';
  }

  const now = new Date();
  const diffInSeconds = Math.max(0, Math.floor((now.getTime() - date.getTime()) / 1000));
  if (diffInSeconds < 60) return 'Just now';
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;
  return `${Math.floor(diffInDays / 7)}w ago`;
}

export default function LikedByModal({
  isOpen,
  onClose,
  videoId,
  videoTitle,
  totalLikesCount = 0
}: LikedByModalProps) {
  const { user: authUser } = useAuth();
  const [likes, setLikes] = useState<LikedUserItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !videoId) {
      setLikes([]);
      return;
    }

    let isMounted = true;
    setLoading(true);

    fetchVideoLikedByUsers(videoId)
      .then((users) => {
        if (isMounted) {
          setLikes(users);
          setLoading(false);
        }
      })
      .catch((err) => {
        console.warn("Failed to load likes list:", err);
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, videoId]);

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-[140] flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-0 sm:p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="w-full max-w-md bg-[#0f172a] border border-slate-800 rounded-t-2xl sm:rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[80vh] animate-in slide-in-from-bottom duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3.5 border-b border-slate-800 bg-[#0c1222]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-red-500/15 flex items-center justify-center text-red-400">
              <Heart className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h3 className="text-white text-sm font-bold flex items-center gap-1.5">
                Liked by
                <span className="text-xs font-mono font-normal text-slate-400">
                  ({likes.length > 0 ? likes.length : totalLikesCount})
                </span>
              </h3>
              {videoTitle && (
                <p className="text-[11px] text-slate-400 truncate max-w-[220px]">
                  {videoTitle}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center transition cursor-pointer"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content list */}
        <div className="flex-1 overflow-y-auto p-3 divide-y divide-slate-800/60 max-h-[55vh]">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
              <Loader2 className="w-6 h-6 animate-spin text-red-500" />
              <p className="text-xs">Loading who liked this video...</p>
            </div>
          ) : likes.length === 0 ? (
            <div className="py-12 text-center flex flex-col items-center justify-center gap-2 px-4">
              <div className="w-12 h-12 rounded-full bg-slate-800/80 flex items-center justify-center text-slate-500 mb-1">
                <Heart className="w-6 h-6 text-slate-600" />
              </div>
              <p className="text-sm font-semibold text-slate-300">No likes yet</p>
              <p className="text-xs text-slate-500 max-w-xs">
                Be the first to tap the heart and show some love for this KING video!
              </p>
            </div>
          ) : (
            likes.map((item) => {
              const isMe = authUser?.uid === item.userId;
              return (
                <div 
                  key={item.userId}
                  className="flex items-center justify-between py-2.5 px-2 hover:bg-slate-800/40 rounded-xl transition"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <CreatorAvatar
                      uid={item.userId}
                      fallbackPhoto={item.photoURL}
                      fallbackName={item.displayName}
                      className="w-10 h-10 rounded-full shrink-0 border border-slate-700/80 shadow-sm"
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-white truncate">
                          <CreatorDisplayName uid={item.userId} fallback={item.displayName} />
                        </span>
                        {isMe && (
                          <span className="text-[10px] bg-red-500/20 text-red-400 border border-red-500/30 px-1.5 py-0.2 rounded-full font-medium">
                            You
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400">
                        {formatLikedTime(item.createdAt)}
                      </p>
                    </div>
                  </div>

                  <div className="text-red-500 shrink-0 pr-1">
                    <Heart className="w-4 h-4 fill-current" />
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2.5 bg-[#0c1222] border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>KING Social Network</span>
          <span>1 Like per User Verified</span>
        </div>
      </div>
    </div>
  );
}
