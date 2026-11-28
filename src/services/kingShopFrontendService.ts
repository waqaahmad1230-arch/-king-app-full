import { auth } from '../firebase';

export type VipTierId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';
export type LeaderboardMode = 'weekly' | 'daily' | 'vip';

export interface KingShopTransaction {
  id: string;
  uid: string;
  type: 'welcome_bonus' | 'daily_checkin' | 'mission' | 'game' | 'redeem' | 'achievement' | 'admin_adjust';
  title: string;
  coins: number;
  vipBonusCoins?: number;
  createdAt: string;
}

export interface KingShopCoupon {
  id: string;
  uid: string;
  rewardId: string;
  title: string;
  code: string;
  cost: number;
  type: 'coupon' | 'delivery';
  discountAmount?: number;
  eligibleCategories?: string[];
  status: 'active' | 'reserved' | 'used' | 'revoked' | 'expired';
  minOrderAmount?: number;
  maxUses?: number;
  usesCount?: number;
  reservedOrderRef?: string;
  reservedUntil?: string;
  usedOrderRef?: string;
  orderRef?: string;
  expiresAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface KingShopMissionConfig {
  id: string;
  title: string;
  desc: string;
  coins: number;
  enabled: boolean;
  period?: 'daily' | 'weekly';
}

export interface KingShopRewardCatalogItem {
  id: string;
  title: string;
  desc: string;
  cost: number;
  type: 'coupon' | 'delivery';
  value: string;
  discountAmount?: number;
  minOrderAmount?: number;
  expiryDays?: number;
  eligibleCategories?: string[];
  enabled: boolean;
}

export interface KingShopGamesConfig {
  spin: { enabled: boolean; maxDailyPlays: number; minCoins: number; maxCoins: number; spinSegments?: number[] };
  quiz: { enabled: boolean; maxDailyPlays: number; rewardCoins: number };
  puzzle: { enabled: boolean; maxDailyPlays: number; rewardCoins: number };
  scratch: { enabled: boolean; maxDailyPlays: number; minCoins: number; maxCoins: number; winSegments?: number[] };
  memory: { enabled: boolean; maxDailyPlays: number; rewardCoins: number };
}

export interface KingShopStreakConfig {
  timezone: string;
  useProgressiveSchedule: boolean;
  schedule: number[];
  day7BonusCoins: number;
  graceDays: number;
  missedDayResetPolicy: 'reset_to_day_1' | 'reset_to_1' | 'decrement_by_one';
}

export interface KingShopEconomyConfig {
  globalDailyEarnCap: number;
  sourceDailyCaps: {
    checkin: number;
    game: number;
    mission: number;
    achievement: number;
  };
}

export interface KingShopVipTierConfig {
  id: VipTierId;
  label: string;
  minSpend: number;
  multiplierPercent: number;
  perkLabel: string;
  enabled: boolean;
}

export interface KingShopVipConfig {
  enabled: boolean;
  maxMultiplierPercent: number;
  maxBonusCoinsPerAction: number;
  downgradePolicy: 'never' | 'recalculate_on_refund';
  tiers: Record<VipTierId, KingShopVipTierConfig>;
}

export interface KingShopAchievementConfig {
  id: string;
  title: string;
  desc: string;
  icon: string;
  metric: string;
  target: number;
  rewardCoins: number;
  enabled: boolean;
}

export interface KingShopAchievementView {
  id: string;
  title: string;
  desc: string;
  icon: string;
  rewardCoins: number;
  progress: number;
  rawProgress: number;
  target: number;
  unlocked: boolean;
  claimed: boolean;
  claimedAt?: string;
}

export interface KingShopVipProfile {
  tier: VipTierId;
  tierLabel: string;
  tierRank: number;
  perkLabel: string;
  multiplierPercent: number;
  verifiedSpendTotal: number;
  verifiedOrderCount: number;
  lifetimePeakTier: VipTierId;
  manualOverrideTier: VipTierId | '';
  manualOverrideReason: string;
  nextTier: VipTierId | null;
  nextTierLabel: string | null;
  nextTierMinSpend: number;
  amountToNextTier: number;
  vipScore: number;
}

export interface KingShopUserOrder {
  orderRef: string;
  subtotal: number;
  discountAmount: number;
  finalTotal: number;
  status: string;
  paymentStatus: string;
  verificationMethod: string;
  vipCounted: boolean;
  couponCode: string;
  createdAt: string;
}

export interface KingShopWalletResponse {
  balance: number;
  totalEarned: number;
  totalSpent: number;
  weeklyEarned: number;
  weekKey: string;
  todayEarned: number;
  dailyCap: number;
  dailyRemaining: number;
  sourceDailyCaps: KingShopEconomyConfig['sourceDailyCaps'];
  timezone: string;
  lastCheckinDate: string;
  checkinClaimedToday: boolean;
  nextCheckinCoins: number;
  streakCycleDay: number;
  streak: number;
  bestStreak: number;
  graceUsedCount: number;
  milestone7Count: number;
  has7DayBadge: boolean;
  totalCheckins: number;
  totalQuizWins: number;
  totalPuzzleWins: number;
  totalGamesPlayed: number;
  leaderboardOptOut: boolean;
  serverDate: string;
  nextResetAt: string;
  transactions: KingShopTransaction[];
  coupons: KingShopCoupon[];
  orders: KingShopUserOrder[];
  vip: KingShopVipProfile;
  achievements: KingShopAchievementView[];
  completedMissionsToday: string[];
  verifiedMissionsToday: string[];
  completedMissionsWeekly: string[];
  verifiedMissionsWeekly: string[];
  gameLimitsToday: {
    spin: { plays: number; max: number };
    quiz: { plays: number; wins: number; max: number };
    puzzle: { plays: number; max: number };
    scratch: { plays: number; max: number };
    memory: { plays: number; max: number };
  };
  config: {
    rewardsEnabled: boolean;
    dailyCheckinCoins: number;
    streakConfig: KingShopStreakConfig;
    economyConfig: KingShopEconomyConfig;
    vipConfig: KingShopVipConfig;
    missions: KingShopMissionConfig[];
    games: KingShopGamesConfig;
    rewardsCatalog: KingShopRewardCatalogItem[];
  };
}

export interface LeaderboardEntry {
  rank: number;
  nickname: string;
  photoURL: string;
  weeklyCoins?: number;
  dailyCoins?: number;
  coins?: number;
  vipTier?: VipTierId;
  vipTierLabel?: string;
  vipScore?: number;
}

export interface QuizQuestionChallenge {
  challengeId: string;
  question: string;
  options: string[];
}

export interface PuzzleStartResponse {
  sessionId: string;
  board: number[];
}

export interface ScratchStartResponse {
  sessionId: string;
  gridSize: number;
  minReveal: number;
  playsUsed: number;
  maxDailyPlays: number;
}

export interface MemoryStartResponse {
  sessionId: string;
  cardCount: number;
  pairCount: number;
  playsUsed: number;
  maxDailyPlays: number;
}

export interface MemoryFlipResponse {
  success: boolean;
  matched: boolean;
  cards: [string, string];
  matchedPairs: string[];
  matchedIndices: number[];
  moves: number;
  completed: boolean;
}

export type GameRewardPayload =
  | { gameType: 'spin' }
  | { gameType: 'quiz'; challengeId: string; selectedOption: number }
  | { gameType: 'puzzle'; sessionId: string; moves: number[] }
  | { gameType: 'scratch'; sessionId: string; scratchedCells: number[] }
  | { gameType: 'memory'; sessionId: string };

export interface KingShopAdminSettingsPayload {
  rewardsEnabled: boolean;
  welcomeBonusCoins: number;
  dailyCheckinCoins: number;
  streakConfig: KingShopStreakConfig;
  economyConfig: KingShopEconomyConfig;
  vipConfig: KingShopVipConfig;
  achievements: Record<string, KingShopAchievementConfig>;
  missions: Record<string, KingShopMissionConfig>;
  games: KingShopGamesConfig;
  rewardsCatalog: Record<string, KingShopRewardCatalogItem>;
  updatedAt?: string;
}

export interface KingShopOrderSummary {
  id: string;
  orderRef: string;
  uidPrefix: string;
  couponCode: string;
  subtotal: number;
  discountAmount: number;
  freeDelivery: boolean;
  finalTotal: number;
  refundedAmount?: number;
  paymentStatus?: string;
  verificationMethod?: string;
  verifiedBy?: string;
  verifiedAt?: string;
  verifiedNote?: string;
  vipCounted?: boolean;
  status: 'pending_whatsapp' | 'confirmed' | 'cancelled' | 'refunded' | 'reservation_expired' | string;
  itemSummary: string;
  reservationExpiresAt?: string;
  createdAt: string;
}

export interface KingShopAdminVipProfileSummary {
  uid: string;
  uidPrefix: string;
  tier: VipTierId;
  tierLabel: string;
  verifiedSpendTotal: number;
  verifiedOrderCount: number;
  manualOverrideTier: VipTierId | '';
  manualOverrideReason: string;
  updatedAt: string;
}

export interface KingShopAdminAuditEntry {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  targetUid?: string;
  orderRef?: string;
  amount?: number;
  tier?: string;
  reason?: string;
  note?: string;
  actorEmail?: string;
  createdAt: string;
}

export interface KingShopAdminOverview {
  settings: KingShopAdminSettingsPayload;
  transactions: KingShopTransaction[];
  coupons: KingShopCoupon[];
  orders?: KingShopOrderSummary[];
  vipProfiles?: KingShopAdminVipProfileSummary[];
  auditLogs?: KingShopAdminAuditEntry[];
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('Please sign in to access KING Coins rewards.');
  }
  const token = await currentUser.getIdToken();
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
}

