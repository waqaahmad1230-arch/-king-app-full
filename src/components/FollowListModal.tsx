import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Check,
  Loader2,
  Search,
  UserCheck,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react';
import { type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import CreatorAvatar from './CreatorAvatar';
import { formatCreatorHandle } from '../services/creatorProfileService';
import {
  fetchFollowersPage,
  fetchFollowingPage,
  fetchMyFollowEdgesForTargets,
  followUser,
  removeFollower,
  resolveSocialErrorMessage,
  subscribeMyBlockedUsers,
  unfollowUser,
  type FollowListPageItem,
} from '../services/socialGraphService';

interface FollowListModalProps {
  isOpen: boolean;
  onClose: () => void;
  profileUid: string;
  profileName: string;
  initialTab: 'followers' | 'following';
  currentUid: string | null | undefined;
  followersCount?: number;
  followingCount?: number;
  onOpenUserProfile: (uid: string) => void;
  onRequireAuth: () => void;
  onShowToast: (msg: string) => void;
}

const PAGE_SIZE = 25;

export default function FollowListModal({
  isOpen,
  onClose,
  profileUid,
  profileName,
  initialTab,
  currentUid,
  followersCount,
  followingCount,
  onOpenUserProfile,
  onRequireAuth,
  onShowToast,
}: FollowListModalProps) {
  const [activeTab, setActiveTab] = useState<'followers' | 'following'>(initialTab);
  const [items, setItems] = useState<FollowListPageItem[]>([]);
  const [cursor, setCursor] = useState<QueryDocumentSnapshot<DocumentData> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  // Track my outgoing/incoming relationships for displayed rows
  const [myFollowingSet, setMyFollowingSet] = useState<Set<string>>(new Set());
  const [myFollowedBySet, setMyFollowedBySet] = useState<Set<string>>(new Set());
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [busyUid, setBusyUid] = useState<string | null>(null);
  const [confirmUnfollowUid, setConfirmUnfollowUid] = useState<string | null>(null);
  const [hiddenBlockedActionUids, setHiddenBlockedActionUids] = useState<Set<string>>(new Set());

  const isOwnProfile = Boolean(currentUid && profileUid && currentUid === profileUid);

  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setSearchTerm('');
      setConfirmUnfollowUid(null);
    }
  }, [isOpen, initialTab, profileUid]);

  useEffect(() => {
    if (!isOpen || !currentUid) {
      setBlockedSet(new Set());
      return;
    }
    return subscribeMyBlockedUsers(currentUid, (records) => {
      setBlockedSet(new Set(records.map((r) => r.blockedUid)));
    });
  }, [isOpen, currentUid]);

  const hydrateEdgesForItems = useCallback(
    async (list: FollowListPageItem[], mergeExisting = false) => {
      if (!currentUid || list.length === 0) return;
      const targetUids = list.map((i) => i.uid);
      const { followingSet, followedBySet } = await fetchMyFollowEdgesForTargets(
        currentUid,
        targetUids
      );
      if (mergeExisting) {
        setMyFollowingSet((prev) => new Set([...prev, ...followingSet]));
        setMyFollowedBySet((prev) => new Set([...prev, ...followedBySet]));
      } else {
        setMyFollowingSet(followingSet);
        setMyFollowedBySet(followedBySet);
      }
    },
    [currentUid]
  );

  const loadInitialPage = useCallback(async () => {
    if (!isOpen || !profileUid) return;
    setLoading(true);
    setErrorMsg(null);
    setItems([]);
    setCursor(null);
    setHasMore(false);
    setConfirmUnfollowUid(null);

    try {
      const result =
        activeTab === 'followers'
          ? await fetchFollowersPage(profileUid, PAGE_SIZE, null)
          : await fetchFollowingPage(profileUid, PAGE_SIZE, null);
      setItems(result.items);
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      await hydrateEdgesForItems(result.items, false);
    } catch (err) {
      setErrorMsg(resolveSocialErrorMessage(err, 'Could not load users right now.'));
    } finally {
      setLoading(false);
    }
  }, [isOpen, profileUid, activeTab, hydrateEdgesForItems]);

  useEffect(() => {
    loadInitialPage();
  }, [loadInitialPage]);

  const handleLoadMore = async () => {
    if (!hasMore || loadingMore || !cursor || !profileUid) return;
    setLoadingMore(true);
    try {
      const result =
        activeTab === 'followers'
          ? await fetchFollowersPage(profileUid, PAGE_SIZE, cursor)
          : await fetchFollowingPage(profileUid, PAGE_SIZE, cursor);

      setItems((prev) => {
        const seen = new Set(prev.map((p) => p.uid));
        const merged = [...prev];
        for (const item of result.items) {
          if (!seen.has(item.uid)) {
            seen.add(item.uid);
            merged.push(item);
          }
        }
        return merged;
      });
      setCursor(result.nextCursor);
      setHasMore(result.hasMore);
      await hydrateEdgesForItems(result.items, true);
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err, 'Could not load more users.'));
    } finally {
      setLoadingMore(false);
    }
  };

  const handleFollow = async (item: FollowListPageItem) => {
    if (!currentUid) {
      onRequireAuth();
      return;
    }
    if (item.uid === currentUid) return;
    setBusyUid(item.uid);
    try {
      await followUser(currentUid, item.uid);
      setMyFollowingSet((prev) => new Set([...prev, item.uid]));
      onShowToast(`Following ${item.profile.displayName}`);
    } catch (err: any) {
      if (err?.code === 'permission-denied') {
        setHiddenBlockedActionUids((prev) => new Set([...prev, item.uid]));
      }
      onShowToast(resolveSocialErrorMessage(err));
    } finally {
      setBusyUid(null);
    }
  };

  const handleUnfollow = async (item: FollowListPageItem) => {
    if (!currentUid) {
      onRequireAuth();
      return;
    }
    setBusyUid(item.uid);
    try {
      await unfollowUser(currentUid, item.uid);
      setMyFollowingSet((prev) => {
        const next = new Set(prev);
        next.delete(item.uid);
        return next;
      });
      setConfirmUnfollowUid(null);
      if (isOwnProfile && activeTab === 'following') {
        setItems((prev) => prev.filter((i) => i.uid !== item.uid));
      }
      onShowToast(`Unfollowed ${item.profile.displayName}`);
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err));
    } finally {
      setBusyUid(null);
    }
  };

  const handleRemoveFollower = async (item: FollowListPageItem) => {
    if (!currentUid || !isOwnProfile) return;
    setBusyUid(item.uid);
    try {
      await removeFollower(currentUid, item.uid);
      setItems((prev) => prev.filter((i) => i.uid !== item.uid));
      setMyFollowedBySet((prev) => {
        const next = new Set(prev);
        next.delete(item.uid);
        return next;
      });
      onShowToast(`Removed ${item.profile.displayName} from followers`);
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err));
    } finally {
      setBusyUid(null);
    }
  };

  const visibleItems = useMemo(() => {
    const q = searchTerm.trim().replace(/^@+/, '').toLowerCase();
    return items.filter((item) => {
      if (blockedSet.has(item.uid)) return false;
      if (!q) return true;
      const name = item.profile.displayName.toLowerCase();
      const handle = (item.profile.usernameLower || item.profile.username || '').toLowerCase();
      return name.includes(q) || handle.includes(q);
    });
  }, [items, blockedSet, searchTerm]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-black/85 backdrop-blur-md p-0 sm:p-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md bg-[#0a0e1f] border border-slate-800 sm:rounded-3xl rounded-t-3xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 pt-4 pb-3 border-b border-slate-800/80 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-black text-white truncate">{profileName}</h3>
            <p className="text-[11px] text-slate-400">
              {isOwnProfile ? 'Your KING social connections' : 'Creator network'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close list"
            className="w-8 h-8 rounded-full bg-slate-900 border border-slate-700 flex items-center justify-center text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Followers / Following Switcher */}
        <div className="grid grid-cols-2 border-b border-slate-800/80 bg-[#060a14]">
          <button
            type="button"
            onClick={() => setActiveTab('followers')}
            className={`py-3 text-xs font-black border-b-2 transition cursor-pointer ${
              activeTab === 'followers'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Followers
            {typeof followersCount === 'number' ? ` (${followersCount.toLocaleString()})` : ''}
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('following')}
            className={`py-3 text-xs font-black border-b-2 transition cursor-pointer ${
              activeTab === 'following'
                ? 'border-cyan-400 text-cyan-300 bg-cyan-500/5'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            Following
            {typeof followingCount === 'number' ? ` (${followingCount.toLocaleString()})` : ''}
          </button>
        </div>

        {/* Quick Filter */}
        <div className="p-3 border-b border-slate-800/60 bg-[#070b17]">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder={`Filter ${activeTab} by name or @username...`}
              className="w-full bg-[#0c1324] border border-slate-800 focus:border-cyan-500 text-white text-xs pl-8 pr-8 py-2 rounded-xl focus:outline-none"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Scrollable List */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {loading ? (
            <div className="py-12 flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
              <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
              <span>Loading {activeTab}...</span>
            </div>
          ) : errorMsg ? (
            <div className="p-5 bg-red-950/30 border border-red-500/30 rounded-2xl text-center space-y-2">
              <p className="text-xs text-red-200">{errorMsg}</p>
              <button
                type="button"
                onClick={loadInitialPage}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Retry
              </button>
            </div>
          ) : visibleItems.length === 0 ? (
            <div className="py-12 px-4 text-center space-y-2">
              <Users className="w-8 h-8 text-slate-600 mx-auto" />
              <p className="text-xs font-bold text-slate-300">
                {searchTerm
                  ? `No ${activeTab} match "${searchTerm}".`
                  : activeTab === 'followers'
                  ? isOwnProfile
                    ? 'You do not have any followers yet.'
                    : `${profileName} does not have any followers yet.`
                  : isOwnProfile
                  ? 'You are not following anyone yet.'
                  : `${profileName} is not following anyone yet.`}
              </p>
            </div>
          ) : (
            <>
              {visibleItems.map((item) => {
                const isSelfRow = Boolean(currentUid && item.uid === currentUid);
                const iFollow = myFollowingSet.has(item.uid);
                const followsMe =
                  myFollowedBySet.has(item.uid) ||
                  (isOwnProfile && activeTab === 'followers');
                const handleLabel = formatCreatorHandle(item.profile);
                const isBusy = busyUid === item.uid;
                const actionBlocked = hiddenBlockedActionUids.has(item.uid);

                return (
                  <div
                    key={item.followId}
                    className="p-2.5 bg-[#0d1426] hover:bg-[#111a31] border border-slate-800/80 rounded-2xl space-y-2 transition"
                  >
                    <div className="flex items-center justify-between gap-2.5">
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          onOpenUserProfile(item.uid);
                        }}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                      >
                        <CreatorAvatar
                          uid={item.uid}
                          fallbackPhoto={item.profile.photoURL}
                          fallbackName={item.profile.displayName}
                          className="w-10 h-10 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-white truncate">
                              {item.profile.displayName}
                            </span>
                            {item.profile.isVerified && (
                              <span
                                className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-cyan-400 text-[#050814] text-[9px] font-black shrink-0"
                                title="Verified Creator"
                              >
                                ✓
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate flex items-center gap-1.5">
                            <span>{handleLabel}</span>
                            {followsMe && !isSelfRow && (
                              <span className="text-[9px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 px-1.5 py-0.2 rounded-full">
                                Follows you
                              </span>
                            )}
                          </div>
                        </div>
                      </button>

                      {!isSelfRow && !actionBlocked && (
                        <div className="flex items-center gap-1.5 shrink-0">
                          {iFollow ? (
                            <button
                              type="button"
                              disabled={busyUid !== null}
                              onClick={() => {
                                if (!currentUid) {
                                  onRequireAuth();
                                  return;
                                }
                                setConfirmUnfollowUid(
                                  confirmUnfollowUid === item.uid ? null : item.uid
                                );
                              }}
                              className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-600 text-[11px] font-bold rounded-xl flex items-center gap-1 cursor-pointer disabled:opacity-50"
                            >
                              <UserCheck className="w-3 h-3" />
                              Following
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busyUid !== null}
                              onClick={() => handleFollow(item)}
                              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-xl flex items-center gap-1 shadow-sm shadow-blue-600/25 cursor-pointer disabled:opacity-50"
                            >
                              {isBusy ? (
                                <Loader2 className="w-3 h-3 animate-spin" />
                              ) : (
                                <UserPlus className="w-3 h-3" />
                              )}
                              {followsMe ? 'Follow Back' : 'Follow'}
                            </button>
                          )}

                          {isOwnProfile && activeTab === 'followers' && (
                            <button
                              type="button"
                              disabled={busyUid !== null}
                              onClick={() => handleRemoveFollower(item)}
                              title="Remove follower"
                              className="p-1.5 bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-800 rounded-xl cursor-pointer disabled:opacity-50"
                            >
                              <UserX className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}

                      {isSelfRow && (
                        <span className="px-2.5 py-1 bg-slate-900 text-slate-400 text-[10px] font-bold rounded-lg border border-slate-800">
                          You
                        </span>
                      )}
                    </div>

                    {/* Inline Unfollow Confirmation */}
                    {confirmUnfollowUid === item.uid && (
                      <div className="p-2 bg-[#070c17] border border-amber-500/35 rounded-xl flex items-center justify-between gap-2">
                        <span className="text-[11px] text-slate-200 truncate">
                          Unfollow {item.profile.displayName}?
                        </span>
                        <div className="flex gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => setConfirmUnfollowUid(null)}
                            className="px-2 py-1 bg-slate-800 text-slate-300 text-[10px] font-bold rounded-lg cursor-pointer"
                          >
                            Keep
                          </button>
                          <button
                            type="button"
                            disabled={busyUid !== null}
                            onClick={() => handleUnfollow(item)}
                            className="px-2 py-1 bg-red-600 hover:bg-red-500 text-white text-[10px] font-bold rounded-lg flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <Check className="w-3 h-3" />
                            Unfollow
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}

              {hasMore && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    disabled={loadingMore}
                    onClick={handleLoadMore}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 border border-slate-700 text-cyan-300 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    {loadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    {loadingMore ? 'Loading more...' : 'Load More'}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
