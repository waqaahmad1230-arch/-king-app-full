import React, { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  Gamepad2,
  Film,
  Sparkles,
  ChevronRight,
  ThumbsUp,
  Share2,
  Play,
  Star,
  Download,
  Check,
  MessageCircle,
  Trash2,
  Send,
  Loader2,
  AlertCircle,
  RotateCcw,
  Image as ImageIcon,
  X,
  Clock,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../context/AuthContext';
import AdMobBannerAd from './AdMobBannerAd';
import { downloadVideoFile } from '../utils/downloadUtils';
import { GamePlayer } from './GamePlayer';
import { formatLastUpdated, DailyGame } from '../services/dailyGameSync';
import CreatorAvatar, { CreatorDisplayName } from './CreatorAvatar';
import StatusBar from './StatusBar';
import { CatalogProduct } from '../types/catalog';
import { orderOnWhatsApp, subscribeCatalogProducts } from '../services/catalogService';
import {
  addFeedComment,
  canUserManageItem,
  deduplicateByKeys,
  deleteFeedComment,
  deleteFeedItem,
  mergeHomeSocialFeed,
  mergeUnifiedLatestFeed,
  subscribeFeedComments,
  subscribePublishedGames,
  subscribePublishedUserPosts,
  subscribePublishedVideos,
  toggleFeedItemLike,
} from '../services/centralContentService';
import { CentralFeedItem, ContentComment, UnifiedLatestItem, UserPost } from '../types/content';

interface HomeViewProps {
  onOpenQR: () => void;
  onOpenWatchVideo?: (videoId: string) => void;
  onOpenTab: (tab: 'home' | 'games' | 'videos' | 'library' | 'CATALOG') => void;
  onFullScreenOverlayChange?: (isOpen: boolean) => void;
}

interface ShareTarget {
  title: string;
  text: string;
  url: string;
}

function formatRelativeTime(ts: any): string {
  if (!ts) return 'Just now';
  let date: Date;
  if (typeof ts?.toDate === 'function') {
    date = ts.toDate();
  } else if (typeof ts?.seconds === 'number') {
    date = new Date(ts.seconds * 1000);
  } else {
    date = new Date(ts);
  }
  if (isNaN(date.getTime())) return 'Just now';
  const diffSec = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));
  if (diffSec < 60) return 'Just now';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return date.toLocaleDateString();
}