async function parseJsonResponse<T = any>(res: Response, fallbackMsg: string): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || fallbackMsg);
  }
  return data as T;
}

export async function fetchKingWallet(): Promise<KingShopWalletResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/wallet', { headers });
  return parseJsonResponse<KingShopWalletResponse>(res, 'Failed to fetch wallet');
}

export async function claimDailyCheckin(): Promise<{
  success: boolean;
  balance: number;
  added: number;
  vipBonusCoins?: number;
  vipTier?: VipTierId;
  streak: number;
  bestStreak: number;
  cycleDay: number;
  usedGrace: boolean;
  isDay7Milestone: boolean;
  has7DayBadge: boolean;
  timezone: string;
  serverDate: string;
  nextResetAt: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/checkin', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse(res, 'Check-in failed');
}

export async function trackMissionActivity(
  missionId: 'browse_products' | 'watch_video' | 'share_shop',
  proofId: string
): Promise<{ success: boolean; missionId: string; verified: boolean }> {
  if (!auth.currentUser) {
    return { success: false, missionId, verified: false };
  }
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/mission/track', {
    method: 'POST',
    headers,
    body: JSON.stringify({ missionId, proofId }),
  });
  return parseJsonResponse(res, 'Mission tracking failed');
}

export async function completeMission(missionId: string): Promise<{
  success: boolean;
  balance: number;
  added: number;
  missionId: string;
  period?: 'daily' | 'weekly';
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/mission/complete', {
    method: 'POST',
    headers,
    body: JSON.stringify({ missionId }),
  });
  return parseJsonResponse(res, 'Mission completion failed');
}

