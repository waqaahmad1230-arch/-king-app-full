import React, { useEffect, useMemo, useState } from 'react';
import {
  Ban,
  Check,
  Eye,
  Lock,
  Search,
  Shield,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  X,
} from 'lucide-react';
import CreatorAvatar, { CreatorDisplayName } from './CreatorAvatar';
import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  DEFAULT_STATUS_PRIVACY,
  fetchDiscoverableUsers,
  followUser,
  MAX_PRIVACY_UID_LIST,
  rejectFriendRequest,
  removeFollower,
  removeFriend,
  resolveSocialErrorMessage,
  saveStatusPrivacy,
  sendFriendRequest,
  subscribeMyBlockedUsers,
  subscribeMyFollowers,
  subscribeMyFollowing,
  subscribeMyFriendships,
  subscribeRelationshipWithUser,
  subscribeStatusPrivacy,
  unblockUser,
  unfollowUser,
} from '../services/socialGraphService';
import {
  BlockRecord,
  FollowRecord,
  FriendshipRecord,
  RelationshipWithUser,
  SocialUserProfile,
  STATUS_PRIVACY_OPTIONS,
  StatusPrivacyMode,
  StatusPrivacySettings,
} from '../types/social';

interface ProfileRelationshipBarProps {
  currentUid: string | null | undefined;
  targetUid: string;
  targetName: string;
  onRequireAuth: () => void;
  onShowToast: (msg: string) => void;
}

