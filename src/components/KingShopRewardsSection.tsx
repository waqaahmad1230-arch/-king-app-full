import React, { useState, useEffect, useCallback } from 'react';
import {
  Coins,
  Calendar,
  Gamepad2,
  Target,
  Trophy,
  Gift,
  Sparkles,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  X,
  Flame,
  Copy,
  Check,
  History,
  Lock,
  Share2,
  Ticket,
  Clock,
  Loader2,
  Shield,
  Award,
  Crown,
  Gem,
  Eye,
  EyeOff,
  ShoppingBag,
  TrendingUp,
  Brain,
  Grid,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import {
  claimDailyCheckin,
  completeMission,
  fetchKingWallet,
  fetchLeaderboard,
  fetchQuizQuestion,
  redeemReward,
  startPuzzleSession,
  startScratchSession,
  startMemorySession,
  flipMemoryCards,
  submitGameReward,
  claimAchievement,
  updateLeaderboardPrivacy,
  trackMissionActivity,
  type KingShopWalletResponse,
  type LeaderboardEntry,
  type LeaderboardMode,
  type QuizQuestionChallenge,
  type VipTierId,
} from '../services/kingShopFrontendService';

interface KingShopRewardsSectionProps {
  onBalanceUpdate?: (balance: number) => void;
  refreshTrigger?: number;
}

type ModalType =
  | 'none'
  | 'wallet'
  | 'streak'
  | 'arcade'
  | 'missions'
  | 'vip'
  | 'achievements'
  | 'leaderboard'
  | 'redeem'
  | 'spin'
  | 'quiz'
  | 'puzzle'
  | 'scratch'
  | 'memory';

const DEFAULT_SPIN_SEGMENTS = [10, 15, 20, 25, 30, 45];
const DEFAULT_SCRATCH_SEGMENTS = [10, 15, 20, 30, 50];

export default function KingShopRewardsSection({
  onBalanceUpdate,
  refreshTrigger = 0,
}: KingShopRewardsSectionProps) {
  const { user, loading: authLoading, openAuthModal } = useAuth();

  const [wallet, setWallet] = useState<KingShopWalletResponse | null>(null);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [leaderboardMode, setLeaderboardMode] = useState<LeaderboardMode>('weekly');
  const [leaderboardKey, setLeaderboardKey] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [walletError, setWalletError] = useState<string | null>(null);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<ModalType>('none');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [missionTab, setMissionTab] = useState<'daily' | 'weekly'>('daily');

  // Spin Wheel State
  const [isSpinning, setIsSpinning] = useState(false);
  const [spinResult, setSpinResult] = useState<number | null>(null);
  const [wheelRotation, setWheelRotation] = useState(0);

  // Quiz State
  const [quizChallenge, setQuizChallenge] = useState<QuizQuestionChallenge | null>(null);
  const [quizLoading, setQuizLoading] = useState(false);
  const [quizSelected, setQuizSelected] = useState<number | null>(null);
  const [quizCorrectIndex, setQuizCorrectIndex] = useState<number | null>(null);
  const [quizWon, setQuizWon] = useState<boolean | null>(null);

  // Puzzle State
  const [puzzleSessionId, setPuzzleSessionId] = useState<string | null>(null);
  const [puzzleTiles, setPuzzleTiles] = useState<number[]>([1, 2, 3, 4, 5, 6, 7, 8, 0]);
  const [puzzleMoves, setPuzzleMoves] = useState<number[]>([]);
  const [puzzleLoading, setPuzzleLoading] = useState(false);
  const [puzzleCompleted, setPuzzleCompleted] = useState(false);

  // Scratch Card State
  const [scratchSessionId, setScratchSessionId] = useState<string | null>(null);
  const [scratchedCells, setScratchedCells] = useState<number[]>([]);
  const [scratchRevealedSymbols, setScratchRevealedSymbols] = useState<string[]>([]);
  const [scratchWonCoins, setScratchWonCoins] = useState<number | null>(null);
  const [scratchLoading, setScratchLoading] = useState(false);

  // Memory Match State
  const [memorySessionId, setMemorySessionId] = useState<string | null>(null);
  const [memoryFlippedIndices, setMemoryFlippedIndices] = useState<number[]>([]);
  const [memoryMatchedIndices, setMemoryMatchedIndices] = useState<number[]>([]);
  const [memoryCardsMap, setMemoryCardsMap] = useState<Record<number, string>>({});
  const [memoryMoves, setMemoryMoves] = useState(0);
  const [memoryCompleted, setMemoryCompleted] = useState(false);
  const [memoryLoading, setMemoryLoading] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3600);
  }, []);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setWalletError(null);
      setLeaderboardError(null);
      const lbPromise = fetchLeaderboard(leaderboardMode).catch((lbErr: any) => {
        setLeaderboardError(lbErr?.message || 'Unable to load leaderboard.');
        return { type: leaderboardMode, key: '', weekKey: '', leaderboard: [] as LeaderboardEntry[] };
      });

      if (!user) {
        const lbData = await lbPromise;
        setWallet(null);
        setLeaderboard(lbData.leaderboard || []);
        setLeaderboardKey(lbData.key || lbData.weekKey || '');
        return;
      }

      const [walletData, lbData] = await Promise.all([fetchKingWallet(), lbPromise]);
      setWallet(walletData);
      setLeaderboard(lbData.leaderboard || []);
      setLeaderboardKey(lbData.key || lbData.weekKey || walletData.weekKey || '');
      if (onBalanceUpdate && walletData?.balance !== undefined) {
        onBalanceUpdate(walletData.balance);
      }
    } catch (err: any) {
      setWalletError(err?.message || 'Unable to connect to KING Coins server.');
      console.warn('Notice loading KING Shop rewards:', err?.message || err);
    } finally {
      setLoading(false);
    }
  }, [user, leaderboardMode, onBalanceUpdate]);

  useEffect(() => {
    if (!authLoading) {
      void loadData();
    }
  }, [authLoading, loadData, refreshTrigger]);

  const requireSignedIn = (): boolean => {
    if (!user) {
      openAuthModal('login');
      return false;
    }
    return true;
  };

  const loadLeaderboardForMode = async (mode: LeaderboardMode) => {
    setLeaderboardMode(mode);
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const data = await fetchLeaderboard(mode);
      setLeaderboard(data.leaderboard || []);
      setLeaderboardKey(data.key || data.weekKey || '');
    } catch (err: any) {
      setLeaderboardError(err?.message || 'Failed to load leaderboard');
    } finally {
      setLeaderboardLoading(false);
    }
  };

  const handleOpenModal = async (target: ModalType) => {
    if (target === 'leaderboard') {
      setActiveModal('leaderboard');
      void loadLeaderboardForMode(leaderboardMode);
      return;
    }

    if (!requireSignedIn()) return;
    setActiveModal(target);

    if (target === 'quiz') {
      void loadNewQuizQuestion();
    } else if (target === 'puzzle') {
      void startNewPuzzle();
    } else if (target === 'scratch') {
      void startNewScratchCard();
    } else if (target === 'memory') {
      void startNewMemoryGame();
    }
  };

  const handleClaimCheckin = async () => {
    if (!requireSignedIn() || busyAction) return;
    setBusyAction('checkin');
    try {
      const res = await claimDailyCheckin();
      const bonusText = res.vipBonusCoins ? ` (includes +${res.vipBonusCoins} ${res.vipTier?.toUpperCase()} VIP)` : '';
      showToast(`+${res.added} KING Coins claimed! Streak: Day ${res.streak}${bonusText}`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Check-in failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleTrackShareMission = async () => {
    if (!requireSignedIn() || busyAction) return;
    setBusyAction('track_share');
    try {
      const shareUrl = typeof window !== 'undefined' ? window.location.origin : 'https://king-5f52e.web.app';
      if (typeof navigator !== 'undefined' && navigator.share) {
        try {
          await navigator.share({
            title: 'KING SHOP - Luxury Mixed Collection',
            text: 'Check out KING SHOP and earn KING Coins!',
            url: shareUrl,
          });
        } catch {
          // ignore native cancel
        }
      } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl).catch(() => {});
      }

      await trackMissionActivity('share_shop', 'shop_link_share');
      showToast('Shop link shared & verified! Tap Claim to collect coins.');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Could not verify share');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCompleteMission = async (missionId: string) => {
    if (!requireSignedIn() || busyAction) return;
    setBusyAction(`mission_${missionId}`);
    try {
      const res = await completeMission(missionId);
      showToast(`Mission completed! +${res.added} KING Coins earned!`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Mission failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleClaimAchievement = async (achievementId: string) => {
    if (!requireSignedIn() || busyAction) return;
    setBusyAction(`ach_${achievementId}`);
    try {
      const res = await claimAchievement(achievementId);
      showToast(`Achievement unlocked! +${res.added} KING Coins added!`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Achievement claim failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleToggleLeaderboardPrivacy = async () => {
    if (!requireSignedIn() || !wallet || busyAction === 'privacy_toggle') return;
    setBusyAction('privacy_toggle');
    const nextState = !wallet.leaderboardOptOut;
    try {
      await updateLeaderboardPrivacy(nextState);
      showToast(nextState ? 'You are now hidden from public leaderboards.' : 'You are now visible on leaderboards!');
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Failed to update privacy preference');
    } finally {
      setBusyAction(null);
    }
  };

  const handleRedeem = async (rewardId: string) => {
    if (!requireSignedIn() || busyAction) return;
    setBusyAction(`redeem_${rewardId}`);
    try {
      const res = await redeemReward(rewardId);
      showToast(`Redeemed! Code: ${res.code}`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Redemption failed');
    } finally {
      setBusyAction(null);
    }
  };

  const handleCopyCoupon = (code: string) => {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      void navigator.clipboard.writeText(code);
      setCopiedCode(code);
      showToast(`Coupon ${code} copied! Paste in WhatsApp checkout.`);
      setTimeout(() => setCopiedCode(null), 2200);
    }
  };

  // --- LUCKY SPIN ---
  const spinConfig = wallet?.config?.games?.spin;
  const spinSegments =
    Array.isArray(spinConfig?.spinSegments) && spinConfig.spinSegments.length === 6
      ? spinConfig.spinSegments
      : DEFAULT_SPIN_SEGMENTS;

  const handleSpinWheel = async () => {
    if (!requireSignedIn() || isSpinning) return;
    setIsSpinning(true);
    setSpinResult(null);
    try {
      const res = await submitGameReward({ gameType: 'spin' });
      const segIdx = typeof res.segmentIndex === 'number' ? res.segmentIndex : 0;
      const sliceDeg = 360 / spinSegments.length;
      const targetAngle = 360 - segIdx * sliceDeg - sliceDeg / 2;
      setWheelRotation((prev) => prev + 1440 + ((targetAngle - (prev % 360) + 360) % 360));

      setTimeout(() => {
        setSpinResult(res.added);
        setIsSpinning(false);
        showToast(`Lucky Spin Won +${res.added} KING Coins!`);
        void loadData();
      }, 1600);
    } catch (err: any) {
      setIsSpinning(false);
      showToast(err.message || 'Spin limit reached for today.');
    }
  };

  // --- TRIVIA QUIZ ---
  const loadNewQuizQuestion = async () => {
    setQuizLoading(true);
    setQuizSelected(null);
    setQuizCorrectIndex(null);
    setQuizWon(null);
    try {
      const q = await fetchQuizQuestion();
      setQuizChallenge(q);
    } catch (err: any) {
      showToast(err.message || 'Could not load quiz');
    } finally {
      setQuizLoading(false);
    }
  };

  const handleQuizSubmit = async (selectedOption: number) => {
    if (!quizChallenge || quizSelected !== null || busyAction) return;
    setBusyAction('quiz_submit');
    setQuizSelected(selectedOption);

    try {
      const res = await submitGameReward({
        gameType: 'quiz',
        challengeId: quizChallenge.challengeId,
        selectedOption,
      });
      setQuizCorrectIndex(typeof res.correctIndex === 'number' ? res.correctIndex : null);
      setQuizWon(Boolean(res.won));
      if (res.won) {
        showToast(`Correct! +${res.added} KING Coins earned!`);
      } else {
        showToast('Incorrect answer! Try another question if plays remain.');
      }
      await loadData();
    } catch (err: any) {
      setQuizSelected(null);
      showToast(err.message || 'Quiz submission failed.');
    } finally {
      setBusyAction(null);
    }
  };

  // --- SLIDING PUZZLE ---
  const startNewPuzzle = async () => {
    setPuzzleLoading(true);
    setPuzzleCompleted(false);
    setPuzzleMoves([]);
    try {
      const session = await startPuzzleSession();
      setPuzzleSessionId(session.sessionId);
      setPuzzleTiles(session.board);
    } catch (err: any) {
      showToast(err.message || 'Could not start puzzle');
    } finally {
      setPuzzleLoading(false);
    }
  };

  const handlePuzzleClick = async (index: number) => {
    if (puzzleCompleted || !puzzleSessionId || puzzleLoading || busyAction === 'puzzle_submit') return;
    const emptyIdx = puzzleTiles.indexOf(0);
    const row = Math.floor(index / 3);
    const col = index % 3;
    const emptyRow = Math.floor(emptyIdx / 3);
    const emptyCol = emptyIdx % 3;
    const isAdjacent = Math.abs(row - emptyRow) + Math.abs(col - emptyCol) === 1;

    if (!isAdjacent) return;

    const nextTiles = [...puzzleTiles];
    nextTiles[emptyIdx] = nextTiles[index];
    nextTiles[index] = 0;
    const nextMoves = [...puzzleMoves, index];

    setPuzzleTiles(nextTiles);
    setPuzzleMoves(nextMoves);

    const isWon = nextTiles.every((val, idx) => val === (idx + 1) % 9);
    if (isWon) {
      setPuzzleCompleted(true);
      setBusyAction('puzzle_submit');
      try {
        const res = await submitGameReward({
          gameType: 'puzzle',
          sessionId: puzzleSessionId,
          moves: nextMoves,
        });
        showToast(`Puzzle Verified & Solved! +${res.added} KING Coins!`);
        await loadData();
      } catch (err: any) {
        showToast(err.message || 'Puzzle reward could not be claimed.');
      } finally {
        setBusyAction(null);
      }
    }
  };

  // --- SCRATCH & WIN ---
  const startNewScratchCard = async () => {
    setScratchLoading(true);
    setScratchedCells([]);
    setScratchRevealedSymbols([]);
    setScratchWonCoins(null);
    try {
      const res = await startScratchSession();
      setScratchSessionId(res.sessionId);
    } catch (err: any) {
      showToast(err.message || 'Could not start Scratch card');
    } finally {
      setScratchLoading(false);
    }
  };

  const handleScratchCell = (idx: number) => {
    if (scratchWonCoins !== null || scratchedCells.includes(idx) || scratchLoading) return;
    setScratchedCells((prev) => [...prev, idx]);
  };

  const handleClaimScratch = async () => {
    if (!scratchSessionId || scratchedCells.length < 3 || busyAction === 'scratch_claim') return;
    setBusyAction('scratch_claim');
    try {
      const res = await submitGameReward({
        gameType: 'scratch',
        sessionId: scratchSessionId,
        scratchedCells,
      });
      setScratchWonCoins(res.added);
      if (Array.isArray(res.gridSymbols)) {
        setScratchRevealedSymbols(res.gridSymbols);
      }
      showToast(`Scratch & Win revealed! +${res.added} KING Coins!`);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Scratch reward claim failed');
    } finally {
      setBusyAction(null);
    }
  };

  // --- MEMORY MATCH ---
  const startNewMemoryGame = async () => {
    setMemoryLoading(true);
    setMemoryFlippedIndices([]);
    setMemoryMatchedIndices([]);
    setMemoryCardsMap({});
    setMemoryMoves(0);
    setMemoryCompleted(false);
    try {
      const res = await startMemorySession();
      setMemorySessionId(res.sessionId);
    } catch (err: any) {
      showToast(err.message || 'Could not start Memory Match');
    } finally {
      setMemoryLoading(false);
    }
  };

  const handleMemoryCardClick = async (idx: number) => {
    if (
      memoryCompleted ||
      !memorySessionId ||
      memoryMatchedIndices.includes(idx) ||
      memoryFlippedIndices.includes(idx) ||
      memoryFlippedIndices.length >= 2 ||
      memoryLoading
    ) {
      return;
    }

    const nextFlipped = [...memoryFlippedIndices, idx];
    setMemoryFlippedIndices(nextFlipped);

    if (nextFlipped.length === 2) {
      setMemoryLoading(true);
      try {
        const res = await flipMemoryCards(memorySessionId, [nextFlipped[0], nextFlipped[1]]);
        setMemoryMoves(res.moves);
        setMemoryCardsMap((prev) => ({
          ...prev,
          [nextFlipped[0]]: res.cards[0],
          [nextFlipped[1]]: res.cards[1],
        }));

        if (res.matched) {
          setMemoryMatchedIndices((prev) => [...prev, nextFlipped[0], nextFlipped[1]]);
          setMemoryFlippedIndices([]);
          setMemoryLoading(false);

          if (res.completed) {
            setMemoryCompleted(true);
            const claimRes = await submitGameReward({
              gameType: 'memory',
              sessionId: memorySessionId,
            });
            showToast(`All pairs matched! +${claimRes.added} KING Coins won!`);
            await loadData();
          }
        } else {
          setTimeout(() => {
            setMemoryFlippedIndices([]);
            setMemoryLoading(false);
          }, 900);
        }
      } catch (err: any) {
        setMemoryFlippedIndices([]);
        setMemoryLoading(false);
        showToast(err.message || 'Card flip failed');
      }
    }
  };

  const isCheckedInToday = Boolean(wallet?.checkinClaimedToday);
  const dailyBonusAmount = wallet?.nextCheckinCoins ?? 25;
  const activeCoupons = (wallet?.coupons || []).filter((c) => c.status === 'active');
  const rewardsPaused = wallet?.config?.rewardsEnabled === false;

  const streakDays = wallet?.config?.streakConfig?.schedule || [20, 25, 35, 40, 50, 60, 100];
  const currentStreak = wallet?.streak || 0;
  const currentCycleDay = wallet?.streakCycleDay || 1;

  const spinPlays = wallet?.gameLimitsToday?.spin?.plays ?? 0;
  const spinMax = wallet?.gameLimitsToday?.spin?.max ?? 3;
  const quizPlays = wallet?.gameLimitsToday?.quiz?.plays ?? 0;
  const quizMax = wallet?.gameLimitsToday?.quiz?.max ?? 5;
  const puzzlePlays = wallet?.gameLimitsToday?.puzzle?.plays ?? 0;
  const puzzleMax = wallet?.gameLimitsToday?.puzzle?.max ?? 5;
  const scratchPlays = wallet?.gameLimitsToday?.scratch?.plays ?? 0;
  const scratchMax = wallet?.gameLimitsToday?.scratch?.max ?? 1;
  const memoryPlays = wallet?.gameLimitsToday?.memory?.plays ?? 0;
  const memoryMax = wallet?.gameLimitsToday?.memory?.max ?? 2;

  const spinEnabled = !rewardsPaused && (wallet?.config?.games?.spin?.enabled ?? true);
  const quizEnabled = !rewardsPaused && (wallet?.config?.games?.quiz?.enabled ?? true);
  const puzzleEnabled = !rewardsPaused && (wallet?.config?.games?.puzzle?.enabled ?? true);
  const scratchEnabled = !rewardsPaused && (wallet?.config?.games?.scratch?.enabled ?? true);
  const memoryEnabled = !rewardsPaused && (wallet?.config?.games?.memory?.enabled ?? true);

  const vipProfile = wallet?.vip;
  const vipTiers = wallet?.config?.vipConfig?.tiers;
  const vipTiersOrder: VipTierId[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

  const getTierColor = (t: string) => {
    switch (t) {
      case 'diamond':
        return 'from-cyan-400 to-blue-500 text-cyan-200 border-cyan-400/50';
      case 'platinum':
        return 'from-slate-200 to-slate-400 text-slate-100 border-slate-300/50';
      case 'gold':
        return 'from-amber-400 to-yellow-500 text-amber-200 border-amber-400/50';
      case 'silver':
        return 'from-slate-300 to-zinc-400 text-slate-200 border-zinc-400/50';
      default:
        return 'from-amber-700 to-amber-900 text-amber-300 border-amber-700/50';
    }
  };

  const getAchievementIcon = (iconName: string) => {
    switch (iconName) {
      case 'flame':
        return <Flame className="w-4 h-4 text-orange-400" />;
      case 'crown':
        return <Crown className="w-4 h-4 text-amber-400" />;
      case 'brain':
        return <Brain className="w-4 h-4 text-cyan-400" />;
      case 'grid':
        return <Grid className="w-4 h-4 text-emerald-400" />;
      case 'shield':
        return <Shield className="w-4 h-4 text-slate-300" />;
      case 'award':
        return <Award className="w-4 h-4 text-yellow-400" />;
      case 'gem':
        return <Gem className="w-4 h-4 text-cyan-300" />;
      case 'coins':
        return <Coins className="w-4 h-4 text-amber-400" />;
      case 'gamepad':
        return <Gamepad2 className="w-4 h-4 text-purple-400" />;
      default:
        return <Sparkles className="w-4 h-4 text-amber-400" />;
    }
  };

  return (
    <div className="space-y-3 mb-4">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[200] bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs px-4 py-2.5 rounded-2xl shadow-2xl border border-white/40 animate-in fade-in slide-in-from-top-4 max-w-[90vw] text-center">
          {toastMessage}
        </div>
      )}

      {/* 1. WALLET BANNER & 2. DAILY STREAK ENTRY */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#121212] via-[#0A0A0A] to-[#060a14] border-2 border-amber-500/40 p-4 shadow-2xl">
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-cyan-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => void handleOpenModal('wallet')}
            className="flex items-center gap-3 min-w-0 flex-1 text-left group cursor-pointer"
          >
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-amber-500 to-yellow-400 p-0.5 shadow-lg shadow-amber-500/30 flex items-center justify-center shrink-0">
              <div className="w-full h-full bg-[#0A0A0A] rounded-[14px] flex items-center justify-center text-amber-300">
                <Coins className="w-6 h-6 animate-pulse" />
              </div>
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">KING COINS WALLET</p>
                {vipProfile && (
                  <span
                    className={`text-[9px] font-black px-1.5 py-0.5 rounded-full border bg-gradient-to-r ${getTierColor(
                      vipProfile.tier
                    )} uppercase`}
                  >
                    {vipProfile.tierLabel} VIP
                  </span>
                )}
                {rewardsPaused && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-rose-500/20 border border-rose-500/40 text-rose-300 uppercase">
                    Paused
                  </span>
                )}
              </div>
              {user ? (
                walletError && !wallet ? (
                  <p className="text-xs font-bold text-rose-300 mt-0.5">Wallet temporarily unavailable</p>
                ) : (
                  <div className="flex items-baseline gap-1.5 mt-0.5">
                    <span className="text-2xl font-black text-transparent bg-clip-text bg-gradient-to-r from-amber-300 via-yellow-400 to-amber-500">
                      {loading && !wallet ? '...' : (wallet?.balance ?? 0).toLocaleString()}
                    </span>
                    <span className="text-xs font-bold text-amber-400">COINS</span>
                  </div>
                )
              ) : (
                <p className="text-xs font-bold text-amber-300 mt-0.5">Sign in to collect &amp; redeem Coins</p>
              )}

              {user && wallet && (
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5 text-[10px] text-slate-400">
                  <span className="flex items-center gap-0.5 text-amber-300 font-bold">
                    <Flame className="w-3 h-3 text-orange-400" />
                    Streak: {wallet.streak}d
                  </span>
                  <span>•</span>
                  <span className="text-cyan-300 font-bold">
                    Today: {wallet.todayEarned}/{wallet.dailyCap}
                  </span>
                  {activeCoupons.length > 0 && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400 font-bold">{activeCoupons.length} Voucher</span>
                    </>
                  )}
                </div>
              )}
            </div>
          </button>

          {user ? (
            walletError && !wallet ? (
              <button
                type="button"
                onClick={() => void loadData()}
                className="px-3.5 py-2.5 rounded-2xl bg-neutral-900 border border-amber-500/40 text-amber-300 hover:bg-neutral-800 font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer shrink-0"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleClaimCheckin()}
                disabled={rewardsPaused || isCheckedInToday || busyAction === 'checkin' || (loading && !wallet)}
                className={`px-3.5 py-2.5 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg flex items-center gap-1.5 transition cursor-pointer shrink-0 ${
                  rewardsPaused || isCheckedInToday
                    ? 'bg-neutral-800 text-slate-400 border border-neutral-700 cursor-not-allowed'
                    : 'bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 shadow-amber-500/30 active:scale-95'
                }`}
              >
                {busyAction === 'checkin' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : rewardsPaused ? (
                  <span>Paused</span>
                ) : isCheckedInToday ? (
                  <>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Checked In</span>
                  </>
                ) : (
                  <>
                    <Calendar className="w-4 h-4 text-slate-950" />
                    <span>Daily +{dailyBonusAmount}</span>
                  </>
                )}
              </button>
            )
          ) : (
            <button
              type="button"
              onClick={() => openAuthModal('login')}
              className="px-3.5 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg shadow-amber-500/30 active:scale-95 transition cursor-pointer shrink-0 flex items-center gap-1.5"
            >
              <Lock className="w-3.5 h-3.5" />
              <span>Sign In</span>
            </button>
          )}
        </div>

        {/* 8-Section Navigation Grid (Mobile-First, 4 cols) */}
        <div className="grid grid-cols-4 gap-2 mt-4 pt-3 border-t border-amber-500/20">
          <button
            type="button"
            onClick={() => void handleOpenModal('streak')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-orange-500/20 hover:border-orange-500/50 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 group-hover:scale-110 transition">
              <Flame className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">7d Streak</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenModal('arcade')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-amber-500/20 hover:border-amber-500/50 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 group-hover:scale-110 transition">
              <Gamepad2 className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">Arcade (5)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenModal('missions')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-cyan-500/20 hover:border-cyan-500/50 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 group-hover:scale-110 transition">
              <Target className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">Missions</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenModal('vip')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-yellow-500/20 hover:border-yellow-500/50 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-yellow-500/10 border border-yellow-500/30 flex items-center justify-center text-yellow-400 group-hover:scale-110 transition">
              <Crown className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">VIP Loyalty</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenModal('achievements')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-blue-500/20 hover:border-blue-500/50 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400 group-hover:scale-110 transition">
              <Award className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">Badges (10)</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenModal('leaderboard')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-purple-500/20 hover:border-purple-500/50 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/30 flex items-center justify-center text-purple-300 group-hover:scale-110 transition">
              <Trophy className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">Ranking</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenModal('redeem')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-emerald-500/20 hover:border-emerald-500/50 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 group-hover:scale-110 transition">
              <Gift className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">Redeem</span>
          </button>

          <button
            type="button"
            onClick={() => void handleOpenModal('wallet')}
            className="p-2 rounded-2xl bg-[#141414] hover:bg-[#1a1a1a] border border-slate-700/40 hover:border-slate-500 flex flex-col items-center justify-center gap-1 transition cursor-pointer group"
          >
            <div className="w-8 h-8 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 group-hover:scale-110 transition">
              <History className="w-4 h-4" />
            </div>
            <span className="text-[10px] font-black text-white leading-tight text-center">Ledger</span>
          </button>
        </div>
      </div>

      {/* MODALS CONTAINER */}
      {activeModal !== 'none' && (
        <div
          onClick={() => setActiveModal('none')}
          className="fixed inset-0 z-[150] bg-black/85 backdrop-blur-md flex items-center justify-center p-3 animate-in fade-in duration-200"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-[#121212] border-2 border-amber-500/50 rounded-3xl w-full max-w-md p-4 space-y-4 shadow-2xl max-h-[92vh] overflow-y-auto"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-neutral-800">
              <h3 className="text-xs sm:text-sm font-black text-amber-400 uppercase tracking-wider flex items-center gap-2 truncate">
                <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                <span className="truncate">
                  {activeModal === 'wallet' && 'KING Coins Wallet & Ledger'}
                  {activeModal === 'streak' && 'Daily Streak & Attendance'}
                  {activeModal === 'arcade' && 'KING Arcade (5 Games)'}
                  {activeModal === 'spin' && 'Lucky Spin Wheel'}
                  {activeModal === 'quiz' && 'KING Trivia Quiz'}
                  {activeModal === 'puzzle' && 'KING 3x3 Puzzle'}
                  {activeModal === 'scratch' && 'Scratch & Win Card'}
                  {activeModal === 'memory' && 'Memory Match Game'}
                  {activeModal === 'missions' && 'Daily & Weekly Missions'}
                  {activeModal === 'vip' && 'VIP Loyalty Membership'}
                  {activeModal === 'achievements' && 'Milestones & Achievements'}
                  {activeModal === 'leaderboard' && 'Multi-Mode Leaderboard'}
                  {activeModal === 'redeem' && 'Redeem Rewards Catalog'}
                </span>
              </h3>
              <button
                type="button"
                onClick={() => setActiveModal('none')}
                className="w-7 h-7 rounded-full bg-neutral-900 border border-neutral-800 flex items-center justify-center text-slate-400 hover:text-white cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* WALLET HISTORY & DAILY CAP */}
            {activeModal === 'wallet' && wallet && (
              <div className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-center">
                  <div className="p-2.5 rounded-2xl bg-[#1A1A1A] border border-amber-500/30">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Balance</div>
                    <div className="text-base font-black text-amber-400">{wallet.balance.toLocaleString()}</div>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-[#1A1A1A] border border-cyan-500/30">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Lifetime</div>
                    <div className="text-base font-black text-cyan-400">{wallet.totalEarned.toLocaleString()}</div>
                  </div>
                  <div className="p-2.5 rounded-2xl bg-[#1A1A1A] border border-emerald-500/30">
                    <div className="text-[10px] text-slate-400 font-bold uppercase">Spent</div>
                    <div className="text-base font-black text-emerald-400">{wallet.totalSpent.toLocaleString()}</div>
                  </div>
                </div>

                {/* Daily Earning Cap Progress */}
                <div className="p-3 rounded-2xl bg-[#0A0A0A] border border-neutral-800 space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] font-bold">
                    <span className="text-slate-300">Daily Earning Cap</span>
                    <span className="text-amber-300">
                      {wallet.todayEarned} / {wallet.dailyCap} Coins
                    </span>
                  </div>
                  <div className="w-full h-2 bg-neutral-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all"
                      style={{
                        width: `${Math.min(100, Math.round((wallet.todayEarned / Math.max(1, wallet.dailyCap)) * 100))}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>Reset: 00:00 ({wallet.timezone})</span>
                    <span>Remaining: {wallet.dailyRemaining} Coins</span>
                  </div>
                </div>

                {/* Verified Orders History */}
                {wallet.orders && wallet.orders.length > 0 && (
                  <div className="space-y-1.5">
                    <h4 className="text-xs font-black text-white uppercase tracking-wider flex items-center gap-1.5">
                      <ShoppingBag className="w-3.5 h-3.5 text-cyan-400" />
                      My Verified Orders
                    </h4>
                    <div className="space-y-1 max-h-36 overflow-y-auto pr-1">
                      {wallet.orders.map((o) => (
                        <div
                          key={o.orderRef}
                          className="p-2 rounded-xl bg-[#141414] border border-neutral-800 flex items-center justify-between text-[11px]"
                        >
                          <div>
                            <div className="font-mono font-bold text-white">{o.orderRef}</div>
                            <div className="text-[10px] text-slate-400">
                              Rs. {o.finalTotal.toLocaleString()} • {o.verificationMethod}
                            </div>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase ${
                              o.status === 'confirmed'
                                ? 'bg-emerald-500/20 text-emerald-300'
                                : o.status === 'refunded'
                                ? 'bg-blue-500/20 text-blue-300'
                                : 'bg-amber-500/20 text-amber-300'
                            }`}
                          >
                            {o.paymentStatus}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Ledger Transactions */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">Transaction Ledger</h4>
                  {wallet.transactions.length === 0 ? (
                    <p className="text-xs text-slate-500 text-center py-4">No transactions recorded yet.</p>
                  ) : (
                    <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                      {wallet.transactions.map((tx) => (
                        <div
                          key={tx.id}
                          className="p-2 rounded-xl bg-[#1A1A1A] border border-neutral-800 flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-white truncate">{tx.title}</div>
                            <div className="text-[10px] text-slate-500">
                              {new Date(tx.createdAt).toLocaleDateString()} • {tx.type.replace('_', ' ')}
                            </div>
                          </div>
                          <span
                            className={`text-xs font-black shrink-0 ${
                              tx.coins >= 0 ? 'text-amber-400' : 'text-rose-400'
                            }`}
                          >
                            {tx.coins >= 0 ? `+${tx.coins}` : tx.coins}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 2. DAILY STREAK MODAL */}
            {activeModal === 'streak' && wallet && (
              <div className="space-y-4">
                <div className="p-3 rounded-2xl bg-gradient-to-br from-amber-500/10 via-orange-500/10 to-transparent border border-amber-500/30 flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400 uppercase font-bold">Current Streak</div>
                    <div className="text-2xl font-black text-amber-300 flex items-center gap-1.5">
                      <Flame className="w-5 h-5 text-orange-400 fill-orange-400" />
                      {currentStreak} Days
                    </div>
                    <div className="text-[10px] text-slate-400">Best Record: {wallet.bestStreak} Days</div>
                  </div>
                  {wallet.has7DayBadge && (
                    <div className="text-center p-2 rounded-xl bg-amber-500/20 border border-amber-400/40">
                      <Crown className="w-6 h-6 text-amber-300 mx-auto" />
                      <div className="text-[9px] font-black text-amber-300 uppercase mt-0.5">7d Badge</div>
                    </div>
                  )}
                </div>

                {/* 7-Day Progressive Calendar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-slate-300">
                    <span>7-Day Cycle Schedule</span>
                    <span className="text-amber-400 font-mono">Cycle Day {currentCycleDay}/7</span>
                  </div>
                  <div className="grid grid-cols-7 gap-1">
                    {streakDays.map((coins, idx) => {
                      const dayNum = idx + 1;
                      const isPast = dayNum < currentCycleDay;
                      const isToday = dayNum === currentCycleDay;
                      return (
                        <div
                          key={`day-${dayNum}`}
                          className={`p-1.5 rounded-xl text-center border transition ${
                            isToday
                              ? 'bg-amber-500/20 border-amber-400 text-amber-300 font-black shadow-lg shadow-amber-500/20 scale-105'
                              : isPast
                              ? 'bg-neutral-900 border-neutral-800 text-slate-500'
                              : 'bg-[#141414] border-neutral-800 text-slate-400'
                          }`}
                        >
                          <div className="text-[9px] uppercase font-bold">D{dayNum}</div>
                          <div className="text-xs font-black mt-0.5">+{coins}</div>
                          {dayNum === 7 && <Crown className="w-2.5 h-2.5 text-amber-400 mx-auto mt-0.5" />}
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="p-2.5 rounded-xl bg-[#0A0A0A] border border-neutral-800 text-[10px] text-slate-400 space-y-1">
                  <div>
                    Server Timezone: <strong className="text-white">{wallet.timezone}</strong> (Rollover 00:00)
                  </div>
                  <div>
                    Policy:{' '}
                    <span className="text-slate-300">
                      {wallet.config.streakConfig.graceDays > 0 ? '1 Grace Day Active' : 'Strict Consecutive Days'}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => void handleClaimCheckin()}
                  disabled={isCheckedInToday || busyAction === 'checkin' || rewardsPaused}
                  className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition cursor-pointer shadow-lg ${
                    isCheckedInToday || rewardsPaused
                      ? 'bg-neutral-800 text-slate-400 border border-neutral-700 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 hover:brightness-110 active:scale-95 shadow-amber-500/30'
                  }`}
                >
                  {busyAction === 'checkin' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : isCheckedInToday ? (
                    <>
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Claimed Today (Come back at midnight)</span>
                    </>
                  ) : (
                    <>
                      <Calendar className="w-4 h-4" />
                      <span>Claim Day {currentCycleDay} Bonus (+{dailyBonusAmount} Coins)</span>
                    </>
                  )}
                </button>
              </div>
            )}

            {/* 3. KING ARCADE (5 Interactive Games Hub) */}
            {activeModal === 'arcade' && wallet && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  {rewardsPaused
                    ? 'KING Arcade is currently paused by Super Admin.'
                    : 'Five free daily mini-games with server-authoritative payouts.'}
                </p>

                <div className="space-y-2">
                  {/* Game 1: Lucky Spin */}
                  <button
                    type="button"
                    disabled={!spinEnabled}
                    onClick={() => void handleOpenModal('spin')}
                    className={`w-full p-2.5 rounded-2xl bg-[#1A1A1A] border border-amber-500/30 flex items-center justify-between text-left transition ${
                      spinEnabled ? 'hover:bg-[#222] cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center text-lg">
                        🎡
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">Lucky Spin Wheel</div>
                        <div className="text-[10px] text-amber-300">
                          {Math.max(0, spinMax - spinPlays)}/{spinMax} plays left today
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-amber-400" />
                  </button>

                  {/* Game 2: KING Quiz */}
                  <button
                    type="button"
                    disabled={!quizEnabled}
                    onClick={() => void handleOpenModal('quiz')}
                    className={`w-full p-2.5 rounded-2xl bg-[#1A1A1A] border border-cyan-500/30 flex items-center justify-between text-left transition ${
                      quizEnabled ? 'hover:bg-[#222] cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center text-lg">
                        🧠
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">KING Trivia Quiz</div>
                        <div className="text-[10px] text-cyan-300">
                          +{wallet.config.games.quiz.rewardCoins} Coins • {Math.max(0, quizMax - quizPlays)}/{quizMax} plays left
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-cyan-400" />
                  </button>

                  {/* Game 3: 3x3 Puzzle */}
                  <button
                    type="button"
                    disabled={!puzzleEnabled}
                    onClick={() => void handleOpenModal('puzzle')}
                    className={`w-full p-2.5 rounded-2xl bg-[#1A1A1A] border border-emerald-500/30 flex items-center justify-between text-left transition ${
                      puzzleEnabled ? 'hover:bg-[#222] cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center text-lg">
                        🧩
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">KING 3x3 Puzzle</div>
                        <div className="text-[10px] text-emerald-300">
                          +{wallet.config.games.puzzle.rewardCoins} Coins • {Math.max(0, puzzleMax - puzzlePlays)}/{puzzleMax} plays left
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-emerald-400" />
                  </button>

                  {/* Game 4: Scratch & Win */}
                  <button
                    type="button"
                    disabled={!scratchEnabled}
                    onClick={() => void handleOpenModal('scratch')}
                    className={`w-full p-2.5 rounded-2xl bg-[#1A1A1A] border border-yellow-500/30 flex items-center justify-between text-left transition ${
                      scratchEnabled ? 'hover:bg-[#222] cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-yellow-500/20 text-yellow-400 flex items-center justify-center text-lg">
                        🎟️
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">Scratch &amp; Win Card</div>
                        <div className="text-[10px] text-yellow-300">
                          10–50 Coins • {Math.max(0, scratchMax - scratchPlays)}/{scratchMax} card left today
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-yellow-400" />
                  </button>

                  {/* Game 5: Memory Match */}
                  <button
                    type="button"
                    disabled={!memoryEnabled}
                    onClick={() => void handleOpenModal('memory')}
                    className={`w-full p-2.5 rounded-2xl bg-[#1A1A1A] border border-purple-500/30 flex items-center justify-between text-left transition ${
                      memoryEnabled ? 'hover:bg-[#222] cursor-pointer' : 'opacity-50 cursor-not-allowed'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center text-lg">
                        🃏
                      </div>
                      <div>
                        <div className="text-xs font-black text-white">Memory Match (12 Cards)</div>
                        <div className="text-[10px] text-purple-300">
                          +{wallet.config.games.memory.rewardCoins} Coins • {Math.max(0, memoryMax - memoryPlays)}/{memoryMax} plays left
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-purple-400" />
                  </button>
                </div>
              </div>
            )}

            {/* LUCKY SPIN MODAL */}
            {activeModal === 'spin' && wallet && (
              <div className="text-center space-y-4 py-2">
                <div className="relative w-36 h-36 mx-auto flex items-center justify-center">
                  <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-20 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[14px] border-l-transparent border-r-transparent border-t-amber-300 drop-shadow" />
                  <div
                    className="w-32 h-32 rounded-full border-4 border-amber-400 shadow-xl shadow-amber-500/30 transition-transform duration-[1600ms] ease-out flex items-center justify-center bg-[#060a14] relative overflow-hidden"
                    style={{
                      transform: `rotate(${wheelRotation}deg)`,
                      background:
                        'conic-gradient(#d97706 0deg 60deg, #0e7490 60deg 120deg, #b45309 120deg 180deg, #047857 180deg 240deg, #92400e 240deg 300deg, #1d4ed8 300deg 360deg)',
                    }}
                  >
                    <div className="w-10 h-10 rounded-full bg-[#0A0A0A] border-2 border-amber-400 flex items-center justify-center text-base">
                      👑
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-black text-white">Spin &amp; Win KING Coins!</h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Rewards: {spinSegments.join(' / ')} Coins •{' '}
                    <span className="text-amber-300 font-bold">{Math.max(0, spinMax - spinPlays)} spins left today</span>
                  </p>
                </div>

                {spinResult !== null && (
                  <div className="p-3 rounded-2xl bg-amber-500/20 border border-amber-500/50 text-amber-300 text-sm font-black">
                    You won +{spinResult} KING Coins!
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => void handleSpinWheel()}
                  disabled={isSpinning || spinPlays >= spinMax}
                  className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 disabled:opacity-50 text-slate-950 font-black text-sm uppercase tracking-wider shadow-lg shadow-amber-500/30 transition active:scale-95 cursor-pointer"
                >
                  {spinPlays >= spinMax
                    ? 'Daily Limit Reached'
                    : isSpinning
                    ? 'Spinning Wheel...'
                    : 'Spin Now'}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveModal('arcade')}
                  className="text-xs text-slate-400 hover:text-white font-bold cursor-pointer"
                >
                  ← Back to Arcade Hub
                </button>
              </div>
            )}

            {/* QUIZ MODAL */}
            {activeModal === 'quiz' && wallet && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                  <span>Reward: +{wallet.config.games.quiz.rewardCoins} Coins</span>
                  <span>{Math.max(0, quizMax - quizPlays)} plays left today</span>
                </div>

                {quizLoading ? (
                  <div className="py-8 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-cyan-400 mx-auto" />
                  </div>
                ) : quizChallenge ? (
                  <>
                    <div className="p-3 rounded-2xl bg-cyan-500/10 border border-cyan-500/30">
                      <h4 className="text-sm font-black text-white">{quizChallenge.question}</h4>
                    </div>

                    <div className="space-y-2">
                      {quizChallenge.options.map((opt, idx) => {
                        const isPicked = quizSelected === idx;
                        const isRight = quizCorrectIndex === idx;
                        let cls = 'bg-[#1A1A1A] hover:bg-[#222] border-neutral-800 text-white';
                        if (quizSelected !== null) {
                          if (isRight) {
                            cls = 'bg-emerald-500/20 border-emerald-500 text-white';
                          } else if (isPicked && !quizWon) {
                            cls = 'bg-rose-500/20 border-rose-500 text-rose-200';
                          } else {
                            cls = 'bg-neutral-900 border-neutral-800 text-slate-500';
                          }
                        }

                        return (
                          <button
                            key={opt}
                            type="button"
                            disabled={quizSelected !== null || busyAction === 'quiz_submit'}
                            onClick={() => void handleQuizSubmit(idx)}
                            className={`w-full p-3 rounded-2xl text-left text-xs font-bold border transition cursor-pointer ${cls}`}
                          >
                            {String.fromCharCode(65 + idx)}. {opt}
                          </button>
                        );
                      })}
                    </div>

                    {quizWon !== null && (
                      <div className="space-y-2">
                        <div
                          className={`p-3 rounded-2xl text-xs font-bold text-center ${
                            quizWon
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                              : 'bg-red-500/20 text-red-300 border border-red-500/40'
                          }`}
                        >
                          {quizWon
                            ? `Correct! +${wallet.config.games.quiz.rewardCoins} KING Coins added to your wallet!`
                            : 'Incorrect! Try another question if daily plays remain.'}
                        </div>
                        {quizPlays < quizMax && (
                          <button
                            type="button"
                            onClick={() => void loadNewQuizQuestion()}
                            className="w-full py-2.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 font-black text-xs cursor-pointer transition"
                          >
                            Next Question
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="p-5 text-center bg-[#1A1A1A] rounded-2xl border border-rose-500/30 space-y-2">
                    <p className="text-xs font-bold text-rose-300">Daily limit reached or question unavailable.</p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => setActiveModal('arcade')}
                  className="w-full text-center text-xs text-slate-400 hover:text-white font-bold cursor-pointer pt-1"
                >
                  ← Back to Arcade Hub
                </button>
              </div>
            )}

            {/* PUZZLE MODAL */}
            {activeModal === 'puzzle' && wallet && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-between text-[10px] text-emerald-400 font-bold uppercase tracking-wider">
                  <span>Reward: +{wallet.config.games.puzzle.rewardCoins} Coins</span>
                  <span>Moves: {puzzleMoves.length} • {Math.max(0, puzzleMax - puzzlePlays)} left</span>
                </div>
                <p className="text-xs text-slate-300">Slide tiles in numerical order (1 to 8) to solve!</p>

                {puzzleLoading ? (
                  <div className="h-44 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-emerald-400" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 w-44 h-44 mx-auto bg-black p-2 rounded-2xl border-2 border-emerald-500/50">
                    {puzzleTiles.map((tile, idx) => (
                      <button
                        key={`puz-tile-${idx}`}
                        type="button"
                        onClick={() => void handlePuzzleClick(idx)}
                        className={`rounded-xl font-black text-sm flex items-center justify-center transition ${
                          tile === 0
                            ? 'bg-transparent'
                            : 'bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-md active:scale-95 cursor-pointer'
                        }`}
                      >
                        {tile !== 0 ? tile : ''}
                      </button>
                    ))}
                  </div>
                )}

                {puzzleCompleted && (
                  <div className="p-2.5 rounded-2xl bg-emerald-500/20 border border-emerald-500/50 text-emerald-300 text-xs font-black">
                    Puzzle Solved in {puzzleMoves.length} moves!
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void startNewPuzzle()}
                    className="flex-1 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                  >
                    Reset Board
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal('arcade')}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-xs font-bold text-white cursor-pointer"
                  >
                    Arcade Hub
                  </button>
                </div>
              </div>
            )}

            {/* SCRATCH & WIN MODAL */}
            {activeModal === 'scratch' && wallet && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-between text-[10px] text-yellow-400 font-bold uppercase tracking-wider">
                  <span>Scratch 3+ tiles to reveal prize</span>
                  <span>{Math.max(0, scratchMax - scratchPlays)} card left</span>
                </div>

                {scratchLoading ? (
                  <div className="h-44 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-yellow-400" />
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 w-48 h-48 mx-auto bg-[#0a0a0a] p-2 rounded-2xl border-2 border-yellow-500/50">
                    {Array.from({ length: 9 }, (_, idx) => {
                      const isScratched = scratchedCells.includes(idx);
                      const symbol = scratchRevealedSymbols[idx];
                      return (
                        <button
                          key={`scratch-${idx}`}
                          type="button"
                          onClick={() => handleScratchCell(idx)}
                          className={`rounded-xl font-black text-xs flex items-center justify-center transition border ${
                            isScratched
                              ? 'bg-amber-500/20 border-amber-400/60 text-amber-300'
                              : 'bg-gradient-to-br from-neutral-800 to-neutral-700 border-neutral-600 text-slate-400 hover:border-amber-400 cursor-pointer'
                          }`}
                        >
                          {symbol ? symbol.replace(/_/g, ' ') : isScratched ? '✨' : '?'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {scratchWonCoins !== null ? (
                  <div className="p-3 rounded-2xl bg-yellow-500/20 border border-yellow-400 text-yellow-300 text-xs font-black">
                    Congratulations! +{scratchWonCoins} KING Coins Credited!
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void handleClaimScratch()}
                    disabled={scratchedCells.length < 3 || busyAction === 'scratch_claim'}
                    className={`w-full py-3 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg transition ${
                      scratchedCells.length >= 3
                        ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 hover:brightness-110 cursor-pointer active:scale-95'
                        : 'bg-neutral-800 text-slate-500 cursor-not-allowed'
                    }`}
                  >
                    {busyAction === 'scratch_claim'
                      ? 'Verifying Card...'
                      : scratchedCells.length >= 3
                      ? 'Claim Scratch Reward'
                      : `Scratch ${3 - scratchedCells.length} more tile(s)`}
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setActiveModal('arcade')}
                  className="w-full text-center text-xs text-slate-400 hover:text-white font-bold cursor-pointer"
                >
                  ← Back to Arcade Hub
                </button>
              </div>
            )}

            {/* MEMORY MATCH MODAL */}
            {activeModal === 'memory' && wallet && (
              <div className="space-y-4 text-center">
                <div className="flex items-center justify-between text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                  <span>Match all 6 pairs (12 cards)</span>
                  <span>Moves: {memoryMoves} • {Math.max(0, memoryMax - memoryPlays)} left</span>
                </div>

                {memoryLoading && Object.keys(memoryCardsMap).length === 0 ? (
                  <div className="h-48 flex items-center justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-400" />
                  </div>
                ) : (
                  <div className="grid grid-cols-4 gap-2 w-full max-w-[280px] mx-auto bg-[#0a0a0a] p-2 rounded-2xl border-2 border-purple-500/50">
                    {Array.from({ length: 12 }, (_, idx) => {
                      const isFlipped = memoryFlippedIndices.includes(idx);
                      const isMatched = memoryMatchedIndices.includes(idx);
                      const symbol = memoryCardsMap[idx];
                      return (
                        <button
                          key={`mem-${idx}`}
                          type="button"
                          onClick={() => void handleMemoryCardClick(idx)}
                          disabled={isMatched || isFlipped || memoryLoading}
                          className={`h-14 rounded-xl font-black text-[11px] flex items-center justify-center transition border ${
                            isMatched
                              ? 'bg-purple-600/30 border-purple-400 text-purple-200'
                              : isFlipped
                              ? 'bg-purple-500/20 border-purple-400 text-white'
                              : 'bg-gradient-to-br from-neutral-800 to-neutral-700 border-neutral-600 text-slate-400 hover:border-purple-400 cursor-pointer active:scale-95'
                          }`}
                        >
                          {isMatched || isFlipped ? symbol || '👑' : '?'}
                        </button>
                      );
                    })}
                  </div>
                )}

                {memoryCompleted && (
                  <div className="p-3 rounded-2xl bg-purple-500/20 border border-purple-400 text-purple-200 text-xs font-black">
                    Board Cleared in {memoryMoves} moves! +{wallet.config.games.memory.rewardCoins} Coins!
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => void startNewMemoryGame()}
                    className="flex-1 py-2 rounded-xl bg-neutral-900 border border-neutral-800 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
                  >
                    New Board
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveModal('arcade')}
                    className="flex-1 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-xs font-bold text-white cursor-pointer"
                  >
                    Arcade Hub
                  </button>
                </div>
              </div>
            )}

            {/* 4. MISSIONS MODAL (Daily & Weekly Tabs) */}
            {activeModal === 'missions' && wallet && (
              <div className="space-y-3">
                <div className="flex bg-[#0A0A0A] p-1 rounded-xl border border-neutral-800 gap-1">
                  <button
                    type="button"
                    onClick={() => setMissionTab('daily')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                      missionTab === 'daily' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Daily Missions
                  </button>
                  <button
                    type="button"
                    onClick={() => setMissionTab('weekly')}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition ${
                      missionTab === 'weekly' ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    Weekly Missions
                  </button>
                </div>

                <div className="space-y-2">
                  {wallet.config.missions
                    .filter((m) => (missionTab === 'weekly' ? m.period === 'weekly' : m.period !== 'weekly'))
                    .map((m) => {
                      const isCompleted =
                        m.period === 'weekly'
                          ? wallet.completedMissionsWeekly?.includes(m.id)
                          : wallet.completedMissionsToday?.includes(m.id);
                      const isVerified =
                        m.period === 'weekly'
                          ? wallet.verifiedMissionsWeekly?.includes(m.id)
                          : wallet.verifiedMissionsToday?.includes(m.id);

                      return (
                        <div
                          key={m.id}
                          className="p-3 rounded-2xl bg-[#1A1A1A] border border-neutral-800 flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="text-xs font-black text-white">{m.title}</div>
                            <div className="text-[10px] text-slate-400">{m.desc}</div>
                            <div className="text-[10px] font-bold text-amber-400 mt-1">+{m.coins} Coins</div>
                          </div>

                          {isCompleted ? (
                            <span className="px-2.5 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-300 font-bold text-[11px] flex items-center gap-1 shrink-0">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Claimed
                            </span>
                          ) : isVerified ? (
                            <button
                              type="button"
                              disabled={busyAction === `mission_${m.id}`}
                              onClick={() => void handleCompleteMission(m.id)}
                              className="px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-xs transition cursor-pointer shrink-0 shadow-md"
                            >
                              {busyAction === `mission_${m.id}` ? '...' : 'Claim'}
                            </button>
                          ) : m.id === 'share_shop' ? (
                            <button
                              type="button"
                              disabled={busyAction === 'track_share'}
                              onClick={() => void handleTrackShareMission()}
                              className="px-3 py-1.5 rounded-xl bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 hover:bg-cyan-500 hover:text-slate-950 font-bold text-xs transition cursor-pointer shrink-0 flex items-center gap-1"
                            >
                              <Share2 className="w-3 h-3" /> Share
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setActiveModal(
                                  m.id.includes('quiz')
                                    ? 'quiz'
                                    : m.id.includes('checkin')
                                    ? 'streak'
                                    : 'arcade'
                                );
                              }}
                              className="px-3 py-1.5 rounded-xl bg-neutral-800 border border-neutral-700 text-slate-300 hover:border-amber-400 font-bold text-xs transition cursor-pointer shrink-0"
                            >
                              Go Do It
                            </button>
                          )}
                        </div>
                      );
                    })}
                </div>
              </div>
            )}

            {/* 5. VIP LOYALTY MODAL (Verified Purchases Only) */}
            {activeModal === 'vip' && wallet && vipProfile && (
              <div className="space-y-4">
                <div
                  className={`p-4 rounded-3xl bg-gradient-to-br border shadow-xl ${getTierColor(vipProfile.tier)}`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[10px] uppercase font-bold tracking-widest text-white/70">ROYAL VIP TIER</div>
                      <div className="text-xl font-black text-white flex items-center gap-1.5 mt-0.5">
                        <Crown className="w-5 h-5 text-amber-300" />
                        {vipProfile.tierLabel}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-xs font-black text-white">+{vipProfile.multiplierPercent}% Bonus</div>
                      <div className="text-[10px] text-white/80">Coins on check-in &amp; games</div>
                    </div>
                  </div>

                  {/* Progress to next tier */}
                  {vipProfile.nextTier && (
                    <div className="mt-3 pt-3 border-t border-white/20 space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-white">
                        <span>Next: {vipProfile.nextTierLabel}</span>
                        <span>Rs. {vipProfile.amountToNextTier.toLocaleString()} remaining</span>
                      </div>
                      <div className="w-full h-2 bg-black/40 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-white rounded-full transition-all"
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((vipProfile.verifiedSpendTotal / Math.max(1, vipProfile.nextTierMinSpend)) * 100)
                            )}%`,
                          }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Transparent Notice */}
                <div className="p-3 rounded-2xl bg-[#0A0A0A] border border-neutral-800 space-y-1 text-xs">
                  <div className="flex items-center gap-1.5 font-bold text-slate-300">
                    <Shield className="w-4 h-4 text-cyan-400 shrink-0" />
                    Verified Order Integrity
                  </div>
                  <p className="text-[10px] text-slate-400">
                    VIP Loyalty spend is counted strictly from orders manually verified as paid by Super Admin. Opening
                    WhatsApp or earning Coins does not increase VIP spend.
                  </p>
                  <div className="text-[10px] text-amber-300 font-bold">
                    Lifetime Verified Spend: Rs. {vipProfile.verifiedSpendTotal.toLocaleString()} ({vipProfile.verifiedOrderCount} Orders)
                  </div>
                </div>

                {/* Tier Thresholds Overview */}
                <div className="space-y-1.5">
                  <h4 className="text-xs font-black text-slate-300 uppercase tracking-wider">All VIP Tiers</h4>
                  <div className="space-y-1">
                    {vipTiersOrder.map((tId) => {
                      const cfg = vipTiers?.[tId];
                      if (!cfg) return null;
                      const isCurrent = vipProfile.tier === tId;
                      return (
                        <div
                          key={tId}
                          className={`p-2 rounded-xl border flex items-center justify-between text-xs ${
                            isCurrent
                              ? 'bg-amber-500/15 border-amber-400 text-white font-bold'
                              : 'bg-[#141414] border-neutral-800 text-slate-400'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <Crown
                              className={`w-3.5 h-3.5 ${
                                tId === 'diamond'
                                  ? 'text-cyan-400'
                                  : tId === 'platinum'
                                  ? 'text-slate-300'
                                  : tId === 'gold'
                                  ? 'text-amber-400'
                                  : 'text-amber-700'
                              }`}
                            />
                            <span>{cfg.label}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-mono text-[11px] text-amber-300">
                              {cfg.minSpend > 0 ? `Rs. ${cfg.minSpend.toLocaleString()}` : 'Free Entry'}
                            </span>
                            <span className="text-[10px] text-slate-500 ml-1">+{cfg.multiplierPercent}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}

            {/* 6. ACHIEVEMENTS MODAL */}
            {activeModal === 'achievements' && wallet && (
              <div className="space-y-3">
                <p className="text-xs text-slate-300">
                  Unlock one-time royal achievements to claim lump-sum KING Coin rewards.
                </p>

                <div className="space-y-2 max-h-80 overflow-y-auto pr-1">
                  {wallet.achievements.map((ach) => (
                    <div
                      key={ach.id}
                      className={`p-3 rounded-2xl border flex items-center justify-between gap-3 ${
                        ach.claimed
                          ? 'bg-neutral-900/60 border-neutral-800 opacity-70'
                          : ach.unlocked
                          ? 'bg-amber-500/10 border-amber-500/50'
                          : 'bg-[#1A1A1A] border-neutral-800'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 rounded-xl bg-neutral-800 border border-neutral-700 flex items-center justify-center shrink-0 mt-0.5">
                          {getAchievementIcon(ach.icon)}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="text-xs font-black text-white truncate">{ach.title}</div>
                          <div className="text-[10px] text-slate-400 leading-tight">{ach.desc}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <div className="flex-1 h-1.5 bg-neutral-800 rounded-full overflow-hidden max-w-[120px]">
                              <div
                                className="h-full bg-amber-400 rounded-full"
                                style={{
                                  width: `${Math.min(100, Math.round((ach.progress / Math.max(1, ach.target)) * 100))}%`,
                                }}
                              />
                            </div>
                            <span className="text-[9px] font-mono text-slate-400">
                              {ach.progress}/{ach.target}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="text-xs font-black text-amber-400">+{ach.rewardCoins}</div>
                        {ach.claimed ? (
                          <span className="text-[9px] font-bold text-emerald-400">Claimed</span>
                        ) : ach.unlocked ? (
                          <button
                            type="button"
                            disabled={busyAction === `ach_${ach.id}`}
                            onClick={() => void handleClaimAchievement(ach.id)}
                            className="mt-1 px-2.5 py-1 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-black text-[10px] uppercase cursor-pointer"
                          >
                            {busyAction === `ach_${ach.id}` ? '...' : 'Claim'}
                          </button>
                        ) : (
                          <span className="text-[9px] text-slate-500">Locked</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 7. LEADERBOARD MODAL (Multi-Mode + Privacy Opt-Out) */}
            {activeModal === 'leaderboard' && (
              <div className="space-y-3">
                {/* 3 Tabs: Weekly, Daily, VIP */}
                <div className="flex bg-[#0A0A0A] p-1 rounded-xl border border-neutral-800 gap-1">
                  {(['weekly', 'daily', 'vip'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => void loadLeaderboardForMode(m)}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-bold capitalize cursor-pointer transition ${
                        leaderboardMode === m
                          ? 'bg-purple-600 text-white font-black shadow'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      {m === 'vip' ? 'VIP Rankings' : `${m} Coins`}
                    </button>
                  ))}
                </div>

                {/* Privacy Toggle Banner */}
                {user && wallet && (
                  <div className="p-2.5 rounded-xl bg-[#141414] border border-neutral-800 flex items-center justify-between text-xs">
                    <div className="flex items-center gap-1.5 text-slate-300">
                      {wallet.leaderboardOptOut ? (
                        <EyeOff className="w-3.5 h-3.5 text-rose-400" />
                      ) : (
                        <Eye className="w-3.5 h-3.5 text-emerald-400" />
                      )}
                      <span>Leaderboard Visibility</span>
                    </div>
                    <button
                      type="button"
                      disabled={busyAction === 'privacy_toggle'}
                      onClick={() => void handleToggleLeaderboardPrivacy()}
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold cursor-pointer transition ${
                        wallet.leaderboardOptOut
                          ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                          : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      }`}
                    >
                      {wallet.leaderboardOptOut ? 'Hidden (Opt-Out)' : 'Visible (Public)'}
                    </button>
                  </div>
                )}

                {leaderboardLoading ? (
                  <div className="p-6 text-center">
                    <Loader2 className="w-6 h-6 animate-spin text-purple-400 mx-auto" />
                  </div>
                ) : leaderboard.length === 0 ? (
                  <div className="p-6 text-center bg-[#1A1A1A] rounded-2xl border border-neutral-800 space-y-1">
                    <Trophy className="w-6 h-6 text-amber-400 mx-auto opacity-70" />
                    <p className="text-xs font-bold text-white">No entries on this board yet</p>
                    <p className="text-[10px] text-slate-400">Be the first to claim a spot!</p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {leaderboard.map((entry) => (
                      <div
                        key={`${entry.rank}-${entry.nickname}`}
                        className={`p-2 rounded-xl border flex items-center justify-between gap-2 text-xs ${
                          entry.rank === 1
                            ? 'bg-amber-500/10 border-amber-500/50'
                            : entry.rank === 2
                            ? 'bg-slate-400/10 border-slate-400/40'
                            : entry.rank === 3
                            ? 'bg-orange-600/10 border-orange-500/40'
                            : 'bg-[#1A1A1A] border-neutral-800'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span
                            className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black shrink-0 ${
                              entry.rank === 1
                                ? 'bg-amber-400 text-slate-950'
                                : entry.rank === 2
                                ? 'bg-slate-300 text-slate-950'
                                : entry.rank === 3
                                ? 'bg-orange-400 text-slate-950'
                                : 'bg-neutral-800 text-slate-300'
                            }`}
                          >
                            {entry.rank}
                          </span>
                          <span className="font-bold text-white truncate">{entry.nickname}</span>
                        </div>

                        <div className="text-right shrink-0">
                          {leaderboardMode === 'vip' ? (
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-400/40 uppercase">
                              {entry.vipTierLabel || entry.vipTier} VIP
                            </span>
                          ) : (
                            <span className="font-black text-amber-400">
                              {(entry.coins || entry.weeklyCoins || entry.dailyCoins || 0).toLocaleString()} Coins
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 8. REDEEM REWARDS MODAL */}
            {activeModal === 'redeem' && wallet && (
              <div className="space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-300">Available Balance:</span>
                  <span className="font-black text-amber-400">{wallet.balance.toLocaleString()} Coins</span>
                </div>

                <div className="space-y-2">
                  {wallet.config.rewardsCatalog.map((r) => {
                    const hasActiveSameReward = wallet.coupons.some(
                      (c) => c.rewardId === r.id && (c.status === 'active' || c.status === 'reserved')
                    );
                    const canAfford = !rewardsPaused && !hasActiveSameReward && wallet.balance >= r.cost;
                    return (
                      <div
                        key={r.id}
                        className="p-3 rounded-2xl bg-[#1A1A1A] border border-neutral-800 flex items-center justify-between gap-3"
                      >
                        <div className="min-w-0">
                          <div className="text-xs font-black text-white">{r.title}</div>
                          <div className="text-[10px] text-slate-400">{r.desc}</div>
                          <div className="flex flex-wrap items-center gap-x-2 text-[10px] mt-1">
                            <span className="font-black text-amber-400">{r.cost} Coins</span>
                            {(r.minOrderAmount ?? 0) > 0 && (
                              <span className="text-cyan-300 font-bold">
                                • Min Rs. {(r.minOrderAmount ?? 0).toLocaleString()}
                              </span>
                            )}
                            <span className="text-slate-400">• Valid {r.expiryDays ?? 30}d</span>
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canAfford || busyAction === `redeem_${r.id}`}
                          onClick={() => void handleRedeem(r.id)}
                          className={`px-3 py-1.5 rounded-xl font-bold text-xs transition shrink-0 ${
                            canAfford
                              ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 hover:bg-emerald-500 hover:text-slate-950 cursor-pointer'
                              : 'bg-neutral-900 border border-neutral-800 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {busyAction === `redeem_${r.id}`
                            ? '...'
                            : hasActiveSameReward
                            ? 'Active'
                            : canAfford
                            ? 'Redeem'
                            : 'Low Coins'}
                        </button>
                      </div>
                    );
                  })}
                </div>

                {/* User's Vouchers */}
                {wallet.coupons.length > 0 && (
                  <div className="space-y-2 pt-2 border-t border-neutral-800">
                    <h4 className="text-xs font-black text-emerald-300 uppercase tracking-wider flex items-center gap-1.5">
                      <Ticket className="w-3.5 h-3.5" />
                      My Vouchers
                    </h4>
                    <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                      {wallet.coupons.map((c) => (
                        <div
                          key={c.id}
                          className="p-2.5 rounded-xl bg-[#0A0A0A] border border-emerald-500/30 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <div className="text-[11px] font-bold text-white truncate">{c.title}</div>
                            <div className="text-[10px] font-mono text-amber-300 font-bold truncate">{c.code}</div>
                            <div className="text-[9px] text-slate-400 truncate">
                              {(c.minOrderAmount ?? 0) > 0 ? `Min Rs. ${c.minOrderAmount}` : 'No min order'}
                              {c.expiresAt ? ` • Exp ${new Date(c.expiresAt).toLocaleDateString()}` : ''}
                              {c.orderRef ? ` • Order ${c.orderRef}` : ''}
                            </div>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <span
                              className={`text-[9px] font-black px-1.5 py-0.5 rounded uppercase ${
                                c.status === 'active'
                                  ? 'bg-emerald-500/20 text-emerald-300'
                                  : c.status === 'reserved'
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-neutral-800 text-slate-400'
                              }`}
                            >
                              {c.status}
                            </span>
                            {c.status === 'active' && (
                              <button
                                type="button"
                                onClick={() => handleCopyCoupon(c.code)}
                                className="p-1.5 rounded-lg bg-neutral-800 hover:bg-neutral-700 text-amber-300 cursor-pointer"
                                title="Copy voucher code"
                              >
                                {copiedCode === c.code ? (
                                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                                ) : (
                                  <Copy className="w-3.5 h-3.5" />
                                )}
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