export async function fetchQuizQuestion(): Promise<QuizQuestionChallenge> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/games/quiz-question', { headers });
  return parseJsonResponse<QuizQuestionChallenge>(res, 'Failed to load quiz question');
}

export async function startPuzzleSession(): Promise<PuzzleStartResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/games/puzzle-start', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse<PuzzleStartResponse>(res, 'Failed to start puzzle session');
}

export async function startScratchSession(): Promise<ScratchStartResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/games/scratch-start', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse<ScratchStartResponse>(res, 'Failed to start Scratch & Win card');
}

export async function startMemorySession(): Promise<MemoryStartResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/games/memory-start', {
    method: 'POST',
    headers,
    body: JSON.stringify({}),
  });
  return parseJsonResponse<MemoryStartResponse>(res, 'Failed to start Memory Match game');
}

export async function flipMemoryCards(
  sessionId: string,
  indices: [number, number]
): Promise<MemoryFlipResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/games/memory-flip', {
    method: 'POST',
    headers,
    body: JSON.stringify({ sessionId, indices }),
  });
  return parseJsonResponse<MemoryFlipResponse>(res, 'Memory card flip failed');
}

export async function submitGameReward(payload: GameRewardPayload): Promise<{
  success: boolean;
  won: boolean;
  correct?: boolean;
  correctIndex?: number;
  segmentIndex?: number;
  gridSymbols?: string[];
  balance: number;
  added: number;
  vipBonusCoins?: number;
  vipTier?: VipTierId;
  playsLeft: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/game/reward', {
    method: 'POST',
    headers,
    body: JSON.stringify(payload),
  });
  return parseJsonResponse(res, 'Game reward failed');
}

export async function claimAchievement(achievementId: string): Promise<{
  success: boolean;
  achievementId: string;
  added: number;
  balance: number;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/achievements/claim', {
    method: 'POST',
    headers,
    body: JSON.stringify({ achievementId }),
  });
  return parseJsonResponse(res, 'Failed to claim achievement');
}

