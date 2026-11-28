import React, { useEffect, useState } from 'react';
import {
  X,
  Search,
  Flame,
  Mic,
  UserPlus,
  UserCheck,
  Loader2,
  Users,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import CreatorAvatar from './CreatorAvatar';
import { formatCreatorHandle } from '../services/creatorProfileService';
import {
  fetchMyFollowEdgesForTargets,
  followUser,
  resolveSocialErrorMessage,
  searchUsersPaged,
  subscribeMyBlockedUsers,
  unfollowUser,
} from '../services/socialGraphService';
import { SocialUserProfile } from '../types/social';

interface SearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectResult?: (query: string) => void;
  onOpenCreatorProfile?: (uid: string) => void;
  onOpenQR?: () => void;
  onOpenVoice?: () => void;
}

export default function SearchModal({
  isOpen,
  onClose,
  onSelectResult,
  onOpenCreatorProfile,
  onOpenQR,
  onOpenVoice,
}: SearchModalProps) {
  const { user, openAuthModal } = useAuth();
  const [queryText, setQueryText] = useState('');
  const [people, setPeople] = useState<SocialUserProfile[]>([]);
  const [loadingPeople, setLoadingPeople] = useState(false);
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followedBySet, setFollowedBySet] = useState<Set<string>>(new Set());
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !user?.uid) {
      setBlockedSet(new Set());
      return;
    }
    return subscribeMyBlockedUsers(user.uid, (records) => {
      setBlockedSet(new Set(records.map((r) => r.blockedUid)));
    });
  }, [isOpen, user?.uid]);

  useEffect(() => {
    if (!isOpen) return;
    let active = true;
    const trimmed = queryText.trim();
    const timer = setTimeout(async () => {
      setLoadingPeople(true);
      setStatusNotice(null);
      try {
        const results = await searchUsersPaged(trimmed, user?.uid, 20);
        if (!active) return;
        const filtered = results.filter((p) => !blockedSet.has(p.uid));
        setPeople(filtered);

        if (user?.uid && filtered.length > 0) {
          const edges = await fetchMyFollowEdgesForTargets(
            user.uid,
            filtered.map((p) => p.uid)
          );
          if (active) {
            setFollowingSet(edges.followingSet);
            setFollowedBySet(edges.followedBySet);
          }
        } else if (active) {
          setFollowingSet(new Set());
          setFollowedBySet(new Set());
        }
      } catch (err) {
        if (active) {
          setStatusNotice(resolveSocialErrorMessage(err, 'Could not search creators.'));
        }
      } finally {
        if (active) setLoadingPeople(false);
      }
    }, trimmed ? 220 : 0);

    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [isOpen, queryText, user?.uid, blockedSet]);

  if (!isOpen) return null;

  const trendingTags = [
    'KING Shop Flash Deals',
    'Free Jazz 4G Package',
    'GTA 5 Mobile Cloud',
    'KING AI Reels',
    'PUBG Mobile Tournament',
    'Earbuds Flash Sale',
  ];

  const handleSearchTag = (item: string) => {
    setQueryText(item);
    if (onSelectResult) onSelectResult(item);
  };

  const handleToggleFollow = async (target: SocialUserProfile) => {
    if (!user?.uid) {
      openAuthModal('login');
      return;
    }
    if (target.uid === user.uid) return;
    setBusyUid(target.uid);
    setStatusNotice(null);
    const isFollowing = followingSet.has(target.uid);

    try {
      if (isFollowing) {
        await unfollowUser(user.uid, target.uid);
        setFollowingSet((prev) => {
          const next = new Set(prev);
          next.delete(target.uid);
          return next;
        });
      } else {
        await followUser(user.uid, target.uid, {
          displayName: user.displayName,
          photoURL: user.photoURL,
        });
        setFollowingSet((prev) => new Set([...prev, target.uid]));
      }
    } catch (err) {
      setStatusNotice(resolveSocialErrorMessage(err));
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm bg-[#0c1424] border border-slate-800 rounded-3xl p-5 shadow-2xl mt-6 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar with [QR Scanner] [Search Input] [Mic] [X Close] */}
        <div className="relative flex items-center bg-[#070c17] rounded-2xl border border-slate-700/80 focus-within:border-sky-500 focus-within:ring-1 focus-within:ring-sky-500 transition px-2 py-1.5 gap-1.5 shrink-0">
          {/* Left: QR Scanner Icon Button */}
          <button
            onClick={() => {
              if (onOpenQR) onOpenQR();
            }}
            aria-label="QR Scanner"
            className="w-8 h-8 shrink-0 rounded-xl bg-[#24190f] border border-amber-500/30 flex items-center justify-center text-amber-500 hover:bg-[#332213] active:scale-95 transition cursor-pointer"
          >
            <div className="w-3.5 h-3.5 grid grid-cols-2 gap-0.5 p-0.5">
              <div className="w-1.5 h-1.5 border-[1px] border-amber-500 rounded-[1px] flex items-center justify-center">
                <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
              </div>
              <div className="w-1.5 h-1.5 border-[1px] border-amber-500 rounded-[1px] flex items-center justify-center">
                <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
              </div>
              <div className="w-1.5 h-1.5 border-[1px] border-amber-500 rounded-[1px] flex items-center justify-center">
                <div className="w-0.5 h-0.5 bg-amber-500 rounded-[0.5px]" />
              </div>
              <div className="w-1.5 h-1.5 flex flex-col justify-between p-[1px]">
                <div className="w-1 h-0.5 bg-amber-500" />
                <div className="w-0.5 h-0.5 bg-amber-500 ml-auto" />
              </div>
            </div>
          </button>

          {/* Middle: Search Icon & Input Field */}
          <div className="relative flex-1 flex items-center">
            <Search className="w-4 h-4 text-sky-400 absolute left-2 pointer-events-none" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Search people, @usernames, deals..."
              autoFocus
              className="w-full bg-transparent text-white pl-8 pr-1 py-1.5 text-sm focus:outline-none"
            />
          </div>

          {/* Right: Voice Mic Button */}
          <button
            onClick={() => {
              if (onOpenVoice) onOpenVoice();
            }}
            aria-label="Voice Search"
            className="w-8 h-8 shrink-0 rounded-xl bg-[#281117] border border-red-500/30 flex items-center justify-center text-[#ef4444] hover:bg-[#38161f] active:scale-95 transition cursor-pointer"
          >
            <Mic className="w-3.5 h-3.5" strokeWidth={2.2} />
          </button>

          {/* Rightmost: Close / Clear X Button */}
          {queryText ? (
            <button
              onClick={() => setQueryText('')}
              aria-label="Clear Query"
              className="w-8 h-8 shrink-0 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 shrink-0 rounded-xl bg-slate-800/80 border border-slate-700/80 flex items-center justify-center text-slate-300 hover:text-white active:scale-95 transition cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Scrollable Results Area */}
        <div className="mt-4 flex-1 overflow-y-auto space-y-4 pr-0.5">
          {statusNotice && (
            <div className="p-2.5 bg-amber-950/40 border border-amber-500/30 rounded-xl text-[11px] text-amber-200">
              {statusNotice}
            </div>
          )}

          {/* People & Creators Results */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 uppercase tracking-wider">
                <Users className="w-3.5 h-3.5 text-cyan-400" />
                {queryText.trim() ? 'Matching Creators' : 'Suggested Creators'}
              </div>
              {loadingPeople && <Loader2 className="w-3.5 h-3.5 text-cyan-400 animate-spin" />}
            </div>

            {loadingPeople && people.length === 0 ? (
              <div className="py-4 text-center text-xs text-slate-400">Searching KING creators...</div>
            ) : people.length === 0 ? (
              <div className="p-3 bg-[#070c17] border border-slate-800/80 rounded-2xl text-center text-xs text-slate-400">
                No users match "{queryText.trim()}".
              </div>
            ) : (
              <div className="space-y-2">
                {people.map((person) => {
                  const isFollowing = followingSet.has(person.uid);
                  const followsMe = followedBySet.has(person.uid);
                  const isBusy = busyUid === person.uid;

                  return (
                    <div
                      key={person.uid}
                      className="flex items-center justify-between gap-2 p-2.5 bg-[#070c17] hover:bg-[#0d1527] border border-slate-800/80 rounded-2xl transition"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenCreatorProfile?.(person.uid);
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <CreatorAvatar
                          uid={person.uid}
                          fallbackPhoto={person.photoURL}
                          fallbackName={person.displayName}
                          className="w-9 h-9 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-white truncate">
                              {person.displayName}
                            </span>
                            {person.isVerified && (
                              <span
                                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-cyan-400 text-[#050814] text-[9px] font-black shrink-0"
                                title="Verified Creator"
                              >
                                ✓
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">
                            {formatCreatorHandle(person)} · {(person.followersCount || 0).toLocaleString()} followers
                          </div>
                        </div>
                      </button>

                      <button
                        type="button"
                        disabled={busyUid !== null}
                        onClick={() => handleToggleFollow(person)}
                        className={`px-2.5 py-1.5 text-[11px] font-bold rounded-xl flex items-center gap-1 shrink-0 transition cursor-pointer disabled:opacity-50 ${
                          isFollowing
                            ? 'bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-600'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {isBusy ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : isFollowing ? (
                          <UserCheck className="w-3 h-3" />
                        ) : (
                          <UserPlus className="w-3 h-3" />
                        )}
                        {isFollowing ? 'Following' : followsMe ? 'Follow Back' : 'Follow'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Trending Searches */}
          <div>
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
              <Flame className="w-3.5 h-3.5 text-amber-500" />
              Trending Searches
            </div>
            <div className="flex flex-wrap gap-2">
              {trendingTags.map((tag) => (
                <button
                  key={tag}
                  onClick={() => handleSearchTag(tag)}
                  className="text-xs bg-slate-900/90 hover:bg-slate-800 text-slate-200 px-3 py-1.5 rounded-xl border border-slate-800 hover:border-slate-700 transition cursor-pointer"
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Action Button */}
        <button
          onClick={onClose}
          className="w-full mt-4 py-2.5 bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-400 hover:to-blue-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-sky-500/20 transition cursor-pointer shrink-0"
        >
          Done
        </button>
      </div>
    </div>
  );
}