function FeedCommentsDrawer({
  item,
  onToast,
}: {
  item: CentralFeedItem;
  onToast: (msg: string) => void;
}) {
  const { user, openAuthModal } = useAuth();
  const [comments, setComments] = useState<ContentComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setLoading(true);
    const unsub = subscribeFeedComments(
      item.sourceCollection,
      item.id,
      (list) => {
        setComments(list);
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, [item.sourceCollection, item.id]);

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      openAuthModal('login');
      return;
    }
    const clean = text.trim();
    if (!clean || submitting) return;
    setSubmitting(true);
    try {
      await addFeedComment(item.sourceCollection, item.id, clean, {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
        email: user.email,
      });
      setText('');
    } catch (err: any) {
      onToast(err?.message || 'Could not post comment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="px-3.5 pb-3 pt-2.5 border-t border-slate-100 bg-slate-50/70 space-y-2.5 animate-in fade-in duration-150"
      onClick={(e) => e.stopPropagation()}
    >
      <form onSubmit={handlePostComment} className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={500}
          placeholder={user ? 'Write a comment...' : 'Sign in to comment...'}
          className="flex-1 bg-white border border-slate-200 focus:border-[#1877F2] rounded-full px-3.5 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={submitting || !text.trim()}
          aria-label="Send comment"
          className="w-9 h-9 rounded-full bg-[#1877F2] hover:bg-[#166FE5] disabled:opacity-40 text-white font-bold flex items-center justify-center cursor-pointer transition shrink-0"
        >
          {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
        </button>
      </form>

      {loading ? (
        <div className="text-[11px] text-slate-500 py-1">Loading comments...</div>
      ) : comments.length === 0 ? (
        <div className="text-[11px] text-slate-500 py-1">No comments yet. Be the first!</div>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {comments.map((c) => {
            const canDelete = canUserManageItem(c.authorUid, user) || canUserManageItem(item.authorUid, user);
            return (
              <div
                key={c.id}
                className="flex items-start justify-between gap-2 bg-white border border-slate-200/80 rounded-2xl p-2.5"
              >
                <div className="flex items-start gap-2 min-w-0">
                  <CreatorAvatar
                    uid={c.authorUid}
                    fallbackPhoto={c.authorPhoto}
                    fallbackName={c.authorName}
                    className="w-6 h-6 rounded-full shrink-0 overflow-hidden border border-slate-200"
                  />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px]">
                      <span className="font-bold text-slate-900 truncate">{c.authorName}</span>
                      <span className="text-slate-400">{formatRelativeTime(c.createdAt)}</span>
                    </div>
                    <p className="text-xs text-slate-700 break-words mt-0.5">{c.text}</p>
                  </div>
                </div>
                {canDelete && (
                  <button
                    type="button"
                    onClick={() => void deleteFeedComment(item.sourceCollection, item.id, c.id)}
                    className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer shrink-0"
                    title="Delete comment"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FeedLikeButton({
  item,
  onToast,
}: {
  item: CentralFeedItem;
  onToast: (msg: string) => void;
}) {
  const { user, openAuthModal } = useAuth();
  const [isLiked, setIsLiked] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user?.uid) {
      setIsLiked(false);
      return;
    }
    const likeRef = doc(db, item.sourceCollection, item.id, 'likes', user.uid);
    return onSnapshot(
      likeRef,
      (snap) => setIsLiked(snap.exists()),
      () => setIsLiked(false)
    );
  }, [item.sourceCollection, item.id, user?.uid]);

  const handleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) {
      openAuthModal('login');
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      await toggleFeedItemLike(item.sourceCollection, item.id, {
        uid: user.uid,
        displayName: user.displayName,
        photoURL: user.photoURL,
      });
    } catch (err: any) {
      onToast(err?.message || 'Could not update like.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`flex-1 min-h-[38px] py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
        isLiked
          ? 'text-[#1877F2] bg-blue-50 hover:bg-blue-100/80'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
      }`}
    >
      <ThumbsUp className={`w-4 h-4 ${isLiked ? 'fill-current text-[#1877F2]' : ''}`} />
      <span className="tabular-nums">
        {isLiked ? 'Liked' : 'Like'}
        {item.likesCount > 0 ? ` (${item.likesCount})` : ''}
      </span>
    </button>
  );
}

export default function HomeView({
  onOpenWatchVideo,
  onOpenTab,
  onFullScreenOverlayChange,
}: HomeViewProps) {
  const { user } = useAuth();
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [activePhotoModal, setActivePhotoModal] = useState<CentralFeedItem | null>(null);
  const [activeShareModal, setActiveShareModal] = useState<ShareTarget | null>(null);
  const [statusOverlayOpen, setStatusOverlayOpen] = useState(false);
  const [failedImages, setFailedImages] = useState<Record<string, boolean>>({});

  const showToast = (msg: string) => {
    setToastMsg(msg);
    setTimeout(() => setToastMsg(null), 3000);
  };

  // --- 1. Centralized Featured Products (`catalog_products`, active only) ---
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [productsError, setProductsError] = useState<string | null>(null);

  useEffect(() => {
    setProductsLoading(true);
    setProductsError(null);
    const unsub = subscribeCatalogProducts(
      false,
      (list) => {
        const deduped = deduplicateByKeys(
          list.filter((p) => p.isActive !== false),
          (p) => [p.id]
        );
        setProducts(deduped);
        setProductsLoading(false);
      },
      (err) => {
        setProductsError(err?.message || 'Unable to sync catalog products.');
        setProductsLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // --- 2. Centralized Approved Games (`king_games`, approved & published only) ---
  const [homeGames, setHomeGames] = useState<DailyGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(true);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [activeGamePlayer, setActiveGamePlayer] = useState<DailyGame | null>(null);
  const [lastUpdateTimestamp] = useState<number | null>(() => {
    const raw = localStorage.getItem('king_daily_games_last_update_v2');
    return raw ? Number(raw) : Date.now();
  });

  useEffect(() => {
    setGamesLoading(true);
    setGamesError(null);
    const unsub = subscribePublishedGames(
      (list) => {
        setHomeGames(list);
        setGamesLoading(false);
      },
      (err) => {
        setGamesError(err?.message || 'Unable to load approved games.');
        setGamesLoading(false);
      }
    );
    return () => unsub();
  }, []);

  // --- 3. Centralized Community Social Feed (`user_posts` photos + `videos` reels) ---
  const [feedLimit, setFeedLimit] = useState(12);
  const [latestLimit, setLatestLimit] = useState(8);
  const [userPosts, setUserPosts] = useState<UserPost[]>([]);
  const [publishedVideos, setPublishedVideos] = useState<any[]>([]);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [retrySeed, setRetrySeed] = useState(0);

  const queryFetchLimit = Math.max(feedLimit, latestLimit + 12);

  useEffect(() => {
    setFeedLoading(true);
    setFeedError(null);
    let postsReady = false;
    let videosReady = false;

    const markReady = () => {
      if (postsReady && videosReady) {
        setFeedLoading(false);
      }
    };

    const unsubPosts = subscribePublishedUserPosts(
      queryFetchLimit,
      (list) => {
        setUserPosts(list);
        postsReady = true;
        markReady();
      },
      (err) => {
        setFeedError(err?.message || 'Error loading community photo posts.');
        postsReady = true;
        markReady();
      }
    );

    const unsubVideos = subscribePublishedVideos(
      queryFetchLimit,
      (list) => {
        setPublishedVideos(list);
        videosReady = true;
        markReady();
      },
      (err) => {
        setFeedError(err?.message || 'Error loading videos feed.');
        videosReady = true;
        markReady();
      }
    );

    return () => {
      unsubPosts();
      unsubVideos();
    };
  }, [queryFetchLimit, retrySeed]);

  const feedItems = useMemo(
    () => mergeHomeSocialFeed(userPosts, publishedVideos),
    [userPosts, publishedVideos]
  );

  const liveActivePhotoModal = useMemo(() => {
    if (!activePhotoModal) return null;
    return (
      feedItems.find(
        (i) => i.sourceCollection === activePhotoModal.sourceCollection && i.id === activePhotoModal.id
      ) || activePhotoModal
    );
  }, [activePhotoModal, feedItems]);

  // --- 4. Unified "Latest on KING" Feed (Photos + Videos + Products + Approved Games) ---
  const latestItems = useMemo<UnifiedLatestItem[]>(
    () =>
      mergeUnifiedLatestFeed({
        posts: userPosts,
        videos: publishedVideos,
        products,
        games: homeGames,
      }),
    [userPosts, publishedVideos, products, homeGames]
  );

  const isLatestInitialLoading =
    latestItems.length === 0 && feedLoading && productsLoading && gamesLoading;
  const latestAnyError = feedError || productsError || gamesError;
  const [latestFilter, setLatestFilter] = useState<'all' | 'posts' | 'shop' | 'games'>('all');

  const filteredLatestItems = useMemo(() => {
    if (latestFilter === 'posts') {
      return latestItems.filter((i) => i.kind === 'photo' || i.kind === 'video');
    }
    if (latestFilter === 'shop') {
      return latestItems.filter((i) => i.kind === 'product');
    }
    if (latestFilter === 'games') {
      return latestItems.filter((i) => i.kind === 'game');
    }
    return latestItems;
  }, [latestItems, latestFilter]);

  const visibleLatestItems = useMemo(
    () => filteredLatestItems.slice(0, latestLimit),
    [filteredLatestItems, latestLimit]
  );
  const hasMoreLatest =
    filteredLatestItems.length > latestLimit ||
    userPosts.length >= queryFetchLimit ||
    publishedVideos.length >= queryFetchLimit;

  const [openCommentsId, setOpenCommentsId] = useState<string | null>(null);
  const [confirmDeleteKey, setConfirmDeleteKey] = useState<string | null>(null);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [downloadingReelId, setDownloadingReelId] = useState<string | null>(null);
  const [downloadedReelIds, setDownloadedReelIds] = useState<Record<string, boolean>>({});

  // Hide TopHeader whenever any overlay/detail/player/share modal/status viewer-editor is active
  useEffect(() => {
    const isAnyOverlayOpen = Boolean(
      liveActivePhotoModal || activeGamePlayer || statusOverlayOpen || activeShareModal
    );
    onFullScreenOverlayChange?.(isAnyOverlayOpen);
  }, [
    liveActivePhotoModal,
    activeGamePlayer,
    statusOverlayOpen,
    activeShareModal,
    onFullScreenOverlayChange,
  ]);

  const openShareModalForFeedItem = (item: CentralFeedItem) => {
    const shareUrl =
      item.sourceCollection === 'videos' && typeof window !== 'undefined'
        ? `${window.location.origin}/watch/${encodeURIComponent(item.id)}`
        : item.mediaUrl || (typeof window !== 'undefined' ? window.location.origin : '');
    setActiveShareModal({
      title: item.title || item.caption || `${item.authorName} on KING`,
      text: item.caption || item.title || 'Check this out on KING',
      url: shareUrl,
    });
  };

  const openShareModalForProduct = (product: CatalogProduct) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const displayPrice =
      product.discountPrice && product.discountPrice > 0
        ? product.discountPrice
        : product.originalPrice;
    setActiveShareModal({
      title: product.name,
      text: `${product.name} — Rs. ${displayPrice.toLocaleString()} on KING SHOP`,
      url: `${origin}/catalog`,
    });
  };

  const openShareModalForGame = (game: DailyGame) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const title = game.title || game.name || 'KING Game';
    setActiveShareModal({
      title,
      text: `Play ${title} instantly on KING Play Games`,
      url: game.url || game.link || origin,
    });
  };

  const handleCopyShareLink = async () => {
    if (!activeShareModal?.url) return;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(activeShareModal.url);
      }
      showToast('Link copied to clipboard!');
      setActiveShareModal(null);
    } catch {
      showToast('Could not copy link.');
    }
  };

  const handleNativeShare = async () => {
    if (!activeShareModal) return;
    try {
      if (navigator.share) {
        await navigator.share({
          title: activeShareModal.title,
          text: activeShareModal.text,
          url: activeShareModal.url,
        });
        setActiveShareModal(null);
      } else {
        await handleCopyShareLink();
      }
    } catch {
      // User dismissed native share dialog
    }
  };

  const handleConfirmDeleteItem = async (item: CentralFeedItem) => {
    const key = `${item.sourceCollection}:${item.id}`;
    setDeletingKey(key);
    try {
      await deleteFeedItem(item.sourceCollection, item.id);
      setConfirmDeleteKey(null);
      showToast(
        item.contentType === 'video'
          ? 'Video removed from Home Feed & Videos Section.'
          : 'Post removed from Home Social Feed.'
      );
    } catch (err: any) {
      showToast(err?.message || 'Could not delete item.');
    } finally {
      setDeletingKey(null);
    }
  };

  const handleOpenVideoItem = (item: CentralFeedItem, scopeKey: string) => {
    if (onOpenWatchVideo) {
      onOpenWatchVideo(item.id);
    } else {
      setPlayingVideoId(scopeKey);
    }
  };

  const renderCompactSocialCard = (
    item: CentralFeedItem,
    cardKey: string,
    allowInlinePlay: boolean
  ) => {
    const itemKey = `${item.sourceCollection}:${item.id}`;
    const commentsOpen = openCommentsId === cardKey;
    const isPlayingHere = allowInlinePlay && playingVideoId === cardKey;
    const isOwnerOrAdmin = canUserManageItem(item.authorUid, user);
    const thumb = item.contentType === 'photo' ? item.mediaUrl : item.thumbnailUrl;

    return (
      <article
        key={cardKey}
        onClick={() => {
          if (item.contentType === 'photo') {
            setActivePhotoModal(item);
          } else {
            handleOpenVideoItem(item, cardKey);
          }
        }}
        className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl overflow-hidden shadow-sm cursor-pointer transition"
      >
        {isPlayingHere ? (
          <div className="p-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <CreatorAvatar
                  uid={item.authorUid}
                  fallbackPhoto={item.authorPhoto}
                  fallbackName={item.authorName}
                  className="w-8 h-8 rounded-full shrink-0 overflow-hidden border border-slate-200"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    <CreatorDisplayName uid={item.authorUid} fallback={item.authorName} />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Video · {formatRelativeTime(item.createdAt)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPlayingVideoId(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 cursor-pointer"
              >
                Collapse
              </button>
            </div>

            {item.caption && (
              <p className="text-xs text-slate-700 break-words">{item.caption}</p>
            )}

            <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
              <video
                src={item.mediaUrl}
                poster={item.thumbnailUrl}
                controls
                autoPlay
                playsInline
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="p-3.5 flex items-start justify-between gap-3">
            {/* Left Side: User Name, Title, Description */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <CreatorAvatar
                    uid={item.authorUid}
                    fallbackPhoto={item.authorPhoto}
                    fallbackName={item.authorName}
                    className="w-8 h-8 rounded-full shrink-0 overflow-hidden border border-slate-200"
                  />
                  <div className="min-w-0">
                    <div className="text-xs font-bold text-slate-900 truncate">
                      <CreatorDisplayName uid={item.authorUid} fallback={item.authorName} />
                    </div>
                    <div className="text-[11px] text-slate-500 flex items-center gap-1">
                      <span className="font-semibold text-[#1877F2]">
                        {item.contentType === 'photo' ? 'Photo' : 'Video'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeTime(item.createdAt)}</span>
                    </div>
                  </div>
                </div>

                {isOwnerOrAdmin && (
                  <div
                    className="flex items-center gap-1 shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {confirmDeleteKey === itemKey ? (
                      <>
                        <button
                          type="button"
                          disabled={deletingKey === itemKey}
                          onClick={() => void handleConfirmDeleteItem(item)}
                          className="px-2 py-1 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-[10px] font-bold cursor-pointer"
                        >
                          {deletingKey === itemKey ? '...' : 'Delete'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteKey(null)}
                          className="px-2 py-1 rounded-lg bg-slate-100 text-slate-600 text-[10px] font-semibold cursor-pointer"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteKey(itemKey)}
                        aria-label="Delete post"
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>

              {item.title && item.contentType === 'video' && (
                <h4 className="text-sm font-bold text-slate-900 line-clamp-1 leading-snug">
                  {item.title}
                </h4>
              )}

              {item.caption ? (
                <p className="text-xs sm:text-[13px] text-slate-700 line-clamp-3 break-words leading-relaxed">
                  {item.caption}
                </p>
              ) : (
                <p className="text-xs text-slate-500">
                  {item.contentType === 'video'
                    ? 'Tap to watch full video on KING'
                    : 'Tap to view photo details'}
                </p>
              )}
            </div>

            {/* Right Side: Compact Square/Portrait Thumbnail */}
            <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center">
              {thumb && !failedImages[cardKey] ? (
                <img
                  src={thumb}
                  alt={item.title || item.caption || 'KING Media'}
                  referrerPolicy="no-referrer"
                  loading="lazy"
                  onError={() =>
                    setFailedImages((prev) => ({ ...prev, [cardKey]: true }))
                  }
                  className="w-full h-full object-cover"
                />
              ) : item.contentType === 'video' && item.mediaUrl ? (
                <video
                  src={item.mediaUrl}
                  preload="metadata"
                  muted
                  className="w-full h-full object-cover"
                />
              ) : item.contentType === 'video' ? (
                <Film className="w-6 h-6 text-slate-400" />
              ) : (
                <ImageIcon className="w-6 h-6 text-slate-400" />
              )}

              {item.contentType === 'video' && (
                <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
                  <span className="w-8 h-8 rounded-full bg-white/95 text-[#1877F2] flex items-center justify-center shadow">
                    <Play className="w-4 h-4 fill-current ml-0.5" />
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Facebook-Style Bottom Action Bar: Like | Comment | Share */}
        <div
          className="border-t border-slate-100 px-2 py-1 flex items-center gap-1 bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          <FeedLikeButton item={item} onToast={showToast} />

          <button
            type="button"
            onClick={() => setOpenCommentsId(commentsOpen ? null : cardKey)}
            className={`flex-1 min-h-[38px] py-1.5 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition cursor-pointer ${
              commentsOpen
                ? 'bg-blue-50 text-[#1877F2]'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <MessageCircle className="w-4 h-4" />
            <span className="tabular-nums">
              Comment{item.commentsCount > 0 ? ` (${item.commentsCount})` : ''}
            </span>
          </button>

          <button
            type="button"
            onClick={() => openShareModalForFeedItem(item)}
            className="flex-1 min-h-[38px] py-1.5 px-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center gap-1.5 transition cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Share</span>
          </button>

          {item.contentType === 'video' && item.mediaUrl && (
            <button
              type="button"
              onClick={async () => {
                setDownloadingReelId(item.id);
                try {
                  await downloadVideoFile({
                    id: item.id,
                    title: item.title,
                    videoUrl: item.mediaUrl,
                    thumbnailUrl: item.thumbnailUrl,
                  });
                  setDownloadedReelIds((prev) => ({ ...prev, [item.id]: true }));
                  setTimeout(() => {
                    setDownloadedReelIds((prev) => ({ ...prev, [item.id]: false }));
                  }, 3000);
                } catch {
                  showToast('Could not save video.');
                } finally {
                  setDownloadingReelId(null);
                }
              }}
              disabled={downloadingReelId === item.id}
              aria-label="Save video"
              title="Save video"
              className="min-h-[38px] px-2.5 py-1.5 rounded-xl text-slate-500 hover:bg-slate-100 hover:text-emerald-600 flex items-center justify-center transition cursor-pointer disabled:opacity-50"
            >
              {downloadedReelIds[item.id] ? (
                <Check className="w-4 h-4 text-emerald-600" />
              ) : (
                <Download
                  className={`w-4 h-4 ${
                    downloadingReelId === item.id ? 'animate-bounce' : ''
                  }`}
                />
              )}
            </button>
          )}
        </div>

        {commentsOpen && <FeedCommentsDrawer item={item} onToast={showToast} />}
      </article>
    );
  };

  const renderCompactProductCard = (product: CatalogProduct, cardKey: string) => {
    const displayPrice =
      product.discountPrice && product.discountPrice > 0
        ? product.discountPrice
        : product.originalPrice;
    const hasDiscount =
      Boolean(product.discountPrice) &&
      (product.discountPrice || 0) < product.originalPrice;
    const discountPercent = hasDiscount
      ? Math.round(((product.originalPrice - (product.discountPrice || 0)) / product.originalPrice) * 100)
      : 0;
    const thumb = product.imageUrls[0] || '';

    return (
      <article
        key={cardKey}
        onClick={() => onOpenTab('CATALOG')}
        className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl overflow-hidden shadow-sm cursor-pointer transition"
      >
        <div className="p-3.5 flex items-start justify-between gap-3">
          {/* Left Side: Store/Author, Product Name, Price, Description */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-amber-100 text-amber-700 border border-amber-200 flex items-center justify-center shrink-0">
                <ShoppingBag className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">KING SHOP</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {product.category}
                  {product.createdAt ? ` · ${formatRelativeTime(product.createdAt)}` : ''}
                </div>
              </div>
            </div>

            <h4 className="text-sm font-bold text-slate-900 line-clamp-1 pt-0.5">
              {product.name}
            </h4>

            <div className="flex items-baseline flex-wrap gap-2 tabular-nums">
              <span className="text-sm font-black text-[#1877F2]">
                Rs. {displayPrice.toLocaleString()}
              </span>
              {hasDiscount && (
                <span className="text-xs text-slate-400 line-through">
                  Rs. {product.originalPrice.toLocaleString()}
                </span>
              )}
              {hasDiscount && discountPercent > 0 && (
                <span className="text-[10px] font-bold text-rose-600 bg-rose-50 border border-rose-200 px-1.5 py-0.5 rounded-md">
                  {discountPercent}% OFF
                </span>
              )}
              <span
                className={`text-[10px] font-semibold ${
                  product.stock > 0 ? 'text-emerald-600' : 'text-rose-600'
                }`}
              >
                {product.stock > 0 ? `· In Stock (${product.stock})` : '· Out of stock'}
              </span>
            </div>

            {product.description && (
              <p className="text-xs text-slate-600 line-clamp-2 break-words">
                {product.description}
              </p>
            )}
          </div>

          {/* Right Side: Compact Small Product Thumbnail */}
          <div className="w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            {thumb && !failedImages[cardKey] ? (
              <img
                src={thumb}
                alt={product.name}
                referrerPolicy="no-referrer"
                onError={() =>
                  setFailedImages((prev) => ({ ...prev, [cardKey]: true }))
                }
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <ShoppingBag className="w-6 h-6 text-slate-400" />
            )}
          </div>
        </div>

        {/* Bottom Compact Action Bar: Shop Now + More to Shop Section */}
        <div
          className="border-t border-slate-100 px-3 py-2 flex items-center gap-2 bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => orderOnWhatsApp(product)}
            className="flex-1 min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-bold bg-[#1877F2] hover:bg-blue-600 text-white flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm active:scale-[0.98]"
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Shop Now</span>
          </button>

          <button
            type="button"
            onClick={() => onOpenTab('CATALOG')}
            className="min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
            title="Open Shop Section"
          >
            <span>More</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => openShareModalForProduct(product)}
            className="min-h-[38px] py-1.5 px-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
            title="Share Product"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </article>
    );
  };

  const renderCompactGameCard = (game: DailyGame, cardKey: string) => {
    const thumb = game.thumbnail || game.image || '';
    const title = game.title || game.name || 'KING Game';
    const isApkOrInstall = Boolean(
      (game as any).isApk ||
      (game as any).needsInstall ||
      (game as any).type === 'apk' ||
      (game as any).gameType === 'apk' ||
      (game.category && game.category.toLowerCase().includes('apk')) ||
      (game.url && game.url.toLowerCase().includes('.apk')) ||
      (game.link && game.link.toLowerCase().includes('.apk')) ||
      (game as any).apkUrl ||
      (game as any).downloadUrl
    );
    const installTargetUrl =
      (game as any).apkUrl ||
      (game as any).downloadUrl ||
      game.url ||
      game.link ||
      '';

    return (
      <article
        key={cardKey}
        onClick={() => {
          if (isApkOrInstall) {
            if (installTargetUrl) {
              window.open(installTargetUrl, '_blank', 'noopener,noreferrer');
            } else {
              showToast('Install link not available');
            }
          } else {
            setActiveGamePlayer(game);
          }
        }}
        className="bg-white border border-slate-200/90 hover:border-slate-300 rounded-2xl overflow-hidden shadow-sm cursor-pointer transition"
      >
        <div className="p-3.5 flex items-start justify-between gap-3">
          {/* Left Side: Source, Game Title, Rating, Description */}
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 min-w-0">
              <div className="w-7 h-7 rounded-full bg-blue-50 text-[#1877F2] border border-blue-200 flex items-center justify-center shrink-0">
                <Gamepad2 className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-bold text-slate-900 truncate">KING Play Games</div>
                <div className="text-[11px] text-slate-500 truncate">
                  {game.category || 'Arcade'}
                  {game.addedAt ? ` · ${formatRelativeTime(game.addedAt)}` : ''}
                </div>
              </div>
            </div>

            <h4 className="text-sm font-bold text-slate-900 line-clamp-1 pt-0.5">
              {title}
            </h4>

            <div className="flex items-center gap-2 text-xs tabular-nums">
              <span className="font-bold text-amber-600 flex items-center gap-0.5">
                <Star className="w-3.5 h-3.5 fill-current" />
                {game.rating || 4.9}
              </span>
              <span className="text-slate-400">·</span>
              <span className="text-slate-500 font-medium">
                {isApkOrInstall ? 'Android APK' : (game.source || 'Instant HTML5')}
              </span>
            </div>

            <p className="text-xs text-slate-600 line-clamp-2">
              {game.description || (isApkOrInstall ? 'Install and play on your device.' : 'Play instantly inside KING with no download required.')}
            </p>
          </div>

          {/* Right Side: Compact Small Game Thumbnail */}
          <div className="relative w-24 h-24 sm:w-28 sm:h-28 shrink-0 rounded-xl bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center">
            {thumb && !failedImages[cardKey] ? (
              <img
                src={thumb}
                alt={title}
                referrerPolicy="no-referrer"
                onError={() =>
                  setFailedImages((prev) => ({ ...prev, [cardKey]: true }))
                }
                className="w-full h-full object-cover"
                loading="lazy"
              />
            ) : (
              <Gamepad2 className="w-6 h-6 text-[#1877F2]" />
            )}
            <div className="absolute inset-0 bg-black/15 flex items-center justify-center">
              <span className="w-8 h-8 rounded-full bg-white/95 text-[#1877F2] flex items-center justify-center shadow">
                {isApkOrInstall ? (
                  <Download className="w-4 h-4 text-[#1877F2]" />
                ) : (
                  <Play className="w-4 h-4 fill-current ml-0.5" />
                )}
              </span>
            </div>
          </div>
        </div>

        {/* Bottom Compact Action Bar: BLUE Install or GREEN Play + small gray More to Game Section */}
        <div
          className="border-t border-slate-100 px-3 py-2 flex items-center gap-2 bg-white"
          onClick={(e) => e.stopPropagation()}
        >
          {isApkOrInstall ? (
            <button
              type="button"
              onClick={() => {
                if (installTargetUrl) {
                  window.open(installTargetUrl, '_blank', 'noopener,noreferrer');
                } else {
                  showToast('Install link not available');
                }
              }}
              className="flex-1 min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-bold bg-[#1877F2] hover:bg-blue-600 text-white flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <Download className="w-4 h-4" />
              <span>Install</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setActiveGamePlayer(game)}
              className="flex-1 min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center justify-center gap-1.5 transition cursor-pointer shadow-sm active:scale-[0.98]"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>Play</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => onOpenTab('games')}
            className="min-h-[38px] py-1.5 px-3 rounded-xl text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
            title="Open Game Section"
          >
            <span>More</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={() => openShareModalForGame(game)}
            className="min-h-[38px] py-1.5 px-2.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center gap-1 transition cursor-pointer shrink-0"
            title="Share Game"
          >
            <Share2 className="w-4 h-4" />
            <span className="hidden sm:inline">Share</span>
          </button>
        </div>
      </article>
    );
  };

  return (
    <div className="min-h-screen bg-[#F0F2F5] text-slate-900 pt-[60px] pb-24 space-y-4">
      {toastMsg && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-[160] bg-slate-900 text-white font-bold text-xs px-4 py-2 rounded-full shadow-lg animate-in fade-in">
          {toastMsg}
        </div>
      )}

      {/* 1. KING 24h Status Stories Bar (Top below Fixed Home Header) */}
      <StatusBar lightMode={true} onOverlayChange={setStatusOverlayOpen} />

      {/* 2. Unified "Latest on KING" Feed (Directly Below StatusBar) */}
      <section id="latest-on-king-section" className="px-3.5 pt-1 space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1877F2] flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-none">
                Latest on <span className="text-[#1877F2]">KING</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Newest on Top · Games · User Posts · KING SHOP
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-slate-500 tabular-nums">
            {filteredLatestItems.length > 0 ? `${filteredLatestItems.length} live` : ''}
          </span>
        </div>

        {/* Real-time Type Filter Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
          {[
            { id: 'all', label: 'All (Newest)' },
            { id: 'posts', label: 'User Posts' },
            { id: 'shop', label: 'KING SHOP' },
            { id: 'games', label: 'Games' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setLatestFilter(tab.id as any)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition cursor-pointer whitespace-nowrap shrink-0 ${
                latestFilter === tab.id
                  ? 'bg-[#1877F2] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {latestAnyError && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 text-xs text-rose-700">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{latestAnyError}</span>
            </div>
            <button
              type="button"
              onClick={() => setRetrySeed((s) => s + 1)}
              className="min-h-[36px] px-3 py-1 rounded-xl bg-rose-600 text-white font-bold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        {isLatestInitialLoading ? (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin text-[#1877F2]" />
            <span>Loading latest KING updates...</span>
          </div>
        ) : visibleLatestItems.length === 0 ? (
          <div className="p-5 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-1.5 shadow-sm">
            <p className="text-xs font-bold text-slate-800">No live posts published yet</p>
            <p className="text-[11px] text-slate-500">
              Tap the blue + icon in the top bar to share a photo or video.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {visibleLatestItems.map((entry) => {
              if ((entry.kind === 'photo' || entry.kind === 'video') && entry.postItem) {
                return renderCompactSocialCard(
                  entry.postItem,
                  `latest-${entry.uniqueKey}`,
                  false
                );
              }
              if (entry.kind === 'product' && entry.productItem) {
                return renderCompactProductCard(
                  entry.productItem,
                  `latest-${entry.uniqueKey}`
                );
              }
              if (entry.kind === 'game' && entry.gameItem) {
                return renderCompactGameCard(
                  entry.gameItem,
                  `latest-${entry.uniqueKey}`
                );
              }
              return null;
            })}

            {hasMoreLatest && (
              <button
                type="button"
                onClick={() => setLatestLimit((prev) => prev + 8)}
                className="w-full min-h-[44px] py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-[#1877F2] transition cursor-pointer shadow-sm"
              >
                Load More Latest Content
              </button>
            )}
          </div>
        )}
      </section>

      {/* 3. KING SHOP Featured Products (Same Compact White Facebook Card Style) */}
      <section className="px-3.5 space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 flex items-center gap-1.5 leading-none">
                <span>KING SHOP</span>
                <span className="text-[#1877F2]">Catalog</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Live Products · Direct WhatsApp Order
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenTab('CATALOG')}
            className="text-xs font-bold text-[#1877F2] hover:text-blue-700 flex items-center gap-0.5 transition cursor-pointer"
          >
            OPEN SHOP
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {productsError && (
          <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{productsError}</span>
          </div>
        )}

        {productsLoading ? (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin text-[#1877F2]" />
            <span>Loading KING SHOP products...</span>
          </div>
        ) : products.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center text-xs text-slate-500 shadow-sm">
            No active products in catalog yet.
          </div>
        ) : (
          <div className="space-y-3">
            {products.slice(0, 6).map((product) =>
              renderCompactProductCard(product, `shop-sec-${product.id}`)
            )}
          </div>
        )}
      </section>

      {/* 4. Approved KING Play Games Section (Same Compact White Facebook Card Style) */}
      <section className="px-3.5 space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1877F2] flex items-center justify-center">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-none">
                KING PLAY GAMES
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Instant HTML5 · {formatLastUpdated(lastUpdateTimestamp)}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenTab('games')}
            className="text-xs font-bold text-[#1877F2] hover:text-blue-700 flex items-center gap-0.5 transition cursor-pointer"
          >
            ALL GAMES
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {gamesError && (
          <div className="p-2.5 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-700 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{gamesError}</span>
          </div>
        )}

        {gamesLoading && homeGames.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-slate-200 flex items-center justify-center gap-2 text-xs text-slate-500 shadow-sm">
            <Loader2 className="w-4 h-4 animate-spin text-[#1877F2]" />
            <span>Loading approved games...</span>
          </div>
        ) : homeGames.length === 0 ? (
          <div className="p-6 rounded-2xl bg-white border border-dashed border-slate-300 text-center space-y-2 shadow-sm">
            <p className="text-xs text-slate-600">No featured approved games in database yet.</p>
            <button
              type="button"
              onClick={() => onOpenTab('games')}
              className="text-xs font-bold text-[#1877F2] underline cursor-pointer"
            >
              Browse Full Games Arcade →
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {homeGames.slice(0, 6).map((g, index) =>
              renderCompactGameCard(g, `games-sec-${g.id || index}`)
            )}
          </div>
        )}
      </section>

      {/* 5. Centralized Community Social Feed (Same Compact White Card Style) */}
      <section className="px-3.5 space-y-3">
        <div className="flex items-center justify-between px-0.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1877F2] flex items-center justify-center">
              <Film className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 leading-none">
                KING <span className="text-[#1877F2]">Community Feed</span>
              </h2>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Photos &amp; Videos · Real-time
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenTab('videos')}
            className="text-xs font-bold text-[#1877F2] hover:text-blue-700 flex items-center gap-0.5 transition cursor-pointer"
          >
            VIDEOS TAB
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {feedError && (
          <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 flex items-center justify-between gap-2 text-xs text-rose-700">
            <div className="flex items-center gap-2 min-w-0">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="truncate">{feedError}</span>
            </div>
            <button
              type="button"
              onClick={() => setRetrySeed((s) => s + 1)}
              className="px-2.5 py-1 rounded-lg bg-rose-600 text-white font-bold flex items-center gap-1 cursor-pointer shrink-0"
            >
              <RotateCcw className="w-3 h-3" />
              Retry
            </button>
          </div>
        )}

        <div className="space-y-3">
          {feedLoading && feedItems.length === 0 ? (
            <div className="bg-white border border-slate-200 rounded-2xl p-8 flex flex-col items-center justify-center gap-2 text-xs text-slate-500 shadow-sm">
              <Loader2 className="w-6 h-6 animate-spin text-[#1877F2]" />
              <span>Loading KING Social Feed...</span>
            </div>
          ) : feedItems.length === 0 ? (
            <div className="bg-white border border-dashed border-slate-300 rounded-2xl p-6 text-center space-y-2 shadow-sm">
              <Film className="w-8 h-8 text-[#1877F2] mx-auto" />
              <h4 className="text-xs font-bold text-slate-800">No Posts Published Yet</h4>
              <p className="text-[11px] text-slate-500">
                Tap the blue + icon in the top bar to upload a photo or video from your gallery!
              </p>
            </div>
          ) : (
            feedItems.map((item) =>
              renderCompactSocialCard(
                item,
                `community-${item.sourceCollection}:${item.id}`,
                true
              )
            )
          )}

          {feedItems.length >= feedLimit && (
            <button
              type="button"
              onClick={() => setFeedLimit((prev) => prev + 12)}
              className="w-full min-h-[44px] py-2.5 rounded-2xl bg-white hover:bg-slate-50 border border-slate-200 text-xs font-bold text-[#1877F2] transition cursor-pointer shadow-sm"
            >
              Load More Community Posts
            </button>
          )}
        </div>
      </section>

      {/* 6. AdMob Banner */}
      <section className="px-3.5 pt-1">
        <AdMobBannerAd />
      </section>

      {/* Inline Full-Screen Game Player */}
      {activeGamePlayer && (
        <GamePlayer
          gameUrl={activeGamePlayer.url || activeGamePlayer.link || ''}
          gameTitle={activeGamePlayer.title || activeGamePlayer.name || 'KING Game'}
          onClose={() => setActiveGamePlayer(null)}
        />
      )}

      {/* Light-Mode Photo Post Detail Modal */}
      {liveActivePhotoModal && (
        <div
          className="fixed inset-0 z-[130] bg-black/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setActivePhotoModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Photo post details"
        >
          <div
            className="w-full max-w-md bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-2xl max-h-[92vh] overflow-y-auto text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 p-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2.5 min-w-0">
                <CreatorAvatar
                  uid={liveActivePhotoModal.authorUid}
                  fallbackPhoto={liveActivePhotoModal.authorPhoto}
                  fallbackName={liveActivePhotoModal.authorName}
                  className="w-9 h-9 rounded-full shrink-0 overflow-hidden border border-slate-200"
                />
                <div className="min-w-0">
                  <div className="text-xs font-bold text-slate-900 truncate">
                    <CreatorDisplayName
                      uid={liveActivePhotoModal.authorUid}
                      fallback={liveActivePhotoModal.authorName}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    Photo · {formatRelativeTime(liveActivePhotoModal.createdAt)}
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActivePhotoModal(null)}
                aria-label="Close photo"
                className="min-h-[40px] min-w-[40px] rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {liveActivePhotoModal.caption && (
              <p className="px-4 pt-3 text-xs sm:text-sm text-slate-800 break-words">
                {liveActivePhotoModal.caption}
              </p>
            )}

            <div className="p-3.5 space-y-3">
              <div className="rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 flex items-center justify-center max-h-[55vh]">
                <img
                  src={liveActivePhotoModal.mediaUrl}
                  alt={liveActivePhotoModal.caption || 'KING Photo'}
                  referrerPolicy="no-referrer"
                  className="w-full max-h-[55vh] object-contain"
                />
              </div>

              <div className="border-t border-slate-100 pt-2 flex items-center gap-1">
                <FeedLikeButton item={liveActivePhotoModal} onToast={showToast} />
                <button
                  type="button"
                  onClick={() => openShareModalForFeedItem(liveActivePhotoModal)}
                  className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share</span>
                </button>
              </div>
            </div>

            <FeedCommentsDrawer item={liveActivePhotoModal} onToast={showToast} />
          </div>
        </div>
      )}

      {/* Full-Screen Share Modal Sheet */}
      {activeShareModal && (
        <div
          className="fixed inset-0 z-[140] bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4 animate-in fade-in duration-150"
          onClick={() => setActiveShareModal(null)}
          role="dialog"
          aria-modal="true"
          aria-label="Share content"
        >
          <div
            className="w-full max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 p-4 space-y-3 shadow-2xl text-slate-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="min-w-0 pr-2">
                <h3 className="text-sm font-extrabold text-slate-900 truncate">
                  Share on KING
                </h3>
                <p className="text-xs text-slate-500 truncate mt-0.5">
                  {activeShareModal.title}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveShareModal(null)}
                aria-label="Close share dialog"
                className="min-w-[40px] min-h-[40px] rounded-full bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2">
              <button
                type="button"
                onClick={() => void handleNativeShare()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-[#1877F2] hover:bg-[#166FE5] text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                <span>Share via Device Apps</span>
              </button>

              <button
                type="button"
                onClick={() => void handleCopyShareLink()}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Copy className="w-4 h-4" />
                <span>Copy Link</span>
              </button>

              <a
                href={`https://wa.me/?text=${encodeURIComponent(
                  `${activeShareModal.text}\n${activeShareModal.url}`
                )}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setActiveShareModal(null)}
                className="w-full min-h-[44px] px-4 py-2.5 rounded-2xl bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Send via WhatsApp</span>
              </a>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