export async function redeemReward(
  rewardId: string,
  idempotencyKey?: string
): Promise<{
  success: boolean;
  balance: number;
  code: string;
  title: string;
  couponId: string;
  minOrderAmount?: number;
  expiresAt?: string;
}> {
  const headers = await getAuthHeaders();
  const key = idempotencyKey || `${rewardId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const res = await fetch('/api/shop/redeem', {
    method: 'POST',
    headers,
    body: JSON.stringify({ rewardId, idempotencyKey: key }),
  });
  return parseJsonResponse(res, 'Redemption failed');
}

export async function fetchLeaderboard(mode: LeaderboardMode = 'weekly'): Promise<{
  type: LeaderboardMode;
  key: string;
  weekKey: string;
  dailyKey?: string;
  leaderboard: LeaderboardEntry[];
}> {
  const res = await fetch(`/api/shop/leaderboard?type=${encodeURIComponent(mode)}`);
  return parseJsonResponse(res, 'Failed to fetch leaderboard');
}

export async function updateLeaderboardPrivacy(optOut: boolean): Promise<{
  success: boolean;
  leaderboardOptOut: boolean;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/leaderboard/privacy', {
    method: 'POST',
    headers,
    body: JSON.stringify({ optOut }),
  });
  return parseJsonResponse(res, 'Failed to update privacy setting');
}

export async function fetchKingShopAdminOverview(): Promise<KingShopAdminOverview> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/admin/overview', { headers });
  return parseJsonResponse<KingShopAdminOverview>(res, 'Failed to load KING Shop admin data');
}

export async function updateKingShopAdminSettings(
  settings: Partial<KingShopAdminSettingsPayload>
): Promise<{ success: boolean; settings: KingShopAdminSettingsPayload }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/admin/settings', {
    method: 'POST',
    headers,
    body: JSON.stringify(settings),
  });
  return parseJsonResponse(res, 'Failed to update reward settings');
}

export interface CheckoutLineItemInput {
  productId: string;
  quantity: number;
}

export interface CouponValidationResponse {
  valid: boolean;
  coupon: KingShopCoupon;
  items: Array<{
    productId: string;
    name: string;
    category: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  subtotal: number;
  eligibleSubtotal: number;
  discountAmount: number;
  freeDelivery: boolean;
  finalTotal: number;
}

export interface WhatsAppCheckoutResponse {
  success: boolean;
  orderRef: string;
  items: Array<{
    productId: string;
    name: string;
    category: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }>;
  subtotal: number;
  couponCode: string;
  coupon: KingShopCoupon | null;
  discountAmount: number;
  freeDelivery: boolean;
  finalTotal: number;
  reservationExpiresAt: string;
  whatsappMessage: string;
  whatsappUrl: string;
  idempotentReplay: boolean;
}

export async function validateCheckoutCoupon(
  code: string,
  items: CheckoutLineItemInput[]
): Promise<CouponValidationResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/coupons/validate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ code, items }),
  });
  return parseJsonResponse<CouponValidationResponse>(res, 'Coupon validation failed');
}

export async function createVerifiedWhatsAppCheckout(params: {
  items: CheckoutLineItemInput[];
  couponCode?: string;
  idempotencyKey?: string;
}): Promise<WhatsAppCheckoutResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/checkout/whatsapp', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      items: params.items,
      couponCode: params.couponCode || '',
      idempotencyKey: params.idempotencyKey,
    }),
  });
  return parseJsonResponse<WhatsAppCheckoutResponse>(res, 'WhatsApp checkout failed');
}

export async function releaseWhatsAppCheckoutReservation(params: {
  couponCode?: string;
  orderRef?: string;
}): Promise<{ success: boolean; released: boolean; status: string; orderRef: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/checkout/release', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  return parseJsonResponse(res, 'Failed to release checkout reservation');
}

export async function updateKingShopCouponStatus(
  couponId: string,
  status: 'active' | 'used' | 'revoked',
  orderRef?: string
): Promise<{ success: boolean; couponId: string; status: string; orderRef?: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/shop/admin/coupons/${encodeURIComponent(couponId)}`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ status, ...(orderRef ? { orderRef } : {}) }),
  });
  return parseJsonResponse(res, 'Failed to update coupon status');
}

export async function verifyAdminOrder(params: {
  orderRef: string;
  action: 'confirm_paid' | 'cancel' | 'refund';
  note?: string;
  refundAmount?: number;
}): Promise<{
  success: boolean;
  orderRef: string;
  status: string;
  paymentStatus: string;
  verificationMethod: string;
  vipTier: VipTierId;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch(`/api/shop/admin/orders/${encodeURIComponent(params.orderRef)}/verify`, {
    method: 'POST',
    headers,
    body: JSON.stringify({
      action: params.action,
      ...(params.note ? { note: params.note } : {}),
      ...(typeof params.refundAmount === 'number' ? { refundAmount: params.refundAmount } : {}),
    }),
  });
  return parseJsonResponse(res, 'Order verification failed');
}

export async function adjustAdminUserWallet(params: {
  targetUid: string;
  amount: number;
  reason: string;
  includeInWeekly?: boolean;
}): Promise<{
  success: boolean;
  targetUid: string;
  amount: number;
  balance: number;
  reason: string;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/admin/wallet/adjust', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  return parseJsonResponse(res, 'Wallet adjustment failed');
}

export async function overrideAdminUserVip(params: {
  targetUid: string;
  tier: 'auto' | VipTierId;
  reason: string;
}): Promise<{
  success: boolean;
  targetUid: string;
  vip: KingShopVipProfile;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/shop/admin/vip/override', {
    method: 'POST',
    headers,
    body: JSON.stringify(params),
  });
  return parseJsonResponse(res, 'VIP tier override failed');
}