export function ProfileRelationshipBar({
  currentUid,
  targetUid,
  targetName,
  onRequireAuth,
  onShowToast,
}: ProfileRelationshipBarProps) {
  const [rel, setRel] = useState<RelationshipWithUser>({
    friendState: 'none',
    friendshipId: null,
    isFollowing: false,
    isFollowedBy: false,
    isBlockedByMe: false,
  });
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [confirmMode, setConfirmMode] = useState<'none' | 'unfriend' | 'block'>('none');

  useEffect(() => {
    setConfirmMode('none');
    if (!currentUid || !targetUid || currentUid === targetUid) {
      setRel({
        friendState: 'none',
        friendshipId: null,
        isFollowing: false,
        isFollowedBy: false,
        isBlockedByMe: false,
      });
      return;
    }
    return subscribeRelationshipWithUser(currentUid, targetUid, setRel);
  }, [currentUid, targetUid]);

  const runAction = async (key: string, fn: () => Promise<void>, successMsg: string) => {
    if (!currentUid) {
      onRequireAuth();
      return;
    }
    setBusyAction(key);
    try {
      await fn();
      setConfirmMode('none');
      onShowToast(successMsg);
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err));
    } finally {
      setBusyAction(null);
    }
  };

  if (rel.isBlockedByMe) {
    return (
      <div className="mt-4 w-full max-w-md px-4">
        <div className="bg-red-950/35 border border-red-500/40 rounded-2xl p-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-xs text-red-300 font-bold">
            <Ban className="w-4 h-4 shrink-0 text-red-400" />
            <span>You blocked {targetName}</span>
          </div>
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              runAction('unblock', () => unblockUser(currentUid!, targetUid), `Unblocked ${targetName}`)
            }
            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-600 transition cursor-pointer disabled:opacity-50"
          >
            {busyAction === 'unblock' ? 'Unblocking...' : 'Unblock'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 w-full max-w-md px-4 space-y-2">
      <div className="flex flex-wrap items-center justify-center gap-2">
        {/* Friend Request / Friendship Controls */}
        {rel.friendState === 'none' && (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              runAction(
                'add_friend',
                () => sendFriendRequest(currentUid!, targetUid),
                `Friend request sent to ${targetName}`
              )
            }
            className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black rounded-xl flex items-center gap-1.5 shadow-md shadow-cyan-500/20 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <UserPlus className="w-3.5 h-3.5" />
            {busyAction === 'add_friend' ? 'Sending...' : 'Add Friend'}
          </button>
        )}

        {rel.friendState === 'outgoing_pending' && (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() =>
              runAction(
                'cancel_req',
                () => cancelFriendRequest(currentUid!, targetUid),
                'Friend request canceled'
              )
            }
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <X className="w-3.5 h-3.5" />
            {busyAction === 'cancel_req' ? 'Canceling...' : 'Cancel Request'}
          </button>
        )}

        {rel.friendState === 'incoming_pending' && (
          <>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction(
                  'accept_req',
                  () => acceptFriendRequest(currentUid!, targetUid),
                  `You and ${targetName} are now friends`
                )
              }
              className="px-3.5 py-2 bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-black rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              <Check className="w-3.5 h-3.5" />
              {busyAction === 'accept_req' ? 'Accepting...' : 'Accept Friend'}
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction(
                  'reject_req',
                  () => rejectFriendRequest(currentUid!, targetUid),
                  'Friend request rejected'
                )
              }
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-xl border border-slate-700 transition active:scale-95 cursor-pointer disabled:opacity-50"
            >
              Reject
            </button>
          </>
        )}

        {rel.friendState === 'friends' && (
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => {
              if (!currentUid) {
                onRequireAuth();
                return;
              }
              setConfirmMode(confirmMode === 'unfriend' ? 'none' : 'unfriend');
            }}
            className="px-4 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50"
          >
            <UserCheck className="w-3.5 h-3.5" />
            Friends ✓
          </button>
        )}

        {/* Follow / Unfollow Button */}
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() =>
            rel.isFollowing
              ? runAction('unfollow', () => unfollowUser(currentUid!, targetUid), `Unfollowed ${targetName}`)
              : runAction('follow', () => followUser(currentUid!, targetUid), `Following ${targetName}`)
          }
          className={`px-4 py-2 text-xs font-bold rounded-xl flex items-center gap-1.5 transition active:scale-95 cursor-pointer disabled:opacity-50 ${
            rel.isFollowing
              ? 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-600'
              : 'bg-blue-600 hover:bg-blue-500 text-white shadow-md shadow-blue-600/25'
          }`}
        >
          {rel.isFollowing ? (
            <>
              <Check className="w-3.5 h-3.5" />
              {busyAction === 'unfollow' ? 'Updating...' : 'Following'}
            </>
          ) : (
            <>
              <PlusIcon />
              {busyAction === 'follow' ? 'Updating...' : 'Follow'}
            </>
          )}
        </button>

        {/* Block Button */}
        <button
          type="button"
          disabled={busyAction !== null}
          onClick={() => {
            if (!currentUid) {
              onRequireAuth();
              return;
            }
            setConfirmMode(confirmMode === 'block' ? 'none' : 'block');
          }}
          className="px-3 py-2 bg-[#0d1424] hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-800 hover:border-red-500/40 text-xs font-bold rounded-xl flex items-center gap-1 transition active:scale-95 cursor-pointer disabled:opacity-50"
          title="Block User"
        >
          <Ban className="w-3.5 h-3.5" />
          Block
        </button>
      </div>

      {rel.isFollowedBy && (
        <div className="flex justify-center">
          <span className="text-[10px] font-bold text-cyan-300 bg-cyan-500/10 border border-cyan-500/25 px-2.5 py-0.5 rounded-full">
            Follows you
          </span>
        </div>
      )}

      {/* Inline Confirmations (no window.confirm) */}
      {confirmMode === 'unfriend' && (
        <div className="p-3 bg-[#0c1424] border border-amber-500/40 rounded-2xl flex items-center justify-between gap-2">
          <span className="text-xs text-slate-200">Remove {targetName} from Friends?</span>
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setConfirmMode('none')}
              className="px-2.5 py-1 bg-slate-800 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer"
            >
              Keep
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction('unfriend', () => removeFriend(currentUid!, targetUid), `Removed ${targetName} from friends`)
              }
              className="px-2.5 py-1 bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold rounded-lg cursor-pointer"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {confirmMode === 'block' && (
        <div className="p-3 bg-red-950/30 border border-red-500/40 rounded-2xl space-y-2">
          <p className="text-xs text-red-200">
            Block {targetName}? This removes any friendship or follow connection and prevents requests between you.
          </p>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setConfirmMode('none')}
              className="px-3 py-1.5 bg-slate-800 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={busyAction !== null}
              onClick={() =>
                runAction('block', () => blockUser(currentUid!, targetUid), `Blocked ${targetName}`)
              }
              className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white text-[11px] font-bold rounded-lg cursor-pointer"
            >
              {busyAction === 'block' ? 'Blocking...' : 'Confirm Block'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function PlusIcon() {
  return <span className="font-black text-sm leading-none">+</span>;
}

interface SocialHubSectionProps {
  currentUid: string | null | undefined;
  onOpenUserProfile: (uid: string) => void;
  onRequireAuth: () => void;
  onShowToast: (msg: string) => void;
  onCountsChange?: (counts: {
    friends: number;
    incomingRequests: number;
    followers: number;
    following: number;
  }) => void;
}

export function SocialHubSection({
  currentUid,
  onOpenUserProfile,
  onRequireAuth,
  onShowToast,
  onCountsChange,
}: SocialHubSectionProps) {
  const [socialTab, setSocialTab] = useState<'friends' | 'followers' | 'following' | 'discover' | 'blocked'>('friends');
  const [friendships, setFriendships] = useState<FriendshipRecord[]>([]);
  const [followers, setFollowers] = useState<FollowRecord[]>([]);
  const [following, setFollowing] = useState<FollowRecord[]>([]);
  const [blocked, setBlocked] = useState<BlockRecord[]>([]);
  const [discoverUsers, setDiscoverUsers] = useState<SocialUserProfile[]>([]);
  const [loadingDiscover, setLoadingDiscover] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [rulesNotice, setRulesNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!currentUid) {
      setFriendships([]);
      setFollowers([]);
      setFollowing([]);
      setBlocked([]);
      setRulesNotice(null);
      return;
    }

    const handleErr = (err: unknown) => {
      const code = (err as any)?.code;
      if (code === 'permission-denied') {
        setRulesNotice(
          'Firestore security rules for Friends/Follows/Blocks have not been deployed to your live Firebase project yet.'
        );
      }
    };

    const u1 = subscribeMyFriendships(
      currentUid,
      (list) => {
        setRulesNotice(null);
        setFriendships(list);
      },
      handleErr
    );
    const u2 = subscribeMyFollowers(
      currentUid,
      (list) => {
        setRulesNotice(null);
        setFollowers(list);
      },
      handleErr
    );
    const u3 = subscribeMyFollowing(
      currentUid,
      (list) => {
        setRulesNotice(null);
        setFollowing(list);
      },
      handleErr
    );
    const u4 = subscribeMyBlockedUsers(
      currentUid,
      (list) => {
        setRulesNotice(null);
        setBlocked(list);
      },
      handleErr
    );

    return () => {
      u1();
      u2();
      u3();
      u4();
    };
  }, [currentUid]);

  useEffect(() => {
    let active = true;
    setLoadingDiscover(true);
    fetchDiscoverableUsers(currentUid, 60)
      .then((list) => {
        if (active) setDiscoverUsers(list);
      })
      .catch((err) => {
        console.warn('[SocialHubSection] fetchDiscoverableUsers notice:', err);
      })
      .finally(() => {
        if (active) setLoadingDiscover(false);
      });
    return () => {
      active = false;
    };
  }, [currentUid]);

  const acceptedFriends = useMemo(
    () => friendships.filter((f) => f.status === 'accepted'),
    [friendships]
  );
  const incomingRequests = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.targetUid === currentUid),
    [friendships, currentUid]
  );
  const outgoingRequests = useMemo(
    () => friendships.filter((f) => f.status === 'pending' && f.requestedBy === currentUid),
    [friendships, currentUid]
  );

  useEffect(() => {
    onCountsChange?.({
      friends: acceptedFriends.length,
      incomingRequests: incomingRequests.length,
      followers: followers.length,
      following: following.length,
    });
  }, [acceptedFriends.length, incomingRequests.length, followers.length, following.length, onCountsChange]);

  const blockedUidSet = useMemo(() => new Set(blocked.map((b) => b.blockedUid)), [blocked]);
  const followingUidSet = useMemo(() => new Set(following.map((f) => f.targetUid)), [following]);

  const friendshipMapByOtherUid = useMemo(() => {
    const map = new Map<string, FriendshipRecord>();
    if (!currentUid) return map;
    for (const f of friendships) {
      const otherUid = f.users.find((u) => u !== currentUid);
      if (otherUid) map.set(otherUid, f);
    }
    return map;
  }, [friendships, currentUid]);

  const filteredDiscover = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return discoverUsers.filter((u) => {
      if (blockedUidSet.has(u.uid)) return false;
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q);
    });
  }, [discoverUsers, blockedUidSet, searchTerm]);

  const runSocialAction = async (key: string, fn: () => Promise<void>, successMsg: string) => {
    if (!currentUid) {
      onRequireAuth();
      return;
    }
    setBusyKey(key);
    try {
      await fn();
      onShowToast(successMsg);
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err));
    } finally {
      setBusyKey(null);
    }
  };

  if (!currentUid) {
    return (
      <div className="w-full max-w-md px-4 mt-5">
        <div className="p-5 bg-[#0a0e1f] border border-slate-800 rounded-2xl text-center space-y-3">
          <Users className="w-8 h-8 text-cyan-400 mx-auto" />
          <div className="text-sm font-black text-white">Sign in to manage Friends & Follows</div>
          <p className="text-xs text-slate-400">
            Send friend requests, follow creators, manage your followers/following lists, and block users.
          </p>
          <button
            type="button"
            onClick={onRequireAuth}
            className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-black text-xs font-black rounded-xl transition cursor-pointer"
          >
            Sign In
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md px-4 mt-5 space-y-4">
      {rulesNotice && (
        <div className="p-3 bg-amber-950/35 border border-amber-500/40 rounded-xl text-[11px] text-amber-200 leading-relaxed">
          {rulesNotice}
        </div>
      )}

      {/* Sub-navigation pills */}
      <div className="flex gap-1.5 overflow-x-auto pb-1">
        {(
          [
            { id: 'friends', label: `Friends (${acceptedFriends.length})`, badge: incomingRequests.length },
            { id: 'followers', label: `Followers (${followers.length})`, badge: 0 },
            { id: 'following', label: `Following (${following.length})`, badge: 0 },
            { id: 'discover', label: 'Find People', badge: 0 },
            { id: 'blocked', label: `Blocked (${blocked.length})`, badge: 0 },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setSocialTab(tab.id)}
            className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap flex items-center gap-1.5 border transition cursor-pointer ${
              socialTab === tab.id
                ? 'bg-cyan-500 text-black border-cyan-400'
                : 'bg-[#0a0e1f] text-slate-300 border-gray-800 hover:border-slate-700'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-black">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* TAB 1: FRIENDS & REQUESTS */}
      {socialTab === 'friends' && (
        <div className="space-y-4">
          {incomingRequests.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-amber-400">
                Incoming Friend Requests ({incomingRequests.length})
              </h4>
              {incomingRequests.map((req) => {
                const otherUid = req.requestedBy;
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 p-3 bg-[#0c1428] border border-amber-500/30 rounded-xl"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenUserProfile(otherUid)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <CreatorAvatar uid={otherUid} className="w-9 h-9" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          <CreatorDisplayName uid={otherUid} fallback="KING User" />
                        </div>
                        <div className="text-[10px] text-amber-300">Wants to be your friend</div>
                      </div>
                    </button>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runSocialAction(
                            `acc_${otherUid}`,
                            () => acceptFriendRequest(currentUid, otherUid),
                            'Friend request accepted!'
                          )
                        }
                        className="px-2.5 py-1.5 bg-emerald-500 hover:bg-emerald-400 text-black text-[11px] font-black rounded-lg cursor-pointer"
                      >
                        Accept
                      </button>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runSocialAction(
                            `rej_${otherUid}`,
                            () => rejectFriendRequest(currentUid, otherUid),
                            'Friend request rejected'
                          )
                        }
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {outgoingRequests.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
                Sent Requests ({outgoingRequests.length})
              </h4>
              {outgoingRequests.map((req) => {
                const otherUid = req.targetUid;
                return (
                  <div
                    key={req.id}
                    className="flex items-center justify-between gap-2 p-3 bg-[#0a0e1f] border border-gray-800 rounded-xl"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenUserProfile(otherUid)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <CreatorAvatar uid={otherUid} className="w-9 h-9" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          <CreatorDisplayName uid={otherUid} fallback="KING User" />
                        </div>
                        <div className="text-[10px] text-slate-400">Pending acceptance</div>
                      </div>
                    </button>
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() =>
                        runSocialAction(
                          `can_${otherUid}`,
                          () => cancelFriendRequest(currentUid, otherUid),
                          'Request canceled'
                        )
                      }
                      className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-bold rounded-lg cursor-pointer shrink-0"
                    >
                      Cancel
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-[11px] font-extrabold uppercase tracking-wider text-cyan-400">
              Your Friends ({acceptedFriends.length})
            </h4>
            {acceptedFriends.length === 0 ? (
              <div className="p-5 bg-[#0a0e1f] border border-dashed border-gray-800 rounded-xl text-center text-xs text-slate-400 space-y-2">
                <p>No friends yet.</p>
                <button
                  type="button"
                  onClick={() => setSocialTab('discover')}
                  className="text-cyan-400 font-bold hover:underline cursor-pointer"
                >
                  Find people on KING App →
                </button>
              </div>
            ) : (
              acceptedFriends.map((fr) => {
                const otherUid = fr.users.find((u) => u !== currentUid) || fr.targetUid;
                return (
                  <div
                    key={fr.id}
                    className="flex items-center justify-between gap-2 p-3 bg-[#0a0e1f] border border-gray-800 rounded-xl"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenUserProfile(otherUid)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <CreatorAvatar uid={otherUid} className="w-9 h-9" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">
                          <CreatorDisplayName uid={otherUid} fallback="KING Friend" />
                        </div>
                        <div className="text-[10px] text-emerald-400">Friends ✓</div>
                      </div>
                    </button>
                    <div className="flex gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runSocialAction(
                            `rm_${otherUid}`,
                            () => removeFriend(currentUid, otherUid),
                            'Removed from friends'
                          )
                        }
                        className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg flex items-center gap-1 cursor-pointer"
                        title="Remove friend"
                      >
                        <UserMinus className="w-3 h-3" /> Remove
                      </button>
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runSocialAction(
                            `blk_${otherUid}`,
                            () => blockUser(currentUid, otherUid),
                            'User blocked'
                          )
                        }
                        className="p-1.5 bg-slate-900 hover:bg-red-950/60 text-slate-400 hover:text-red-400 border border-slate-800 rounded-lg cursor-pointer"
                        title="Block user"
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FOLLOWERS */}
      {socialTab === 'followers' && (
        <div className="space-y-2">
          {followers.length === 0 ? (
            <div className="p-5 bg-[#0a0e1f] border border-dashed border-gray-800 rounded-xl text-center text-xs text-slate-400">
              No followers yet.
            </div>
          ) : (
            followers.map((f) => {
              const otherUid = f.followerUid;
              const alreadyFollowing = followingUidSet.has(otherUid);
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 p-3 bg-[#0a0e1f] border border-gray-800 rounded-xl"
                >
                  <button
                    type="button"
                    onClick={() => onOpenUserProfile(otherUid)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <CreatorAvatar uid={otherUid} className="w-9 h-9" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        <CreatorDisplayName uid={otherUid} fallback="Follower" />
                      </div>
                      <div className="text-[10px] text-slate-400">Follows you</div>
                    </div>
                  </button>
                  <div className="flex gap-1.5 shrink-0">
                    {!alreadyFollowing ? (
                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          runSocialAction(
                            `fb_${otherUid}`,
                            () => followUser(currentUid, otherUid),
                            'Followed back'
                          )
                        }
                        className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white text-[11px] font-bold rounded-lg cursor-pointer"
                      >
                        Follow Back
                      </button>
                    ) : (
                      <span className="px-2.5 py-1.5 bg-slate-800/80 text-cyan-300 text-[11px] font-bold rounded-lg">
                        Following
                      </span>
                    )}
                    <button
                      type="button"
                      disabled={busyKey !== null}
                      onClick={() =>
                        runSocialAction(
                          `rf_${otherUid}`,
                          () => removeFollower(currentUid, otherUid),
                          'Follower removed'
                        )
                      }
                      className="px-2 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-bold rounded-lg cursor-pointer"
                      title="Remove follower"
                    >
                      <UserX className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 3: FOLLOWING */}
      {socialTab === 'following' && (
        <div className="space-y-2">
          {following.length === 0 ? (
            <div className="p-5 bg-[#0a0e1f] border border-dashed border-gray-800 rounded-xl text-center text-xs text-slate-400 space-y-2">
              <p>You are not following anyone yet.</p>
              <button
                type="button"
                onClick={() => setSocialTab('discover')}
                className="text-cyan-400 font-bold hover:underline cursor-pointer"
              >
                Browse creators →
              </button>
            </div>
          ) : (
            following.map((f) => {
              const otherUid = f.targetUid;
              return (
                <div
                  key={f.id}
                  className="flex items-center justify-between gap-2 p-3 bg-[#0a0e1f] border border-gray-800 rounded-xl"
                >
                  <button
                    type="button"
                    onClick={() => onOpenUserProfile(otherUid)}
                    className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                  >
                    <CreatorAvatar uid={otherUid} className="w-9 h-9" />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-white truncate">
                        <CreatorDisplayName uid={otherUid} fallback="Creator" />
                      </div>
                      <div className="text-[10px] text-cyan-400">Following</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() =>
                      runSocialAction(
                        `unf_${otherUid}`,
                        () => unfollowUser(currentUid, otherUid),
                        'Unfollowed user'
                      )
                    }
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-bold rounded-lg cursor-pointer shrink-0"
                  >
                    Unfollow
                  </button>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* TAB 4: FIND PEOPLE */}
      {socialTab === 'discover' && (
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search KING App users by name..."
              className="w-full bg-[#060a14] border border-gray-800 focus:border-cyan-500 text-white text-xs pl-8 pr-3 py-2 rounded-xl focus:outline-none"
            />
          </div>

          {loadingDiscover ? (
            <div className="text-center text-xs text-slate-400 py-4">Loading creators...</div>
          ) : filteredDiscover.length === 0 ? (
            <div className="p-5 bg-[#0a0e1f] border border-dashed border-gray-800 rounded-xl text-center text-xs text-slate-400">
              No matching users found.
            </div>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
              {filteredDiscover.map((u) => {
                const fr = friendshipMapByOtherUid.get(u.uid);
                const isFollow = followingUidSet.has(u.uid);

                return (
                  <div
                    key={u.uid}
                    className="flex items-center justify-between gap-2 p-3 bg-[#0a0e1f] border border-gray-800 rounded-xl"
                  >
                    <button
                      type="button"
                      onClick={() => onOpenUserProfile(u.uid)}
                      className="flex items-center gap-2.5 min-w-0 flex-1 text-left cursor-pointer"
                    >
                      <CreatorAvatar
                        uid={u.uid}
                        fallbackPhoto={u.photoURL}
                        fallbackName={u.displayName}
                        className="w-9 h-9"
                      />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate">{u.displayName}</div>
                        <div className="text-[10px] text-slate-400">Tap to open channel</div>
                      </div>
                    </button>

                    <div className="flex gap-1.5 shrink-0">
                      {!fr && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() =>
                            runSocialAction(
                              `req_${u.uid}`,
                              () => sendFriendRequest(currentUid, u.uid),
                              `Friend request sent to ${u.displayName}`
                            )
                          }
                          className="px-2.5 py-1.5 bg-cyan-500 hover:bg-cyan-400 text-black text-[11px] font-black rounded-lg cursor-pointer"
                        >
                          Add Friend
                        </button>
                      )}
                      {fr?.status === 'pending' && fr.requestedBy === currentUid && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() =>
                            runSocialAction(
                              `can_${u.uid}`,
                              () => cancelFriendRequest(currentUid, u.uid),
                              'Request canceled'
                            )
                          }
                          className="px-2.5 py-1.5 bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-bold rounded-lg cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                      {fr?.status === 'pending' && fr.targetUid === currentUid && (
                        <button
                          type="button"
                          disabled={busyKey !== null}
                          onClick={() =>
                            runSocialAction(
                              `acc_${u.uid}`,
                              () => acceptFriendRequest(currentUid, u.uid),
                              `You and ${u.displayName} are now friends`
                            )
                          }
                          className="px-2.5 py-1.5 bg-emerald-500 text-black text-[11px] font-black rounded-lg cursor-pointer"
                        >
                          Accept
                        </button>
                      )}
                      {fr?.status === 'accepted' && (
                        <span className="px-2 py-1.5 bg-emerald-500/15 text-emerald-300 text-[11px] font-bold rounded-lg">
                          Friends
                        </span>
                      )}

                      <button
                        type="button"
                        disabled={busyKey !== null}
                        onClick={() =>
                          isFollow
                            ? runSocialAction(
                                `unf_${u.uid}`,
                                () => unfollowUser(currentUid, u.uid),
                                `Unfollowed ${u.displayName}`
                              )
                            : runSocialAction(
                                `fol_${u.uid}`,
                                () => followUser(currentUid, u.uid),
                                `Following ${u.displayName}`
                              )
                        }
                        className={`px-2.5 py-1.5 text-[11px] font-bold rounded-lg cursor-pointer ${
                          isFollow
                            ? 'bg-slate-800 text-slate-300'
                            : 'bg-blue-600 hover:bg-blue-500 text-white'
                        }`}
                      >
                        {isFollow ? 'Following' : 'Follow'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 5: BLOCKED USERS */}
      {socialTab === 'blocked' && (
        <div className="space-y-2">
          {blocked.length === 0 ? (
            <div className="p-5 bg-[#0a0e1f] border border-dashed border-gray-800 rounded-xl text-center text-xs text-slate-400">
              No blocked users.
            </div>
          ) : (
            blocked.map((b) => (
              <div
                key={b.id}
                className="flex items-center justify-between gap-2 p-3 bg-[#0a0e1f] border border-red-500/25 rounded-xl"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <CreatorAvatar uid={b.blockedUid} className="w-9 h-9" />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-white truncate">
                      <CreatorDisplayName uid={b.blockedUid} fallback="Blocked User" />
                    </div>
                    <div className="text-[10px] text-red-400">Blocked</div>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={busyKey !== null}
                  onClick={() =>
                    runSocialAction(
                      `unblk_${b.blockedUid}`,
                      () => unblockUser(currentUid, b.blockedUid),
                      'User unblocked'
                    )
                  }
                  className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-white text-[11px] font-bold rounded-lg cursor-pointer shrink-0"
                >
                  Unblock
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

interface StatusPrivacySettingsCardProps {
  currentUid: string | null | undefined;
  onShowToast: (msg: string) => void;
}

export function StatusPrivacySettingsCard({ currentUid, onShowToast }: StatusPrivacySettingsCardProps) {
  const [settings, setSettings] = useState<StatusPrivacySettings>(DEFAULT_STATUS_PRIVACY);
  const [blockedUids, setBlockedUids] = useState<string[]>([]);
  const [availableUsers, setAvailableUsers] = useState<SocialUserProfile[]>([]);
  const [pickerSearch, setPickerSearch] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!currentUid) {
      setSettings(DEFAULT_STATUS_PRIVACY);
      setBlockedUids([]);
      return;
    }

    const unsubPrivacy = subscribeStatusPrivacy(currentUid, setSettings);
    const unsubBlocks = subscribeMyBlockedUsers(currentUid, (list) => {
      setBlockedUids(list.map((b) => b.blockedUid));
    });

    fetchDiscoverableUsers(currentUid, 80)
      .then(setAvailableUsers)
      .catch((err) => console.warn('[StatusPrivacySettingsCard] load users notice:', err));

    return () => {
      unsubPrivacy();
      unsubBlocks();
    };
  }, [currentUid]);

  const blockedSet = useMemo(() => new Set(blockedUids), [blockedUids]);

  const selectableUsers = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return availableUsers.filter((u) => {
      if (blockedSet.has(u.uid)) return false;
      if (!q) return true;
      return u.displayName.toLowerCase().includes(q) || u.uid.toLowerCase().includes(q);
    });
  }, [availableUsers, blockedSet, pickerSearch]);

  const activeListKey: 'selectedUids' | 'exceptUids' | null =
    settings.visibility === 'selected'
      ? 'selectedUids'
      : settings.visibility === 'except'
      ? 'exceptUids'
      : null;

  const activePickedSet = useMemo(() => {
    if (!activeListKey) return new Set<string>();
    return new Set(settings[activeListKey]);
  }, [activeListKey, settings]);

  const togglePickedUid = (uid: string) => {
    if (!activeListKey) return;
    const currentList = settings[activeListKey];
    if (!currentList.includes(uid) && currentList.length >= MAX_PRIVACY_UID_LIST) {
      onShowToast(`Maximum ${MAX_PRIVACY_UID_LIST} users allowed in this privacy list.`);
      return;
    }
    const nextList = currentList.includes(uid)
      ? currentList.filter((id) => id !== uid)
      : [...currentList, uid];
    setSettings((prev) => ({
      ...prev,
      [activeListKey]: nextList,
    }));
  };

  const handleSave = async () => {
    if (!currentUid) {
      onShowToast('Please sign in first to save privacy settings');
      return;
    }
    setSaving(true);
    try {
      const saved = await saveStatusPrivacy(currentUid, settings, blockedUids);
      setSettings(saved);
      onShowToast('Status privacy settings saved');
    } catch (err) {
      onShowToast(resolveSocialErrorMessage(err, 'Failed to save privacy settings'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-[#0b1222] border border-slate-800 p-4 rounded-2xl space-y-3">
      <div className="flex items-start justify-between gap-2 pb-2 border-b border-gray-800/80">
        <div>
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5" /> Status Privacy Settings
          </span>
          <p className="text-[10px] text-slate-400 mt-0.5">
            Pre-configure who will be allowed to view your future Status updates.
          </p>
        </div>
        <Lock className="w-4 h-4 text-slate-500 shrink-0 mt-0.5" />
      </div>

      {!currentUid ? (
        <p className="text-xs text-slate-400">Sign in to customize your Status privacy settings.</p>
      ) : (
        <>
          <div className="space-y-2">
            {STATUS_PRIVACY_OPTIONS.map((opt) => {
              const selected = settings.visibility === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() =>
                    setSettings((prev) => ({
                      ...prev,
                      visibility: opt.value as StatusPrivacyMode,
                    }))
                  }
                  className={`w-full text-left p-2.5 rounded-xl border transition flex items-start justify-between gap-2 cursor-pointer ${
                    selected
                      ? 'bg-cyan-500/15 border-cyan-500/60 text-white'
                      : 'bg-[#060a14] border-gray-800 text-slate-300 hover:border-slate-700'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold flex items-center gap-1.5">
                      <span>{opt.label}</span>
                      {opt.value === 'selected' && settings.selectedUids.length > 0 && (
                        <span className="text-[10px] bg-cyan-500/20 text-cyan-300 px-1.5 py-0.2 rounded-md">
                          {settings.selectedUids.length} selected
                        </span>
                      )}
                      {opt.value === 'except' && settings.exceptUids.length > 0 && (
                        <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1.5 py-0.2 rounded-md">
                          {settings.exceptUids.length} excluded
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">{opt.description}</div>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                      selected ? 'border-cyan-400 bg-cyan-400' : 'border-slate-600'
                    }`}
                  >
                    {selected && <div className="w-1.5 h-1.5 rounded-full bg-black" />}
                  </div>
                </button>
              );
            })}
          </div>

          {activeListKey && (
            <div className="p-3 bg-[#060a14] border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-slate-200">
                  {settings.visibility === 'selected'
                    ? `Select people who can view (${activePickedSet.size})`
                    : `Select people to exclude (${activePickedSet.size})`}
                </span>
                {activePickedSet.size > 0 && (
                  <button
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        [activeListKey]: [],
                      }))
                    }
                    className="text-[10px] text-rose-400 hover:underline font-bold cursor-pointer"
                  >
                    Clear all
                  </button>
                )}
              </div>

              <div className="relative">
                <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Filter users..."
                  className="w-full bg-[#0b1222] border border-gray-800 text-white text-[11px] pl-7 pr-2.5 py-1.5 rounded-lg focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="max-h-40 overflow-y-auto space-y-1 pr-1">
                {selectableUsers.length === 0 ? (
                  <p className="text-[10px] text-slate-500 py-2 text-center">No users available.</p>
                ) : (
                  selectableUsers.map((u) => {
                    const checked = activePickedSet.has(u.uid);
                    return (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() => togglePickedUid(u.uid)}
                        className={`w-full flex items-center justify-between p-1.5 rounded-lg text-left transition cursor-pointer ${
                          checked ? 'bg-cyan-500/15 border border-cyan-500/40' : 'hover:bg-slate-900'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CreatorAvatar
                            uid={u.uid}
                            fallbackPhoto={u.photoURL}
                            fallbackName={u.displayName}
                            className="w-6 h-6"
                          />
                          <span className="text-[11px] font-semibold text-white truncate">{u.displayName}</span>
                        </div>
                        <span
                          className={`w-4 h-4 rounded flex items-center justify-center border text-[10px] ${
                            checked
                              ? 'bg-cyan-500 border-cyan-400 text-black font-black'
                              : 'border-slate-600 text-transparent'
                          }`}
                        >
                          ✓
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          )}

          <button
            type="button"
            disabled={saving}
            onClick={handleSave}
            className="w-full py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs rounded-xl transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <Shield className="w-3.5 h-3.5" />
            {saving ? 'Saving Privacy Settings...' : 'Save Status Privacy'}
          </button>
        </>
      )}
    </div>
  );
}
