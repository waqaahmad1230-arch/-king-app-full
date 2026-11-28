import { randomBytes, randomInt } from 'node:crypto';
import express from 'express';
import type { Express, NextFunction, Request, RequestHandler, Response } from 'express';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import type { Firestore } from 'firebase-admin/firestore';

const FIRESTORE_DB_ID = 'ai-studio-king-4e115b8f-6ca5-4501-8ff0-73c2c7c21a47';

export interface VerifiedUser {
  uid: string;
  email?: string;
  emailVerified?: boolean;
  name?: string;
}

export interface MissionConfigItem {
  id: string;
  title: string;
  desc: string;
  coins: number;
  enabled: boolean;
  period?: 'daily' | 'weekly';
}

export interface RewardCatalogItem {
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

export interface StreakConfig {
  timezone: string;
  useProgressiveSchedule: boolean;
  schedule: number[];
  day7BonusCoins: number;
  graceDays: number;
  missedDayResetPolicy: 'reset_to_day_1' | 'decrement_by_one';
}

export interface EconomyConfig {
  globalDailyEarnCap: number;
  sourceDailyCaps: {
    checkin: number;
    game: number;
    mission: number;
    achievement: number;
  };
}

export type VipTierId = 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export interface VipTierConfig {
  id: VipTierId;
  label: string;
  minSpend: number;
  multiplierPercent: number;
  perkLabel: string;
  enabled: boolean;
}

export interface VipConfig {
  enabled: boolean;
  maxMultiplierPercent: number;
  maxBonusCoinsPerAction: number;
  downgradePolicy: 'never' | 'recalculate_on_refund';
  tiers: Record<VipTierId, VipTierConfig>;
}

export type AchievementMetric =
  | 'totalCheckins'
  | 'bestStreak'
  | 'totalQuizWins'
  | 'totalPuzzleWins'
  | 'totalEarned'
  | 'totalGamesPlayed'
  | 'vipTierRank';

export interface AchievementConfigItem {
  id: string;
  title: string;
  desc: string;
  icon: string;
  metric: AchievementMetric;
  target: number;
  rewardCoins: number;
  enabled: boolean;
}

export interface KingShopSettings {
  rewardsEnabled: boolean;
  welcomeBonusCoins: number;
  dailyCheckinCoins: number;
  streakConfig: StreakConfig;
  economyConfig: EconomyConfig;
  vipConfig: VipConfig;
  achievements: Record<string, AchievementConfigItem>;
  missions: Record<string, MissionConfigItem>;
  games: {
    spin: { enabled: boolean; maxDailyPlays: number; minCoins: number; maxCoins: number };
    quiz: { enabled: boolean; maxDailyPlays: number; rewardCoins: number };
    puzzle: { enabled: boolean; maxDailyPlays: number; rewardCoins: number };
    scratch: { enabled: boolean; maxDailyPlays: number; minCoins: number; maxCoins: number; winSegments: number[] };
    memory: { enabled: boolean; maxDailyPlays: number; rewardCoins: number };
  };
  rewardsCatalog: Record<string, RewardCatalogItem>;
  updatedAt?: string;
}

export const DEFAULT_KING_SHOP_SETTINGS: KingShopSettings = {
  rewardsEnabled: true,
  welcomeBonusCoins: 50,
  dailyCheckinCoins: 25,
  streakConfig: {
    timezone: 'Asia/Karachi',
    useProgressiveSchedule: false,
    schedule: [20, 25, 35, 40, 50, 60, 100],
    day7BonusCoins: 0,
    graceDays: 0,
    missedDayResetPolicy: 'reset_to_day_1',
  },
  economyConfig: {
    globalDailyEarnCap: 600,
    sourceDailyCaps: {
      checkin: 150,
      game: 450,
      mission: 250,
      achievement: 1000,
    },
  },
  vipConfig: {
    enabled: true,
    maxMultiplierPercent: 25,
    maxBonusCoinsPerAction: 50,
    downgradePolicy: 'never',
    tiers: {
      bronze: {
        id: 'bronze',
        label: 'Bronze',
        minSpend: 0,
        multiplierPercent: 0,
        perkLabel: 'Standard KING SHOP Member',
        enabled: true,
      },
      silver: {
        id: 'silver',
        label: 'Silver',
        minSpend: 5000,
        multiplierPercent: 5,
        perkLabel: '+5% Coins on Daily Check-In & Games',
        enabled: true,
      },
      gold: {
        id: 'gold',
        label: 'Gold',
        minSpend: 15000,
        multiplierPercent: 10,
        perkLabel: '+10% Coins + Priority WhatsApp Care',
        enabled: true,
      },
      platinum: {
        id: 'platinum',
        label: 'Platinum',
        minSpend: 35000,
        multiplierPercent: 15,
        perkLabel: '+15% Coins + Elite Drops Access',
        enabled: true,
      },
      diamond: {
        id: 'diamond',
        label: 'Diamond',
        minSpend: 75000,
        multiplierPercent: 20,
        perkLabel: '+20% Coins + Crown Concierge Service',
        enabled: true,
      },
    },
  },
  achievements: {
    first_checkin: {
      id: 'first_checkin',
      title: 'First Steps',
      desc: 'Complete your first Daily Check-In',
      icon: 'sparkles',
      metric: 'totalCheckins',
      target: 1,
      rewardCoins: 25,
      enabled: true,
    },
    warrior_7d: {
      id: 'warrior_7d',
      title: '7-Day Warrior',
      desc: 'Reach a 7-day Daily Check-In streak',
      icon: 'flame',
      metric: 'bestStreak',
      target: 7,
      rewardCoins: 75,
      enabled: true,
    },
    streak_30d: {
      id: 'streak_30d',
      title: 'Streak Legend',
      desc: 'Reach a 30-day best streak record',
      icon: 'crown',
      metric: 'bestStreak',
      target: 30,
      rewardCoins: 200,
      enabled: true,
    },
    quiz_master: {
      id: 'quiz_master',
      title: 'Quiz Master',
      desc: 'Answer 10 KING Trivia Quiz questions correctly',
      icon: 'brain',
      metric: 'totalQuizWins',
      target: 10,
      rewardCoins: 60,
      enabled: true,
    },
    puzzle_king: {
      id: 'puzzle_king',
      title: 'Puzzle King',
      desc: 'Solve 10 KING 3x3 Puzzle challenges',
      icon: 'grid',
      metric: 'totalPuzzleWins',
      target: 10,
      rewardCoins: 80,
      enabled: true,
    },
    coin_collector: {
      id: 'coin_collector',
      title: 'Coin Collector',
      desc: 'Earn 2,000 lifetime KING Coins',
      icon: 'coins',
      metric: 'totalEarned',
      target: 2000,
      rewardCoins: 100,
      enabled: true,
    },
    arcade_champion: {
      id: 'arcade_champion',
      title: 'Arcade Champion',
      desc: 'Complete 25 KING Arcade mini-games',
      icon: 'gamepad',
      metric: 'totalGamesPlayed',
      target: 25,
      rewardCoins: 90,
      enabled: true,
    },
    silver_member: {
      id: 'silver_member',
      title: 'Silver Royalty',
      desc: 'Unlock Silver VIP Loyalty status',
      icon: 'shield',
      metric: 'vipTierRank',
      target: 1,
      rewardCoins: 50,
      enabled: true,
    },
    gold_king: {
      id: 'gold_king',
      title: 'Gold Crown',
      desc: 'Unlock Gold VIP Loyalty status',
      icon: 'award',
      metric: 'vipTierRank',
      target: 2,
      rewardCoins: 125,
      enabled: true,
    },
    diamond_legend: {
      id: 'diamond_legend',
      title: 'Diamond Emperor',
      desc: 'Unlock Diamond VIP Loyalty status',
      icon: 'gem',
      metric: 'vipTierRank',
      target: 4,
      rewardCoins: 300,
      enabled: true,
    },
  },
  missions: {
    browse_products: {
      id: 'browse_products',
      title: 'Product Explorer',
      desc: 'Open & view any product in KING Shop',
      coins: 15,
      enabled: true,
      period: 'daily',
    },
    watch_video: {
      id: 'watch_video',
      title: 'Watch Product Video',
      desc: 'Watch a product video or reel clip',
      coins: 20,
      enabled: true,
      period: 'daily',
    },
    share_shop: {
      id: 'share_shop',
      title: 'Share KING Shop',
      desc: 'Share KING Shop link with friends',
      coins: 25,
      enabled: true,
      period: 'daily',
    },
    daily_quiz: {
      id: 'daily_quiz',
      title: 'Daily Trivia Master',
      desc: 'Answer today’s KING Quiz correctly',
      coins: 30,
      enabled: true,
      period: 'daily',
    },
    daily_checkin_mission: {
      id: 'daily_checkin_mission',
      title: 'Daily Attendance Bonus',
      desc: 'Claim today’s Daily Check-In streak reward',
      coins: 10,
      enabled: true,
      period: 'daily',
    },
    play_games_2: {
      id: 'play_games_2',
      title: 'Arcade Challenger',
      desc: 'Complete 2 KING Arcade mini-games today',
      coins: 20,
      enabled: true,
      period: 'daily',
    },
    arcade_variety_2: {
      id: 'arcade_variety_2',
      title: 'Multi-Game Explorer',
      desc: 'Play 2 different KING Arcade games today',
      coins: 25,
      enabled: true,
      period: 'daily',
    },
    weekly_streak_5: {
      id: 'weekly_streak_5',
      title: 'Weekly Check-In Champion',
      desc: 'Check in 5 days or maintain a 5+ day active streak this week',
      coins: 60,
      enabled: true,
      period: 'weekly',
    },
    weekly_quiz_5: {
      id: 'weekly_quiz_5',
      title: 'Weekly Scholar',
      desc: 'Win 5 KING Trivia Quiz challenges this week',
      coins: 50,
      enabled: true,
      period: 'weekly',
    },
  },
  games: {
    spin: { enabled: true, maxDailyPlays: 3, minCoins: 10, maxCoins: 45 },
    quiz: { enabled: true, maxDailyPlays: 5, rewardCoins: 25 },
    puzzle: { enabled: true, maxDailyPlays: 5, rewardCoins: 40 },
    scratch: { enabled: true, maxDailyPlays: 1, minCoins: 10, maxCoins: 50, winSegments: [10, 15, 20, 30, 50] },
    memory: { enabled: true, maxDailyPlays: 2, rewardCoins: 30 },
  },
  rewardsCatalog: {
    coupon_500: {
      id: 'coupon_500',
      title: 'Rs. 500 OFF Discount Coupon',
      desc: 'Use on any KING Shop order',
      cost: 250,
      type: 'coupon',
      value: 'KING500OFF',
      discountAmount: 500,
      minOrderAmount: 2000,
      expiryDays: 30,
      eligibleCategories: [],
      enabled: true,
    },
    coupon_1000: {
      id: 'coupon_1000',
      title: 'Rs. 1,000 OFF Discount Coupon',
      desc: 'Save big on elite items',
      cost: 450,
      type: 'coupon',
      value: 'KING1000OFF',
      discountAmount: 1000,
      minOrderAmount: 4500,
      expiryDays: 30,
      eligibleCategories: [],
      enabled: true,
    },
    free_delivery: {
      id: 'free_delivery',
      title: 'Free Delivery Voucher',
      desc: 'Zero shipping charges',
      cost: 150,
      type: 'delivery',
      value: 'FREEDEL2025',
      discountAmount: 0,
      minOrderAmount: 1000,
      expiryDays: 30,
      eligibleCategories: [],
      enabled: true,
    },
  },
};

export interface QuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
}

export const KING_QUIZ_BANK: QuizQuestion[] = [
  {
    id: 'q1',
    question: 'What is the official mixed-items luxury store inside KING App?',
    options: [
      'Random Marketplace',
      'KING Gaming Arena Only',
      'KING SHOP (Verified Mixed Collection)',
      'Offline Catalog Only',
    ],
    correctIndex: 2,
  },
  {
    id: 'q2',
    question: 'How do customers place orders directly from KING SHOP?',
    options: [
      'Direct Verified WhatsApp Checkout',
      'Postal Mail Only',
      'Bank Wire Only',
      'In-person Coupon Drop',
    ],
    correctIndex: 0,
  },
  {
    id: 'q3',
    question: 'What currency do you earn from Daily Check-in, Missions, and Mini-Games in KING SHOP?',
    options: ['Star Tokens', 'KING Coins', 'Silver Gems', 'Arcade Credits'],
    correctIndex: 1,
  },
  {
    id: 'q4',
    question: 'What can you redeem KING Coins for in the Rewards Hub?',
    options: [
      'Discount Coupons & Free Delivery Vouchers',
      'Stock Shares',
      'Hardware Repairs',
      'Extra Passwords',
    ],
    correctIndex: 0,
  },
  {
    id: 'q5',
    question: 'When does your Daily Check-In streak reset if you miss claiming for more than a day?',
    options: [
      'After 14 days only',
      'Never resets automatically',
      'Back to Day 1 on the next claim',
      'Only at the start of a new year',
    ],
    correctIndex: 2,
  },
  {
    id: 'q6',
    question: 'At what daily server boundary do KING SHOP Daily Bonuses and Missions reset?',
    options: [
      'Midnight UTC (00:00 UTC)',
      'Every 12 hours locally',
      'Every Sunday noon',
      'Only when manually refreshed by the user',
    ],
    correctIndex: 0,
  },
  {
    id: 'q7',
    question: 'Which ranking metric determines your position on the KING SHOP Leaderboard?',
    options: [
      'Total products favorited',
      'Weekly Coins earned in the current ISO week',
      'Account age in months',
      'Number of comments posted',
    ],
    correctIndex: 1,
  },
  {
    id: 'q8',
    question: 'What happens to your lifetime Coin Balance when the Weekly Leaderboard resets on Monday?',
    options: [
      'It drops to zero every Monday',
      'Half of your coins expire automatically',
      'Your lifetime Coin Balance is preserved safely',
      'Coins convert into profile likes',
    ],
    correctIndex: 2,
  },
  {
    id: 'q9',
    question: 'Which of these actions unlocks the Product Explorer daily mission in KING SHOP?',
    options: [
      'Changing your theme color',
      'Opening and viewing an active product in KING SHOP',
      'Closing the browser tab quickly',
      'Refreshing the leaderboard three times',
    ],
    correctIndex: 1,
  },
  {
    id: 'q10',
    question: 'How do you complete the Watch Product Video daily mission?',
    options: [
      'Watch or play a verified product video reel inside KING SHOP',
      'Download a PDF catalog',
      'Send an empty support message',
      'Switch to offline mode',
    ],
    correctIndex: 0,
  },
  {
    id: 'q11',
    question: 'What happens if you try to redeem a reward voucher without enough KING Coins?',
    options: [
      'Your wallet goes into negative balance',
      'The server blocks redemption until you earn enough Coins',
      'A partial half-coupon is generated',
      'Your streak is deducted instead',
    ],
    correctIndex: 1,
  },
  {
    id: 'q12',
    question: 'How does KING SHOP protect your privacy on the public Weekly Leaderboard?',
    options: [
      'Shows your full email address',
      'Publishes your home city and phone number',
      'Displays only masked nicknames and weekly Coins earned',
      'Shares your private transaction IDs',
    ],
    correctIndex: 2,
  },
  {
    id: 'q13',
    question: 'What goal order solves the 3x3 KING Puzzle Challenge?',
    options: [
      'Tiles 8 down to 1 with empty slot first',
      'Tiles 1 through 8 in order with the empty slot bottom-right',
      'All even numbers in the top row',
      'Any 5 tiles aligned diagonally',
    ],
    correctIndex: 1,
  },
  {
    id: 'q14',
    question: 'Where should you paste a redeemed KING SHOP discount code during checkout?',
    options: [
      'Inside the Direct WhatsApp Order message',
      'In your profile bio',
      'As your account display name',
      'Inside the puzzle board grid',
    ],
    correctIndex: 0,
  },
  {
    id: 'q15',
    question: 'Which product spec on gaming headphones improves positional audio accuracy for footsteps?',
    options: [
      'Cable sleeve color',
      'Packaging box weight',
      'Surround spatial sound & low-latency wireless tuning',
      'Sticker sheet count',
    ],
    correctIndex: 2,
  },
  {
    id: 'q16',
    question: 'What does hot-swappable mean on a mechanical gaming keyboard in KING SHOP?',
    options: [
      'You can replace key switches without soldering',
      'The keyboard charges phones wirelessly',
      'Keycaps melt under heat',
      'Only works with tablets',
    ],
    correctIndex: 0,
  },
  {
    id: 'q17',
    question: 'Why are AMOLED screens popular on smartwatches like the CyberWatch GT?',
    options: [
      'They require bulky external projectors',
      'Deep blacks, crisp contrast, and efficient battery usage',
      'They only display black and white text',
      'They disable Bluetooth connectivity',
    ],
    correctIndex: 1,
  },
  {
    id: 'q18',
    question: 'What does an IPX5 water-resistance rating protect TWS gaming earbuds against?',
    options: [
      'Permanent deep-sea diving',
      'High-heat oven exposure',
      'Sweat and light water splashes',
      'Crushing under heavy weights',
    ],
    correctIndex: 2,
  },
  {
    id: 'q19',
    question: 'Which action unlocks the Daily Trivia Master mission claim button?',
    options: [
      'Answering a KING Trivia Quiz question correctly today',
      'Spinning the Lucky Spin wheel once',
      'Resetting the puzzle board 5 times',
      'Copying a voucher code',
    ],
    correctIndex: 0,
  },
  {
    id: 'q20',
    question: 'What verifies every Coin reward before your KING SHOP wallet balance updates?',
    options: [
      'Client-side browser cookies only',
      'Server-side validation and atomic Firestore transactions',
      'Random browser timer intervals',
      'Manual screenshot uploads for every spin',
    ],
    correctIndex: 1,
  },
];

const SPIN_MULTIPLIERS = [10, 15, 20, 25, 30, 45];
const SOLVED_PUZZLE_BOARD = [1, 2, 3, 4, 5, 6, 7, 8, 0];
// Demo product IDs are ONLY recognized for read-only catalog browse mission tracking,
// never for trusted pricing, checkout totals, coupons, or VIP purchase spend.
const VALID_DEMO_PRODUCT_IDS = new Set(['demo-prod-1', 'demo-prod-2', 'demo-prod-3', 'demo-prod-4']);
const MAX_DAILY_REDEMPTIONS_PER_USER = 3;
export const RESERVATION_TTL_MS = 15 * 60 * 1000;
const KING_SHOP_OWNER_WHATSAPP = '923258448284';

export function shuffleQuizOptions(q: QuizQuestion): { options: string[]; correctIndex: number } {
  const indexed = q.options.map((text, idx) => ({ text, isCorrect: idx === q.correctIndex }));
  for (let i = indexed.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = indexed[i];
    indexed[i] = indexed[j];
    indexed[j] = tmp;
  }
  return {
    options: indexed.map((entry) => entry.text),
    correctIndex: indexed.findIndex((entry) => entry.isCorrect),
  };
}

export function resolveCouponDiscountAmount(coupon: any, settings?: KingShopSettings): number {
  if (!coupon || coupon.type === 'delivery') return 0;
  const explicit = Number(coupon.discountAmount);
  if (Number.isFinite(explicit) && explicit > 0) return Math.round(explicit);
  const rewardId = typeof coupon.rewardId === 'string' ? coupon.rewardId : '';
  if (settings?.rewardsCatalog?.[rewardId]?.discountAmount) {
    return Math.max(0, Math.round(Number(settings.rewardsCatalog[rewardId].discountAmount) || 0));
  }
  if (rewardId === 'coupon_500') return 500;
  if (rewardId === 'coupon_1000') return 1000;
  const code = String(coupon.code || '');
  const codeMatch = code.match(/KING(\d+)OFF/i) || rewardId.match(/coupon_(\d+)/i);
  if (codeMatch && codeMatch[1]) {
    const parsed = Number(codeMatch[1]);
    if (Number.isFinite(parsed) && parsed > 0) return Math.round(parsed);
  }
  return 0;
}

export function normalizeCouponView(coupon: any, nowMs: number, settings?: KingShopSettings) {
  const expiresAtMs = Number(coupon?.expiresAtMs) || 0;
  const reservedUntilMs = Number(coupon?.reservedUntilMs) || 0;
  const rawStatus = String(coupon?.status || 'active');
  const isCouponExpired = expiresAtMs > 0 && nowMs > expiresAtMs;
  const isReservationActive = rawStatus === 'reserved' && reservedUntilMs > nowMs;

  let effectiveStatus = rawStatus;
  if (rawStatus === 'used' || rawStatus === 'revoked') {
    effectiveStatus = rawStatus;
  } else if (isCouponExpired) {
    effectiveStatus = 'expired';
  } else if (rawStatus === 'reserved') {
    effectiveStatus = isReservationActive ? 'reserved' : 'active';
  }

  return {
    ...coupon,
    status: effectiveStatus,
    discountAmount: resolveCouponDiscountAmount(coupon, settings),
    minOrderAmount: Math.max(0, Number(coupon?.minOrderAmount) || 0),
    maxUses: Math.max(1, Number(coupon?.maxUses) || 1),
    usesCount: Math.max(0, Number(coupon?.usesCount) || 0),
    eligibleCategories: Array.isArray(coupon?.eligibleCategories)
      ? coupon.eligibleCategories.filter((c: unknown) => typeof c === 'string' && c.trim().length > 0)
      : [],
    reservedOrderRef: isReservationActive ? String(coupon?.reservedOrderRef || '') : '',
    reservedUntil: isReservationActive ? String(coupon?.reservedUntil || '') : '',
    usedOrderRef: typeof coupon?.usedOrderRef === 'string' ? coupon.usedOrderRef : '',
    orderRef:
      typeof coupon?.usedOrderRef === 'string' && coupon.usedOrderRef
        ? coupon.usedOrderRef
        : isReservationActive
          ? String(coupon?.reservedOrderRef || '')
          : '',
  };
}

export function computeSpinSegments(minCoins: number, maxCoins: number): number[] {
  const min = Math.max(1, Math.round(minCoins));
  const max = Math.max(min, Math.round(maxCoins));
  if (min === 10 && max === 45) {
    return [...SPIN_MULTIPLIERS];
  }
  return Array.from({ length: 6 }, (_, idx) => Math.round(min + ((max - min) * idx) / 5));
}

export function computeScratchSegments(minCoins: number, maxCoins: number): number[] {
  const min = Math.max(1, Math.round(minCoins));
  const max = Math.max(min, Math.round(maxCoins));
  if (min === 10 && max === 50) {
    return [10, 15, 20, 30, 50];
  }
  return Array.from({ length: 5 }, (_, idx) => Math.round(min + ((max - min) * idx) / 4));
}

export function generateScratchGrid(winCoins: number): string[] {
  const decoys = ['GOLD_STAR', 'ROYAL_GEM', 'ELITE_WATCH', 'BLUE_BOLT', 'VELVET_BAG', 'VIP_SHIELD'];
  const pool: string[] = [
    `CROWN_${winCoins}`,
    `CROWN_${winCoins}`,
    `CROWN_${winCoins}`,
    ...decoys,
  ];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = pool[i];
    pool[i] = pool[j];
    pool[j] = tmp;
  }
  return pool;
}

export const KING_MEMORY_SYMBOLS = ['CROWN', 'WATCH', 'GEM', 'BOLT', 'SHIELD', 'STAR'] as const;

export function generateMemoryDeck(): string[] {
  const deck = [...KING_MEMORY_SYMBOLS, ...KING_MEMORY_SYMBOLS];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    const tmp = deck[i];
    deck[i] = deck[j];
    deck[j] = tmp;
  }
  return deck;
}

export function isValidTimeZone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

export function getServerDateKey(now = new Date(), timeZone = 'Asia/Karachi'): string {
  const safeTz = isValidTimeZone(timeZone) ? timeZone : 'Asia/Karachi';
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: safeTz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = parts.find((p) => p.type === 'year')?.value || '1970';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

export function addCalendarDays(dateKey: string, deltaDays: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y || 1970, (m || 1) - 1, (d || 1) + deltaDays));
  return utc.toISOString().split('T')[0];
}

export function calendarDaysBetween(olderDateKey: string, newerDateKey: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(olderDateKey) || !/^\d{4}-\d{2}-\d{2}$/.test(newerDateKey)) {
    return 9999;
  }
  const [y1, m1, d1] = olderDateKey.split('-').map(Number);
  const [y2, m2, d2] = newerDateKey.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86_400_000);
}

export function getPreviousServerDateKey(now = new Date(), timeZone = 'Asia/Karachi'): string {
  return addCalendarDays(getServerDateKey(now, timeZone), -1);
}

export function getNextUtcMidnightIso(now = new Date(), timeZone = 'Asia/Karachi'): string {
  const todayKey = getServerDateKey(now, timeZone);
  let lo = now.getTime();
  let hi = lo + 26 * 60 * 60 * 1000;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (getServerDateKey(new Date(mid), timeZone) === todayKey) {
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return new Date(Math.ceil(hi / 1000) * 1000).toISOString();
}

export function getIsoWeekKey(now = new Date(), timeZone = 'Asia/Karachi'): string {
  const localKey = getServerDateKey(now, timeZone);
  const [y, m, dNum] = localKey.split('-').map(Number);
  const d = new Date(Date.UTC(y, (m || 1) - 1, dNum || 1));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function generateSolvablePuzzleBoard(shuffleSteps = 14): number[] {
  const board = [...SOLVED_PUZZLE_BOARD];
  let emptyIdx = 8;
  let lastEmptyIdx = -1;

  for (let i = 0; i < shuffleSteps; i++) {
    const row = Math.floor(emptyIdx / 3);
    const col = emptyIdx % 3;
    const neighbors: number[] = [];
    if (row > 0) neighbors.push(emptyIdx - 3);
    if (row < 2) neighbors.push(emptyIdx + 3);
    if (col > 0) neighbors.push(emptyIdx - 1);
    if (col < 2) neighbors.push(emptyIdx + 1);

    const candidates = neighbors.filter((n) => n !== lastEmptyIdx);
    const pickList = candidates.length > 0 ? candidates : neighbors;
    const nextIdx = pickList[randomInt(0, pickList.length)];

    board[emptyIdx] = board[nextIdx];
    board[nextIdx] = 0;
    lastEmptyIdx = emptyIdx;
    emptyIdx = nextIdx;
  }

  // Ensure it's never already solved
  const isSolved = board.every((val, idx) => val === SOLVED_PUZZLE_BOARD[idx]);
  if (isSolved) {
    board[8] = board[7];
    board[7] = 0;
  }

  return board;
}

export function verifyPuzzleMoves(initialBoard: unknown, moves: unknown): boolean {
  if (!Array.isArray(initialBoard) || initialBoard.length !== 9) return false;
  if (!Array.isArray(moves) || moves.length === 0 || moves.length > 500) return false;

  const board = initialBoard.map((n) => Number(n));
  let emptyIdx = board.indexOf(0);
  if (emptyIdx < 0) return false;

  for (const rawTileIdx of moves) {
    if (typeof rawTileIdx !== 'number' || !Number.isInteger(rawTileIdx) || rawTileIdx < 0 || rawTileIdx > 8) {
      return false;
    }
    const row = Math.floor(rawTileIdx / 3);
    const col = rawTileIdx % 3;
    const emptyRow = Math.floor(emptyIdx / 3);
    const emptyCol = emptyIdx % 3;
    const manhattan = Math.abs(row - emptyRow) + Math.abs(col - emptyCol);
    if (manhattan !== 1) {
      return false;
    }
    board[emptyIdx] = board[rawTileIdx];
    board[rawTileIdx] = 0;
    emptyIdx = rawTileIdx;
  }

  return board.every((val, idx) => val === SOLVED_PUZZLE_BOARD[idx]);
}

function clampInt(val: unknown, fallback: number, min: number, max: number): number {
  const num = Number(val);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.round(num)));
}

function sanitizeSafeId(raw: unknown, maxLen = 64): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > maxLen) return '';
  if (!/^[a-zA-Z0-9_.-]+$/.test(trimmed)) return '';
  return trimmed;
}

function maskNickname(raw: unknown, uid: string): string {
  const clean = String(raw || '').trim();
  if (!clean) {
    return `King_${uid.slice(0, 4)}`;
  }
  if (clean.length <= 2) {
    return `${clean[0]}***`;
  }
  return `${clean.slice(0, 3)}***`;
}

function createPerUserMutationLimiter(
  windowMs: number,
  maxRequests: number
): RequestHandler & { reset: () => void } {
  const hits = new Map<string, { count: number; resetTime: number }>();
  const timer = setInterval(() => {
    const now = Date.now();
    for (const [k, v] of hits.entries()) {
      if (now > v.resetTime) hits.delete(k);
    }
  }, windowMs);
  if (typeof timer.unref === 'function') timer.unref();

  const handler: RequestHandler & { reset: () => void } = Object.assign(
    (req: Request, res: Response, next: NextFunction) => {
      const uid = (req as any).user?.uid || req.ip || 'anon';
      const key = `${uid}:${req.path}`;
      const now = Date.now();
      let rec = hits.get(key);
      if (!rec || now > rec.resetTime) {
        rec = { count: 1, resetTime: now + windowMs };
        hits.set(key, rec);
        return next();
      }
      rec.count += 1;
      if (rec.count > maxRequests) {
        return res.status(429).json({
          error: { message: 'Too many reward actions. Please wait a moment and try again.' },
        });
      }
      next();
    },
    {
      reset: () => hits.clear(),
    }
  );
  return handler;
}

function mergeSettings(raw: any): KingShopSettings {
  const base = structuredClone(DEFAULT_KING_SHOP_SETTINGS);
  if (!raw || typeof raw !== 'object') return base;

  if (typeof raw.rewardsEnabled === 'boolean') base.rewardsEnabled = raw.rewardsEnabled;
  if (raw.welcomeBonusCoins !== undefined) {
    base.welcomeBonusCoins = clampInt(raw.welcomeBonusCoins, base.welcomeBonusCoins, 0, 500);
  }
  if (raw.dailyCheckinCoins !== undefined) {
    base.dailyCheckinCoins = clampInt(raw.dailyCheckinCoins, base.dailyCheckinCoins, 1, 500);
  }

  if (raw.streakConfig && typeof raw.streakConfig === 'object') {
    if (typeof raw.streakConfig.timezone === 'string' && isValidTimeZone(raw.streakConfig.timezone.trim())) {
      base.streakConfig.timezone = raw.streakConfig.timezone.trim();
    }
    if (typeof raw.streakConfig.useProgressiveSchedule === 'boolean') {
      base.streakConfig.useProgressiveSchedule = raw.streakConfig.useProgressiveSchedule;
    }
    if (Array.isArray(raw.streakConfig.schedule) && raw.streakConfig.schedule.length === 7) {
      base.streakConfig.schedule = raw.streakConfig.schedule.map((val: unknown, idx: number) =>
        clampInt(val, base.streakConfig.schedule[idx], 1, 1000)
      );
    }
    if (raw.streakConfig.day7BonusCoins !== undefined) {
      base.streakConfig.day7BonusCoins = clampInt(
        raw.streakConfig.day7BonusCoins,
        base.streakConfig.day7BonusCoins,
        0,
        500
      );
    }
    if (raw.streakConfig.graceDays !== undefined) {
      base.streakConfig.graceDays = clampInt(raw.streakConfig.graceDays, base.streakConfig.graceDays, 0, 3);
    }
    if (
      raw.streakConfig.missedDayResetPolicy === 'reset_to_day_1' ||
      raw.streakConfig.missedDayResetPolicy === 'reset_to_1' ||
      raw.streakConfig.missedDayResetPolicy === 'decrement_by_one'
    ) {
      base.streakConfig.missedDayResetPolicy =
        raw.streakConfig.missedDayResetPolicy === 'reset_to_1'
          ? 'reset_to_day_1'
          : raw.streakConfig.missedDayResetPolicy;
    }
  }

  if (raw.economyConfig && typeof raw.economyConfig === 'object') {
    if (raw.economyConfig.globalDailyEarnCap !== undefined) {
      base.economyConfig.globalDailyEarnCap = clampInt(
        raw.economyConfig.globalDailyEarnCap,
        base.economyConfig.globalDailyEarnCap,
        25,
        5000
      );
    }
    if (raw.economyConfig.sourceDailyCaps && typeof raw.economyConfig.sourceDailyCaps === 'object') {
      const sc = raw.economyConfig.sourceDailyCaps;
      base.economyConfig.sourceDailyCaps.checkin = clampInt(
        sc.checkin,
        base.economyConfig.sourceDailyCaps.checkin,
        10,
        2000
      );
      base.economyConfig.sourceDailyCaps.game = clampInt(
        sc.game,
        base.economyConfig.sourceDailyCaps.game,
        10,
        2000
      );
      base.economyConfig.sourceDailyCaps.mission = clampInt(
        sc.mission,
        base.economyConfig.sourceDailyCaps.mission,
        10,
        2000
      );
      base.economyConfig.sourceDailyCaps.achievement = clampInt(
        sc.achievement,
        base.economyConfig.sourceDailyCaps.achievement,
        10,
        3000
      );
    }
  }

  if (raw.vipConfig && typeof raw.vipConfig === 'object') {
    if (typeof raw.vipConfig.enabled === 'boolean') base.vipConfig.enabled = raw.vipConfig.enabled;
    if (raw.vipConfig.maxMultiplierPercent !== undefined) {
      base.vipConfig.maxMultiplierPercent = clampInt(
        raw.vipConfig.maxMultiplierPercent,
        base.vipConfig.maxMultiplierPercent,
        0,
        25
      );
    }
    if (raw.vipConfig.maxBonusCoinsPerAction !== undefined) {
      base.vipConfig.maxBonusCoinsPerAction = clampInt(
        raw.vipConfig.maxBonusCoinsPerAction,
        base.vipConfig.maxBonusCoinsPerAction,
        0,
        200
      );
    }
    if (
      raw.vipConfig.downgradePolicy === 'never' ||
      raw.vipConfig.downgradePolicy === 'recalculate_on_refund'
    ) {
      base.vipConfig.downgradePolicy = raw.vipConfig.downgradePolicy;
    }
    if (raw.vipConfig.tiers && typeof raw.vipConfig.tiers === 'object') {
      for (const tierKey of ['bronze', 'silver', 'gold', 'platinum', 'diamond'] as VipTierId[]) {
        const t = raw.vipConfig.tiers[tierKey];
        if (t && typeof t === 'object') {
          if (typeof t.label === 'string' && t.label.trim()) base.vipConfig.tiers[tierKey].label = t.label.trim().slice(0, 32);
          if (t.minSpend !== undefined) {
            base.vipConfig.tiers[tierKey].minSpend =
              tierKey === 'bronze' ? 0 : clampInt(t.minSpend, base.vipConfig.tiers[tierKey].minSpend, 100, 10_000_000);
          }
          if (t.multiplierPercent !== undefined) {
            base.vipConfig.tiers[tierKey].multiplierPercent = clampInt(
              t.multiplierPercent,
              base.vipConfig.tiers[tierKey].multiplierPercent,
              0,
              base.vipConfig.maxMultiplierPercent
            );
          }
          if (typeof t.perkLabel === 'string' && t.perkLabel.trim()) {
            base.vipConfig.tiers[tierKey].perkLabel = t.perkLabel.trim().slice(0, 120);
          }
          if (typeof t.enabled === 'boolean') {
            base.vipConfig.tiers[tierKey].enabled = tierKey === 'bronze' ? true : t.enabled;
          }
        }
      }
    }
  }

  if (raw.achievements && typeof raw.achievements === 'object') {
    for (const key of Object.keys(base.achievements)) {
      const a = raw.achievements[key];
      if (a && typeof a === 'object') {
        if (typeof a.title === 'string' && a.title.trim()) base.achievements[key].title = a.title.trim().slice(0, 80);
        if (typeof a.desc === 'string' && a.desc.trim()) base.achievements[key].desc = a.desc.trim().slice(0, 140);
        if (a.rewardCoins !== undefined) {
          base.achievements[key].rewardCoins = clampInt(a.rewardCoins, base.achievements[key].rewardCoins, 1, 2000);
        }
        if (a.target !== undefined) {
          base.achievements[key].target = clampInt(a.target, base.achievements[key].target, 1, 1_000_000);
        }
        if (typeof a.enabled === 'boolean') base.achievements[key].enabled = a.enabled;
      }
    }
  }

  if (raw.missions && typeof raw.missions === 'object') {
    for (const key of Object.keys(base.missions)) {
      const m = raw.missions[key];
      if (m && typeof m === 'object') {
        if (typeof m.title === 'string' && m.title.trim()) base.missions[key].title = m.title.trim().slice(0, 80);
        if (typeof m.desc === 'string' && m.desc.trim()) base.missions[key].desc = m.desc.trim().slice(0, 140);
        if (m.coins !== undefined) base.missions[key].coins = clampInt(m.coins, base.missions[key].coins, 1, 500);
        if (typeof m.enabled === 'boolean') base.missions[key].enabled = m.enabled;
      }
    }
  }

  if (raw.games && typeof raw.games === 'object') {
    if (raw.games.spin && typeof raw.games.spin === 'object') {
      if (typeof raw.games.spin.enabled === 'boolean') base.games.spin.enabled = raw.games.spin.enabled;
      base.games.spin.maxDailyPlays = clampInt(raw.games.spin.maxDailyPlays, base.games.spin.maxDailyPlays, 1, 25);
      base.games.spin.minCoins = clampInt(raw.games.spin.minCoins, base.games.spin.minCoins, 1, 200);
      base.games.spin.maxCoins = clampInt(raw.games.spin.maxCoins, base.games.spin.maxCoins, base.games.spin.minCoins, 500);
    }
    if (raw.games.quiz && typeof raw.games.quiz === 'object') {
      if (typeof raw.games.quiz.enabled === 'boolean') base.games.quiz.enabled = raw.games.quiz.enabled;
      base.games.quiz.maxDailyPlays = clampInt(raw.games.quiz.maxDailyPlays, base.games.quiz.maxDailyPlays, 1, 25);
      base.games.quiz.rewardCoins = clampInt(raw.games.quiz.rewardCoins, base.games.quiz.rewardCoins, 1, 500);
    }
    if (raw.games.puzzle && typeof raw.games.puzzle === 'object') {
      if (typeof raw.games.puzzle.enabled === 'boolean') base.games.puzzle.enabled = raw.games.puzzle.enabled;
      base.games.puzzle.maxDailyPlays = clampInt(raw.games.puzzle.maxDailyPlays, base.games.puzzle.maxDailyPlays, 1, 25);
      base.games.puzzle.rewardCoins = clampInt(raw.games.puzzle.rewardCoins, base.games.puzzle.rewardCoins, 1, 500);
    }
    if (raw.games.scratch && typeof raw.games.scratch === 'object') {
      if (typeof raw.games.scratch.enabled === 'boolean') base.games.scratch.enabled = raw.games.scratch.enabled;
      base.games.scratch.maxDailyPlays = clampInt(raw.games.scratch.maxDailyPlays, base.games.scratch.maxDailyPlays, 1, 25);
      base.games.scratch.minCoins = clampInt(raw.games.scratch.minCoins, base.games.scratch.minCoins, 1, 200);
      base.games.scratch.maxCoins = clampInt(
        raw.games.scratch.maxCoins,
        base.games.scratch.maxCoins,
        base.games.scratch.minCoins,
        500
      );
      if (Array.isArray(raw.games.scratch.winSegments) && raw.games.scratch.winSegments.length === 5) {
        base.games.scratch.winSegments = raw.games.scratch.winSegments.map((seg: unknown, idx: number) =>
          clampInt(
            seg,
            computeScratchSegments(base.games.scratch.minCoins, base.games.scratch.maxCoins)[idx],
            base.games.scratch.minCoins,
            base.games.scratch.maxCoins
          )
        );
      } else {
        base.games.scratch.winSegments = computeScratchSegments(base.games.scratch.minCoins, base.games.scratch.maxCoins);
      }
    }
    if (raw.games.memory && typeof raw.games.memory === 'object') {
      if (typeof raw.games.memory.enabled === 'boolean') base.games.memory.enabled = raw.games.memory.enabled;
      base.games.memory.maxDailyPlays = clampInt(raw.games.memory.maxDailyPlays, base.games.memory.maxDailyPlays, 1, 25);
      base.games.memory.rewardCoins = clampInt(raw.games.memory.rewardCoins, base.games.memory.rewardCoins, 1, 500);
    }
  }

  if (raw.rewardsCatalog && typeof raw.rewardsCatalog === 'object') {
    for (const key of Object.keys(raw.rewardsCatalog)) {
      const r = raw.rewardsCatalog[key];
      const safeKey = sanitizeSafeId(key, 48);
      if (!safeKey || !r || typeof r !== 'object') continue;
      const existing = base.rewardsCatalog[safeKey];
      base.rewardsCatalog[safeKey] = {
        id: safeKey,
        title: typeof r.title === 'string' && r.title.trim() ? r.title.trim().slice(0, 80) : existing?.title || 'Reward',
        desc: typeof r.desc === 'string' && r.desc.trim() ? r.desc.trim().slice(0, 140) : existing?.desc || 'KING Shop Reward',
        cost: clampInt(r.cost, existing?.cost ?? 200, 10, 100_000),
        type: r.type === 'delivery' ? 'delivery' : 'coupon',
        value:
          typeof r.value === 'string' && /^[A-Z0-9_-]{3,24}$/i.test(r.value.trim())
            ? r.value.trim().toUpperCase()
            : existing?.value || 'KINGREWARD',
        discountAmount:
          r.type === 'delivery'
            ? 0
            : clampInt(r.discountAmount, existing?.discountAmount ?? 0, 0, 1_000_000),
        minOrderAmount: clampInt(r.minOrderAmount, existing?.minOrderAmount ?? 0, 0, 1_000_000),
        expiryDays: clampInt(r.expiryDays, existing?.expiryDays ?? 30, 1, 365),
        eligibleCategories: Array.isArray(r.eligibleCategories)
          ? r.eligibleCategories
              .map((cat: unknown) => (typeof cat === 'string' ? cat.trim().slice(0, 48) : ''))
              .filter(Boolean)
              .slice(0, 12)
          : existing?.eligibleCategories || [],
        enabled: typeof r.enabled === 'boolean' ? r.enabled : existing?.enabled ?? true,
      };
    }
  }

  return base;
}

export interface KingShopRouteOptions {
  dbOverride?: Firestore;
  nowProvider?: () => Date;
}

export function registerKingShopRoutes(
  app: Express,
  adminApp: any,
  authenticateFirebaseToken: RequestHandler,
  requireSuperAdmin: RequestHandler,
  generalApiRateLimiter: RequestHandler,
  options: KingShopRouteOptions = {}
) {
  const getDb = (): Firestore => options.dbOverride || getFirestore(adminApp, FIRESTORE_DB_ID);
  const getNow = (): Date => (options.nowProvider ? options.nowProvider() : new Date());
  const jsonParser = express.json({ limit: '16kb' });
  const mutationRateLimiter = createPerUserMutationLimiter(60_000, 25);
  const arcadeFlipRateLimiter = createPerUserMutationLimiter(60_000, 120);

  async function loadSettings(db: Firestore): Promise<KingShopSettings> {
    try {
      const snap = await db.collection('king_shop_settings').doc('config').get();
      if (!snap.exists) return structuredClone(DEFAULT_KING_SHOP_SETTINGS);
      return mergeSettings(snap.data());
    } catch {
      return structuredClone(DEFAULT_KING_SHOP_SETTINGS);
    }
  }

  type EarnSource = 'checkin' | 'game' | 'mission' | 'achievement';

  function resolveWalletStateForTx(
    walletSnap: FirebaseFirestore.DocumentSnapshot,
    uid: string,
    settings: KingShopSettings,
    now: Date,
    tx: FirebaseFirestore.Transaction,
    db: Firestore
  ): {
    balance: number;
    totalEarned: number;
    totalSpent: number;
    weeklyEarned: number;
    weekKey: string;
    dailyEarned: number;
    dailyKey: string;
    dailySourceEarned: Record<EarnSource, number>;
    lastCheckinDate: string;
    streak: number;
    bestStreak: number;
    graceUsedCount: number;
    milestone7Count: number;
    has7DayBadge: boolean;
    totalCheckins: number;
    totalQuizWins: number;
    totalPuzzleWins: number;
    totalGamesPlayed: number;
    weeklyCheckinDates: string[];
    weeklyQuizWins: number;
    leaderboardOptOut: boolean;
  } {
    const tz = settings.streakConfig.timezone;
    const currentWeekKey = getIsoWeekKey(now, tz);
    const todayStr = getServerDateKey(now, tz);
    const nowIso = now.toISOString();

    if (!walletSnap.exists) {
      const initial = Math.max(0, settings.welcomeBonusCoins);
      const walletRef = db.collection('king_shop_wallets').doc(uid);
      const emptySources: Record<EarnSource, number> = {
        checkin: 0,
        game: 0,
        mission: 0,
        achievement: 0,
      };
      tx.set(walletRef, {
        uid,
        balance: initial,
        totalEarned: initial,
        totalSpent: 0,
        weeklyEarned: initial,
        weekKey: currentWeekKey,
        dailyEarned: 0,
        dailyKey: todayStr,
        dailySourceEarned: emptySources,
        lastCheckinDate: '',
        streak: 0,
        bestStreak: 0,
        graceUsedCount: 0,
        milestone7Count: 0,
        has7DayBadge: false,
        totalCheckins: 0,
        totalQuizWins: 0,
        totalPuzzleWins: 0,
        totalGamesPlayed: 0,
        weeklyCheckinDates: [],
        weeklyCheckinWeekKey: currentWeekKey,
        weeklyQuizWins: 0,
        weeklyQuizWeekKey: currentWeekKey,
        leaderboardOptOut: false,
        createdAt: nowIso,
        updatedAt: nowIso,
      });

      if (initial > 0) {
        const txRef = db.collection('king_shop_transactions').doc();
        tx.set(txRef, {
          id: txRef.id,
          uid,
          type: 'welcome_bonus',
          title: 'KING Shop Welcome Bonus',
          coins: initial,
          createdAt: nowIso,
        });
      }

      return {
        balance: initial,
        totalEarned: initial,
        totalSpent: 0,
        weeklyEarned: initial,
        weekKey: currentWeekKey,
        dailyEarned: 0,
        dailyKey: todayStr,
        dailySourceEarned: emptySources,
        lastCheckinDate: '',
        streak: 0,
        bestStreak: 0,
        graceUsedCount: 0,
        milestone7Count: 0,
        has7DayBadge: false,
        totalCheckins: 0,
        totalQuizWins: 0,
        totalPuzzleWins: 0,
        totalGamesPlayed: 0,
        weeklyCheckinDates: [],
        weeklyQuizWins: 0,
        leaderboardOptOut: false,
      };
    }

    const data = walletSnap.data() || {};
    const totalEarned = Math.max(0, Number(data.totalEarned) || 0);
    const totalSpent = Math.max(0, Number(data.totalSpent) || 0);
    const computedBalance = Math.max(0, totalEarned - totalSpent);
    const storedWeekKey = typeof data.weekKey === 'string' ? data.weekKey : '';
    const weeklyEarned =
      storedWeekKey === currentWeekKey ? Math.max(0, Number(data.weeklyEarned) || 0) : 0;
    const isSameDay = typeof data.dailyKey === 'string' && data.dailyKey === todayStr;
    const rawSources = isSameDay && data.dailySourceEarned && typeof data.dailySourceEarned === 'object'
      ? data.dailySourceEarned
      : {};
    const dailySourceEarned: Record<EarnSource, number> = {
      checkin: Math.max(0, Number(rawSources.checkin) || 0),
      game: Math.max(0, Number(rawSources.game) || 0),
      mission: Math.max(0, Number(rawSources.mission) || 0),
      achievement: Math.max(0, Number(rawSources.achievement) || 0),
    };
    const dailyEarned = isSameDay ? Math.max(0, Number(data.dailyEarned) || 0) : 0;
    const streak = Math.max(0, Number(data.streak) || 0);
    const bestStreak = Math.max(streak, Number(data.bestStreak) || 0);
    const weeklyCheckinDates =
      data.weeklyCheckinWeekKey === currentWeekKey && Array.isArray(data.weeklyCheckinDates)
        ? data.weeklyCheckinDates.map(String)
        : [];
    const weeklyQuizWins =
      data.weeklyQuizWeekKey === currentWeekKey ? Math.max(0, Number(data.weeklyQuizWins) || 0) : 0;

    return {
      balance: computedBalance,
      totalEarned,
      totalSpent,
      weeklyEarned,
      weekKey: currentWeekKey,
      dailyEarned,
      dailyKey: todayStr,
      dailySourceEarned,
      lastCheckinDate: typeof data.lastCheckinDate === 'string' ? data.lastCheckinDate : '',
      streak,
      bestStreak,
      graceUsedCount: Math.max(0, Number(data.graceUsedCount) || 0),
      milestone7Count: Math.max(0, Number(data.milestone7Count) || 0),
      has7DayBadge: Boolean(data.has7DayBadge),
      totalCheckins: Math.max(0, Number(data.totalCheckins) || 0),
      totalQuizWins: Math.max(0, Number(data.totalQuizWins) || 0),
      totalPuzzleWins: Math.max(0, Number(data.totalPuzzleWins) || 0),
      totalGamesPlayed: Math.max(0, Number(data.totalGamesPlayed) || 0),
      weeklyCheckinDates,
      weeklyQuizWins,
      leaderboardOptOut: Boolean(data.leaderboardOptOut),
    };
  }

  function applyDailyCapCheck(
    state: ReturnType<typeof resolveWalletStateForTx>,
    requestedCoins: number,
    source: EarnSource,
    settings: KingShopSettings
  ): {
    creditedCoins: number;
    nextDailyEarned: number;
    nextDailySourceEarned: Record<EarnSource, number>;
  } {
    const globalCap = settings.economyConfig.globalDailyEarnCap;
    const sourceCap = settings.economyConfig.sourceDailyCaps[source];
    const currentSourceEarned = state.dailySourceEarned[source] || 0;
    const globalRemaining = Math.max(0, globalCap - state.dailyEarned);
    const sourceRemaining = Math.max(0, sourceCap - currentSourceEarned);
    const allowedRemaining = Math.min(globalRemaining, sourceRemaining);

    if (allowedRemaining <= 0) {
      throw Object.assign(
        new Error(
          globalRemaining <= 0
            ? `Daily earning limit reached (${state.dailyEarned}/${globalCap} Coins today). Come back after midnight reset!`
            : `Daily ${source} earning cap reached (${currentSourceEarned}/${sourceCap} Coins today). Try another activity!`
        ),
        { statusCode: 429 }
      );
    }

    const creditedCoins = Math.min(Math.max(0, Math.round(requestedCoins)), allowedRemaining);
    return {
      creditedCoins,
      nextDailyEarned: state.dailyEarned + creditedCoins,
      nextDailySourceEarned: {
        ...state.dailySourceEarned,
        [source]: currentSourceEarned + creditedCoins,
      },
    };
  }

  const VIP_TIER_ORDER: VipTierId[] = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

  function getVipTierRank(tier: string): number {
    const idx = VIP_TIER_ORDER.indexOf(tier as VipTierId);
    return idx >= 0 ? idx : 0;
  }

  function resolveTierFromSpend(spendTotal: number, settings: KingShopSettings): VipTierId {
    let resolved: VipTierId = 'bronze';
    for (const tierId of VIP_TIER_ORDER) {
      const cfg = settings.vipConfig.tiers[tierId];
      if (cfg && cfg.enabled && spendTotal >= cfg.minSpend) {
        resolved = tierId;
      }
    }
    return resolved;
  }

  function resolveEffectiveVipProfile(rawVipData: any, settings: KingShopSettings) {
    const data = rawVipData && typeof rawVipData === 'object' ? rawVipData : {};
    const verifiedSpendTotal = Math.max(0, Math.round(Number(data.verifiedSpendTotal) || 0));
    const verifiedOrderCount = Math.max(0, Math.round(Number(data.verifiedOrderCount) || 0));
    const spendTier = resolveTierFromSpend(verifiedSpendTotal, settings);
    const lifetimePeakTierRaw = typeof data.lifetimePeakTier === 'string' ? data.lifetimePeakTier : 'bronze';
    const lifetimePeakRank = Math.max(getVipTierRank(spendTier), getVipTierRank(lifetimePeakTierRaw));
    const lifetimePeakTier = VIP_TIER_ORDER[lifetimePeakRank] || 'bronze';

    const overrideRaw = typeof data.manualOverrideTier === 'string' ? data.manualOverrideTier : '';
    const hasOverride = VIP_TIER_ORDER.includes(overrideRaw as VipTierId);

    const effectiveTier: VipTierId = hasOverride
      ? (overrideRaw as VipTierId)
      : settings.vipConfig.downgradePolicy === 'never'
        ? lifetimePeakTier
        : spendTier;

    const effectiveRank = getVipTierRank(effectiveTier);
    const tierCfg = settings.vipConfig.tiers[effectiveTier] || settings.vipConfig.tiers.bronze;
    const multiplierPercent = settings.vipConfig.enabled
      ? Math.min(settings.vipConfig.maxMultiplierPercent, Math.max(0, tierCfg.multiplierPercent))
      : 0;

    let nextTier: VipTierId | null = null;
    let nextTierMinSpend = 0;
    let amountToNextTier = 0;
    for (let i = effectiveRank + 1; i < VIP_TIER_ORDER.length; i++) {
      const candidateId = VIP_TIER_ORDER[i];
      const candidate = settings.vipConfig.tiers[candidateId];
      if (candidate && candidate.enabled) {
        nextTier = candidateId;
        nextTierMinSpend = candidate.minSpend;
        amountToNextTier = Math.max(0, candidate.minSpend - verifiedSpendTotal);
        break;
      }
    }

    const vipScore = effectiveRank * 1_000_000 + Math.min(999_999, verifiedSpendTotal);

    return {
      tier: effectiveTier,
      tierLabel: tierCfg.label,
      tierRank: effectiveRank,
      perkLabel: tierCfg.perkLabel,
      multiplierPercent,
      verifiedSpendTotal,
      verifiedOrderCount,
      lifetimePeakTier,
      manualOverrideTier: hasOverride ? (overrideRaw as VipTierId) : '',
      manualOverrideReason: typeof data.manualOverrideReason === 'string' ? data.manualOverrideReason : '',
      nextTier,
      nextTierLabel: nextTier ? settings.vipConfig.tiers[nextTier]?.label || nextTier : null,
      nextTierMinSpend,
      amountToNextTier,
      vipScore,
      countedOrderRefs: Array.isArray(data.countedOrderRefs) ? data.countedOrderRefs.map(String) : [],
    };
  }

  function computeVipBonusCoins(
    baseCoins: number,
    sourceType: 'daily_checkin' | 'game',
    vipProfile: ReturnType<typeof resolveEffectiveVipProfile>,
    settings: KingShopSettings
  ): { baseCoins: number; vipBonusCoins: number; totalRequested: number } {
    if (
      !settings.vipConfig.enabled ||
      (sourceType !== 'daily_checkin' && sourceType !== 'game') ||
      vipProfile.multiplierPercent <= 0 ||
      baseCoins <= 0
    ) {
      return { baseCoins, vipBonusCoins: 0, totalRequested: baseCoins };
    }
    const rawBonus = Math.round((baseCoins * vipProfile.multiplierPercent) / 100);
    const vipBonusCoins = Math.min(settings.vipConfig.maxBonusCoinsPerAction, Math.max(0, rawBonus));
    return {
      baseCoins,
      vipBonusCoins,
      totalRequested: baseCoins + vipBonusCoins,
    };
  }

  function getAchievementMetricValue(
    metric: AchievementMetric,
    walletState: ReturnType<typeof resolveWalletStateForTx>,
    vipRank: number
  ): number {
    switch (metric) {
      case 'totalCheckins':
        return walletState.totalCheckins;
      case 'bestStreak':
        return walletState.bestStreak;
      case 'totalQuizWins':
        return walletState.totalQuizWins;
      case 'totalPuzzleWins':
        return walletState.totalPuzzleWins;
      case 'totalEarned':
        return walletState.totalEarned;
      case 'totalGamesPlayed':
        return walletState.totalGamesPlayed;
      case 'vipTierRank':
        return vipRank;
      default:
        return 0;
    }
  }

  function computeStreakOutcome(
    lastCheckinDate: string,
    todayStr: string,
    currentStreak: number,
    settings: KingShopSettings
  ): { nextStreak: number; usedGrace: boolean; cycleDay: number; rewardCoins: number; isDay7Milestone: boolean } {
    let nextStreak = 1;
    let usedGrace = false;
    if (lastCheckinDate) {
      const diff = calendarDaysBetween(lastCheckinDate, todayStr);
      if (diff === 1) {
        nextStreak = currentStreak + 1;
      } else if (diff > 1 && diff - 1 <= settings.streakConfig.graceDays) {
        nextStreak = currentStreak + 1;
        usedGrace = true;
      } else if (diff > 1 && settings.streakConfig.missedDayResetPolicy === 'decrement_by_one') {
        nextStreak = Math.max(1, currentStreak - 1);
      } else {
        nextStreak = 1;
      }
    }

    const cycleDay = ((nextStreak - 1) % 7) + 1;
    const baseScheduled = settings.streakConfig.useProgressiveSchedule
      ? settings.streakConfig.schedule[cycleDay - 1] ?? settings.dailyCheckinCoins
      : settings.dailyCheckinCoins;
    const isDay7Milestone = cycleDay === 7;
    const bonus = isDay7Milestone ? settings.streakConfig.day7BonusCoins : 0;
    return {
      nextStreak,
      usedGrace,
      cycleDay,
      rewardCoins: Math.max(1, baseScheduled + bonus),
      isDay7Milestone,
    };
  }

  async function queryUserDocsSorted(
    db: Firestore,
    collectionName: string,
    uid: string,
    limitCount: number
  ): Promise<any[]> {
    try {
      const snap = await db
        .collection(collectionName)
        .where('uid', '==', uid)
        .orderBy('createdAt', 'desc')
        .limit(limitCount)
        .get();
      return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    } catch (err: any) {
      const msg = String(err?.message || '').toLowerCase();
      if (err?.code === 9 || err?.code === 'failed-precondition' || msg.includes('index')) {
        const fallbackSnap = await db
          .collection(collectionName)
          .where('uid', '==', uid)
          .limit(Math.max(limitCount, 50))
          .get();
        return fallbackSnap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a: any, b: any) =>
            String(b.createdAt || '').localeCompare(String(a.createdAt || ''))
          )
          .slice(0, limitCount);
      }
      throw err;
    }
  }

  // 1. Get Wallet, Transactions, Coupons, Daily Status & Public Rewards Config
  app.get('/api/shop/wallet', generalApiRateLimiter, authenticateFirebaseToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as VerifiedUser;
      const db = getDb();
      const now = getNow();
      const settings = await loadSettings(db);
      const tz = settings.streakConfig.timezone;
      const todayStr = getServerDateKey(now, tz);

      const walletRef = db.collection('king_shop_wallets').doc(user.uid);
      const walletState = await db.runTransaction(async (tx) => {
        const walletSnap = await tx.get(walletRef);
        const state = resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);
        if (
          walletSnap.exists &&
          (walletSnap.data()?.weekKey !== state.weekKey || walletSnap.data()?.dailyKey !== state.dailyKey)
        ) {
          tx.set(
            walletRef,
            {
              weekKey: state.weekKey,
              weeklyEarned: state.weeklyEarned,
              dailyKey: state.dailyKey,
              dailyEarned: state.dailyEarned,
              dailySourceEarned: state.dailySourceEarned,
              weeklyCheckinDates: state.weeklyCheckinDates,
              weeklyCheckinWeekKey: state.weekKey,
              weeklyQuizWins: state.weeklyQuizWins,
              weeklyQuizWeekKey: state.weekKey,
              updatedAt: now.toISOString(),
            },
            { merge: true }
          );
        }
        return state;
      });

      const missionKeys = Object.keys(settings.missions);
      const achievementKeys = Object.keys(settings.achievements);
      const missionRefs = missionKeys.map((mId) => {
        const periodKey = settings.missions[mId]?.period === 'weekly' ? walletState.weekKey : todayStr;
        return db.collection('king_shop_missions').doc(`${user.uid}_${mId}_${periodKey}`);
      });
      const achievementRefs = achievementKeys.map((aId) =>
        db.collection('king_shop_achievements').doc(`${user.uid}_${aId}`)
      );
      const progressRef = db.collection('king_shop_mission_progress').doc(`${user.uid}_${todayStr}`);
      const checkinRef = db.collection('king_shop_checkins').doc(`${user.uid}_${todayStr}`);
      const vipProfileRef = db.collection('king_shop_vip_profiles').doc(user.uid);
      const spinLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_spin_${todayStr}`);
      const quizLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_quiz_${todayStr}`);
      const puzzleLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_puzzle_${todayStr}`);
      const scratchLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_scratch_${todayStr}`);
      const memoryLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_memory_${todayStr}`);

      const [
        transactions,
        coupons,
        ordersRaw,
        progressSnap,
        checkinSnap,
        vipSnap,
        spinSnap,
        quizSnap,
        puzzleSnap,
        scratchSnap,
        memorySnap,
        ...restSnaps
      ] = await Promise.all([
        queryUserDocsSorted(db, 'king_shop_transactions', user.uid, 30),
        queryUserDocsSorted(db, 'king_shop_coupons', user.uid, 20),
        queryUserDocsSorted(db, 'king_shop_orders', user.uid, 20),
        progressRef.get(),
        checkinRef.get(),
        vipProfileRef.get(),
        spinLimitRef.get(),
        quizLimitRef.get(),
        puzzleLimitRef.get(),
        scratchLimitRef.get(),
        memoryLimitRef.get(),
        ...missionRefs.map((ref) => ref.get()),
        ...achievementRefs.map((ref) => ref.get()),
      ]);

      const missionSnaps = restSnaps.slice(0, missionRefs.length);
      const achievementSnaps = restSnaps.slice(missionRefs.length);

      const completedMissionsToday: string[] = [];
      const completedMissionsWeekly: string[] = [];
      missionSnaps.forEach((snap, idx) => {
        if (snap.exists) {
          const mId = missionKeys[idx];
          if (settings.missions[mId]?.period === 'weekly') {
            completedMissionsWeekly.push(mId);
          } else {
            completedMissionsToday.push(mId);
          }
        }
      });

      const spinPlaysToday = spinSnap.exists ? Number(spinSnap.data()?.plays) || 0 : 0;
      const quizPlaysToday = quizSnap.exists ? Number(quizSnap.data()?.plays) || 0 : 0;
      const quizWinsToday = quizSnap.exists ? Number(quizSnap.data()?.wins) || 0 : 0;
      const puzzlePlaysToday = puzzleSnap.exists ? Number(puzzleSnap.data()?.plays) || 0 : 0;
      const scratchPlaysToday = scratchSnap.exists ? Number(scratchSnap.data()?.plays) || 0 : 0;
      const memoryPlaysToday = memorySnap.exists ? Number(memorySnap.data()?.plays) || 0 : 0;
      const totalGamePlaysToday =
        spinPlaysToday + quizPlaysToday + puzzlePlaysToday + scratchPlaysToday + memoryPlaysToday;
      const distinctGamesPlayedToday = [
        spinPlaysToday > 0,
        quizPlaysToday > 0,
        puzzlePlaysToday > 0,
        scratchPlaysToday > 0,
        memoryPlaysToday > 0,
      ].filter(Boolean).length;

      const progressData = progressSnap.exists ? progressSnap.data() || {} : {};
      const verifiedMissionsToday = ['browse_products', 'watch_video', 'share_shop'].filter(
        (key) => progressData[key] === true
      );
      if (quizWinsToday > 0) verifiedMissionsToday.push('daily_quiz');
      if (checkinSnap.exists || walletState.lastCheckinDate === todayStr) {
        verifiedMissionsToday.push('daily_checkin_mission');
      }
      if (totalGamePlaysToday >= 2) verifiedMissionsToday.push('play_games_2');
      if (distinctGamesPlayedToday >= 2) verifiedMissionsToday.push('arcade_variety_2');

      const verifiedMissionsWeekly: string[] = [];
      if (
        walletState.weeklyCheckinDates.length >= 5 ||
        (walletState.streak >= 5 && walletState.weeklyCheckinDates.length >= 1)
      ) {
        verifiedMissionsWeekly.push('weekly_streak_5');
      }
      if (walletState.weeklyQuizWins >= 5) {
        verifiedMissionsWeekly.push('weekly_quiz_5');
      }

      const vipProfile = resolveEffectiveVipProfile(vipSnap.exists ? vipSnap.data() : null, settings);
      const achievements = achievementKeys
        .map((aId, idx) => {
          const cfg = settings.achievements[aId];
          if (!cfg || !cfg.enabled) return null;
          const claimedSnap = achievementSnaps[idx];
          const claimed = Boolean(claimedSnap?.exists);
          const progress = getAchievementMetricValue(cfg.metric, walletState, vipProfile.tierRank);
          const unlocked = progress >= cfg.target;
          return {
            id: cfg.id,
            title: cfg.title,
            desc: cfg.desc,
            icon: cfg.icon,
            rewardCoins: cfg.rewardCoins,
            progress: Math.min(progress, cfg.target),
            rawProgress: progress,
            target: cfg.target,
            unlocked,
            claimed,
            claimedAt: claimed ? claimedSnap.data()?.claimedAt || '' : '',
          };
        })
        .filter(Boolean);

      const normalizedCoupons = coupons.map((c) => normalizeCouponView(c, now.getTime(), settings));
      const sanitizedUserOrders = ordersRaw.map((o: any) => ({
        orderRef: o.orderRef || o.id,
        subtotal: Number(o.subtotal) || 0,
        discountAmount: Number(o.discountAmount) || 0,
        finalTotal: Number(o.finalTotal) || 0,
        status: o.status || 'pending_whatsapp',
        paymentStatus: o.paymentStatus || 'unpaid',
        verificationMethod: o.verificationMethod || 'unverified_whatsapp_pending',
        vipCounted: Boolean(o.vipCounted),
        couponCode: o.couponCode || '',
        createdAt: o.createdAt || '',
      }));

      const checkinClaimedToday = walletState.lastCheckinDate === todayStr;
      const previewOutcome = computeStreakOutcome(
        walletState.lastCheckinDate,
        checkinClaimedToday ? addCalendarDays(todayStr, 1) : todayStr,
        walletState.streak,
        settings
      );

      return res.json({
        ...walletState,
        todayEarned: walletState.dailyEarned,
        dailyCap: settings.economyConfig.globalDailyEarnCap,
        dailyRemaining: Math.max(0, settings.economyConfig.globalDailyEarnCap - walletState.dailyEarned),
        sourceDailyCaps: settings.economyConfig.sourceDailyCaps,
        timezone: tz,
        checkinClaimedToday,
        nextCheckinCoins: previewOutcome.rewardCoins,
        streakCycleDay: checkinClaimedToday
          ? ((Math.max(1, walletState.streak) - 1) % 7) + 1
          : previewOutcome.cycleDay,
        serverDate: todayStr,
        nextResetAt: getNextUtcMidnightIso(now, tz),
        transactions,
        coupons: normalizedCoupons,
        orders: sanitizedUserOrders,
        vip: vipProfile,
        achievements,
        completedMissionsToday,
        verifiedMissionsToday,
        completedMissionsWeekly,
        verifiedMissionsWeekly,
        gameLimitsToday: {
          spin: {
            plays: spinPlaysToday,
            max: settings.games.spin.maxDailyPlays,
          },
          quiz: {
            plays: quizPlaysToday,
            wins: quizWinsToday,
            max: settings.games.quiz.maxDailyPlays,
          },
          puzzle: {
            plays: puzzlePlaysToday,
            max: settings.games.puzzle.maxDailyPlays,
          },
          scratch: {
            plays: scratchPlaysToday,
            max: settings.games.scratch.maxDailyPlays,
          },
          memory: {
            plays: memoryPlaysToday,
            max: settings.games.memory.maxDailyPlays,
          },
        },
        config: {
          rewardsEnabled: settings.rewardsEnabled,
          dailyCheckinCoins: settings.dailyCheckinCoins,
          streakConfig: settings.streakConfig,
          economyConfig: settings.economyConfig,
          vipConfig: settings.vipConfig,
          missions: Object.values(settings.missions).filter((m) => m.enabled),
          games: {
            spin: {
              ...settings.games.spin,
              spinSegments: computeSpinSegments(settings.games.spin.minCoins, settings.games.spin.maxCoins),
            },
            quiz: settings.games.quiz,
            puzzle: settings.games.puzzle,
            scratch: {
              ...settings.games.scratch,
              winSegments: computeScratchSegments(settings.games.scratch.minCoins, settings.games.scratch.maxCoins),
            },
            memory: settings.games.memory,
          },
          rewardsCatalog: Object.values(settings.rewardsCatalog).filter((r) => r.enabled),
        },
      });
    } catch (err: any) {
      console.error('[KING SHOP] Get Wallet Error:', err);
      return res.status(500).json({ error: { message: 'Failed to load KING Coins wallet.' } });
    }
  });

  // 2. Daily Check-In (Atomic, Server Timezone Day Verification + Streak Engine)
  app.post(
    '/api/shop/checkin',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const tz = settings.streakConfig.timezone;
        const todayStr = getServerDateKey(now, tz);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const walletRef = db.collection('king_shop_wallets').doc(user.uid);
        const checkinRef = db.collection('king_shop_checkins').doc(`${user.uid}_${todayStr}`);
        const vipProfileRef = db.collection('king_shop_vip_profiles').doc(user.uid);

        const result = await db.runTransaction(async (tx) => {
          const [checkinSnap, walletSnap, vipSnap] = await Promise.all([
            tx.get(checkinRef),
            tx.get(walletRef),
            tx.get(vipProfileRef),
          ]);

          if (checkinSnap.exists) {
            throw Object.assign(
              new Error('You have already claimed your Daily Bonus today! Come back tomorrow.'),
              { statusCode: 409 }
            );
          }

          const state = resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);
          if (state.lastCheckinDate === todayStr) {
            throw Object.assign(
              new Error('You have already claimed your Daily Bonus today! Come back tomorrow.'),
              { statusCode: 409 }
            );
          }

          const outcome = computeStreakOutcome(state.lastCheckinDate, todayStr, state.streak, settings);
          const vipProfile = resolveEffectiveVipProfile(vipSnap.exists ? vipSnap.data() : null, settings);
          const vipCalc = computeVipBonusCoins(outcome.rewardCoins, 'daily_checkin', vipProfile, settings);
          const cap = applyDailyCapCheck(state, vipCalc.totalRequested, 'checkin', settings);
          const bonusCoins = cap.creditedCoins;
          const creditedVipBonus = Math.max(0, bonusCoins - Math.min(bonusCoins, vipCalc.baseCoins));
          const newEarned = state.totalEarned + bonusCoins;
          const newBalance = newEarned - state.totalSpent;
          const newWeeklyEarned = state.weeklyEarned + bonusCoins;
          const nextStreak = outcome.nextStreak;
          const nextBestStreak = Math.max(state.bestStreak, nextStreak);
          const nextMilestone7 = state.milestone7Count + (outcome.isDay7Milestone ? 1 : 0);
          const nextHasBadge = state.has7DayBadge || outcome.isDay7Milestone;
          const nextWeeklyCheckins = state.weeklyCheckinDates.includes(todayStr)
            ? state.weeklyCheckinDates
            : [...state.weeklyCheckinDates, todayStr];
          const nowIso = now.toISOString();

          tx.set(checkinRef, {
            uid: user.uid,
            date: todayStr,
            timezone: tz,
            coins: bonusCoins,
            vipBonusCoins: creditedVipBonus,
            streak: nextStreak,
            cycleDay: outcome.cycleDay,
            usedGrace: outcome.usedGrace,
            isDay7Milestone: outcome.isDay7Milestone,
            createdAt: Timestamp.fromDate(now),
          });

          tx.set(
            walletRef,
            {
              uid: user.uid,
              balance: newBalance,
              totalEarned: newEarned,
              totalSpent: state.totalSpent,
              weeklyEarned: newWeeklyEarned,
              weekKey: state.weekKey,
              dailyEarned: cap.nextDailyEarned,
              dailyKey: state.dailyKey,
              dailySourceEarned: cap.nextDailySourceEarned,
              lastCheckinDate: todayStr,
              streak: nextStreak,
              bestStreak: nextBestStreak,
              graceUsedCount: state.graceUsedCount + (outcome.usedGrace ? 1 : 0),
              milestone7Count: nextMilestone7,
              has7DayBadge: nextHasBadge,
              totalCheckins: state.totalCheckins + 1,
              weeklyCheckinDates: nextWeeklyCheckins,
              weeklyCheckinWeekKey: state.weekKey,
              updatedAt: nowIso,
            },
            { merge: true }
          );

          const txRef = db.collection('king_shop_transactions').doc();
          tx.set(txRef, {
            id: txRef.id,
            uid: user.uid,
            type: 'daily_checkin',
            title: outcome.isDay7Milestone
              ? `Daily Check-In Milestone (Day ${nextStreak} • Cycle Day 7!)`
              : creditedVipBonus > 0
                ? `Daily Check-In Bonus (Day ${nextStreak} • +${creditedVipBonus} ${vipProfile.tierLabel} VIP)`
                : `Daily Check-In Bonus (Day ${nextStreak})`,
            coins: bonusCoins,
            vipBonusCoins: creditedVipBonus,
            createdAt: nowIso,
          });

          return {
            balance: newBalance,
            added: bonusCoins,
            vipBonusCoins: creditedVipBonus,
            vipTier: vipProfile.tier,
            streak: nextStreak,
            bestStreak: nextBestStreak,
            cycleDay: outcome.cycleDay,
            usedGrace: outcome.usedGrace,
            isDay7Milestone: outcome.isDay7Milestone,
            has7DayBadge: nextHasBadge,
            timezone: tz,
            serverDate: todayStr,
            nextResetAt: getNextUtcMidnightIso(now, tz),
          };
        });

        return res.json({ success: true, ...result });
      } catch (err: any) {
        const status = err?.statusCode === 429 ? 429 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Check-in failed' } });
      }
    }
  );

  // 3A. Track Verifiable Mission Activity (Does NOT award coins)
  app.post(
    '/api/shop/mission/track',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const missionId = sanitizeSafeId(req.body?.missionId, 48);
        const proofId = sanitizeSafeId(req.body?.proofId, 128);

        if (!missionId || !['browse_products', 'watch_video', 'share_shop'].includes(missionId)) {
          return res.status(400).json({ error: { message: 'Valid trackable missionId is required.' } });
        }
        if (!proofId) {
          return res.status(400).json({ error: { message: 'Valid activity proof reference is required.' } });
        }

        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const tz = settings.streakConfig.timezone;
        const todayStr = getServerDateKey(now, tz);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }
        if (!settings.missions[missionId]?.enabled) {
          return res.status(400).json({ error: { message: 'This mission is currently disabled.' } });
        }

        if (missionId === 'browse_products') {
          if (!VALID_DEMO_PRODUCT_IDS.has(proofId)) {
            const prodSnap = await db.collection('catalog_products').doc(proofId).get();
            if (!prodSnap.exists || prodSnap.data()?.isActive === false) {
              return res.status(400).json({ error: { message: 'Product exploration could not be verified.' } });
            }
          }
        } else if (missionId === 'watch_video') {
          let verifiedVideo = false;
          const prodVideoMatch = proofId.match(/^([a-zA-Z0-9_.-]+)_v(\d+)$/);
          if (prodVideoMatch) {
            const prodId = prodVideoMatch[1];
            const videoIdx = Number(prodVideoMatch[2]);
            const prodSnap = await db.collection('catalog_products').doc(prodId).get();
            const prodData = prodSnap.exists ? prodSnap.data() : undefined;
            if (
              prodSnap.exists &&
              prodData?.isActive !== false &&
              Array.isArray(prodData?.videoUrls) &&
              typeof prodData.videoUrls[videoIdx] === 'string' &&
              prodData.videoUrls[videoIdx].trim().length > 0
            ) {
              verifiedVideo = true;
            }
          }
          if (!verifiedVideo) {
            const videoSnap = await db.collection('videos').doc(proofId).get();
            const vData = videoSnap.exists ? videoSnap.data() : undefined;
            if (
              videoSnap.exists &&
              vData?.status !== 'rejected' &&
              vData?.status !== 'unpublished' &&
              vData?.isPublished !== false
            ) {
              verifiedVideo = true;
            }
          }
          if (!verifiedVideo) {
            return res.status(400).json({ error: { message: 'Product or video watch activity could not be verified.' } });
          }
        } else if (missionId === 'share_shop') {
          if (proofId !== 'shop_link_share') {
            return res.status(400).json({ error: { message: 'Valid shop share confirmation is required.' } });
          }
        }

        const progressRef = db.collection('king_shop_mission_progress').doc(`${user.uid}_${todayStr}`);
        await progressRef.set(
          {
            uid: user.uid,
            date: todayStr,
            [missionId]: true,
            [`${missionId}_proof`]: proofId,
            updatedAt: now.toISOString(),
          },
          { merge: true }
        );

        return res.json({ success: true, missionId, verified: true });
      } catch (err: any) {
        return res.status(400).json({ error: { message: err?.message || 'Mission tracking failed' } });
      }
    }
  );

  // 3B. Complete Daily or Weekly Mission (Requires Server-Side Verification + Prevents Duplicates)
  app.post(
    '/api/shop/mission/complete',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const missionId = sanitizeSafeId(req.body?.missionId, 48);
        if (!missionId) {
          return res.status(400).json({ error: { message: 'Mission ID is required' } });
        }

        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const tz = settings.streakConfig.timezone;
        const todayStr = getServerDateKey(now, tz);
        const weekKey = getIsoWeekKey(now, tz);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const missionInfo = settings.missions[missionId];
        if (!missionInfo || !missionInfo.enabled) {
          return res.status(400).json({ error: { message: 'Invalid or disabled mission ID' } });
        }

        const isWeekly = missionInfo.period === 'weekly';
        const periodKey = isWeekly ? weekKey : todayStr;
        const docKey = `${user.uid}_${missionId}_${periodKey}`;
        const missionLogRef = db.collection('king_shop_missions').doc(docKey);
        const progressRef = db.collection('king_shop_mission_progress').doc(`${user.uid}_${todayStr}`);
        const checkinRef = db.collection('king_shop_checkins').doc(`${user.uid}_${todayStr}`);
        const spinLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_spin_${todayStr}`);
        const quizLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_quiz_${todayStr}`);
        const puzzleLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_puzzle_${todayStr}`);
        const scratchLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_scratch_${todayStr}`);
        const memoryLimitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_memory_${todayStr}`);
        const walletRef = db.collection('king_shop_wallets').doc(user.uid);

        const result = await db.runTransaction(async (tx) => {
          const [
            logSnap,
            progressSnap,
            checkinSnap,
            spinSnap,
            quizLimitSnap,
            puzzleSnap,
            scratchSnap,
            memorySnap,
            walletSnap,
          ] = await Promise.all([
            tx.get(missionLogRef),
            tx.get(progressRef),
            tx.get(checkinRef),
            tx.get(spinLimitRef),
            tx.get(quizLimitRef),
            tx.get(puzzleLimitRef),
            tx.get(scratchLimitRef),
            tx.get(memoryLimitRef),
            tx.get(walletRef),
          ]);

          if (logSnap.exists) {
            throw Object.assign(
              new Error(
                isWeekly
                  ? 'You have already claimed this weekly mission this week.'
                  : 'You have already completed this mission today.'
              ),
              { statusCode: 409 }
            );
          }

          const state = resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);

          // Verify real activity before rewarding
          if (missionId === 'daily_quiz') {
            const quizWins = quizLimitSnap.exists ? Number(quizLimitSnap.data()?.wins) || 0 : 0;
            if (quizWins < 1) {
              throw new Error('Complete and win today’s KING Quiz first to claim this mission!');
            }
          } else if (missionId === 'daily_checkin_mission') {
            if (!checkinSnap.exists && state.lastCheckinDate !== todayStr) {
              throw new Error('Claim today’s Daily Check-In first to unlock this mission!');
            }
          } else if (missionId === 'play_games_2') {
            const totalPlays =
              (spinSnap.exists ? Number(spinSnap.data()?.plays) || 0 : 0) +
              (quizLimitSnap.exists ? Number(quizLimitSnap.data()?.plays) || 0 : 0) +
              (puzzleSnap.exists ? Number(puzzleSnap.data()?.plays) || 0 : 0) +
              (scratchSnap.exists ? Number(scratchSnap.data()?.plays) || 0 : 0) +
              (memorySnap.exists ? Number(memorySnap.data()?.plays) || 0 : 0);
            if (totalPlays < 2) {
              throw new Error('Play at least 2 KING Arcade mini-games today first!');
            }
          } else if (missionId === 'arcade_variety_2') {
            const distinctCount = [spinSnap, quizLimitSnap, puzzleSnap, scratchSnap, memorySnap].filter(
              (s) => s.exists && (Number(s.data()?.plays) || 0) > 0
            ).length;
            if (distinctCount < 2) {
              throw new Error('Play 2 different KING Arcade games today to unlock this mission!');
            }
          } else if (missionId === 'weekly_streak_5') {
            const qualified =
              state.weeklyCheckinDates.length >= 5 ||
              (state.streak >= 5 && state.weeklyCheckinDates.length >= 1);
            if (!qualified) {
              throw new Error('Check in 5 days or maintain a 5+ day active streak this week first!');
            }
          } else if (missionId === 'weekly_quiz_5') {
            if (state.weeklyQuizWins < 5) {
              throw new Error(`Win 5 KING Quiz games this week first (${state.weeklyQuizWins}/5).`);
            }
          } else {
            const progressData = progressSnap.exists ? progressSnap.data() || {} : {};
            if (progressData[missionId] !== true) {
              throw new Error('Please perform the mission action in KING Shop first before claiming.');
            }
          }

          const cap = applyDailyCapCheck(state, missionInfo.coins, 'mission', settings);
          const rewardCoins = cap.creditedCoins;
          const newEarned = state.totalEarned + rewardCoins;
          const newBalance = newEarned - state.totalSpent;
          const newWeeklyEarned = state.weeklyEarned + rewardCoins;
          const nowIso = now.toISOString();

          tx.set(missionLogRef, {
            uid: user.uid,
            missionId,
            period: isWeekly ? 'weekly' : 'daily',
            date: periodKey,
            coins: rewardCoins,
            createdAt: Timestamp.fromDate(now),
          });

          tx.set(
            walletRef,
            {
              uid: user.uid,
              balance: newBalance,
              totalEarned: newEarned,
              totalSpent: state.totalSpent,
              weeklyEarned: newWeeklyEarned,
              weekKey: state.weekKey,
              dailyEarned: cap.nextDailyEarned,
              dailyKey: state.dailyKey,
              dailySourceEarned: cap.nextDailySourceEarned,
              updatedAt: nowIso,
            },
            { merge: true }
          );

          const txRef = db.collection('king_shop_transactions').doc();
          tx.set(txRef, {
            id: txRef.id,
            uid: user.uid,
            type: 'mission',
            title: missionInfo.title,
            coins: rewardCoins,
            createdAt: nowIso,
          });

          return { balance: newBalance, added: rewardCoins, missionId, period: isWeekly ? 'weekly' : 'daily' };
        });

        return res.json({ success: true, ...result });
      } catch (err: any) {
        const status = err?.statusCode === 429 ? 429 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Mission completion failed' } });
      }
    }
  );

  // 4A. Issue Quiz Challenge (Never exposes correctIndex to client, shuffles options & respects daily cap)
  app.get('/api/shop/games/quiz-question', generalApiRateLimiter, authenticateFirebaseToken, async (req: Request, res: Response) => {
    try {
      const user = (req as any).user as VerifiedUser;
      const db = getDb();
      const now = getNow();
      const settings = await loadSettings(db);
      const todayStr = getServerDateKey(now, settings.streakConfig.timezone);

      if (!settings.rewardsEnabled) {
        return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
      }
      if (!settings.games.quiz.enabled) {
        return res.status(403).json({ error: { message: 'The quiz game is currently disabled.' } });
      }

      const limitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_quiz_${todayStr}`);
      const historyRef = db.collection('king_shop_quiz_history').doc(`${user.uid}_${todayStr}`);
      const [limitSnap, historySnap] = await Promise.all([limitRef.get(), historyRef.get()]);
      const playCount = limitSnap.exists ? Number(limitSnap.data()?.plays) || 0 : 0;
      if (playCount >= settings.games.quiz.maxDailyPlays) {
        return res.status(429).json({
          error: {
            message: `Daily limit reached for quiz (${settings.games.quiz.maxDailyPlays} plays/day). Come back tomorrow!`,
          },
        });
      }

      const recentIdsRaw = historySnap.exists ? historySnap.data()?.recentIds : [];
      const recentIds = new Set<string>(Array.isArray(recentIdsRaw) ? recentIdsRaw.map(String) : []);
      const unseenPool = KING_QUIZ_BANK.filter((item) => !recentIds.has(item.id));
      const pool = unseenPool.length > 0 ? unseenPool : KING_QUIZ_BANK;
      const q = pool[randomInt(0, pool.length)];
      const shuffled = shuffleQuizOptions(q);

      const challengeId = `quiz_${randomBytes(12).toString('hex')}`;
      const nextRecentIds = unseenPool.length > 0 ? [...recentIds, q.id].slice(-KING_QUIZ_BANK.length) : [q.id];

      await Promise.all([
        db.collection('king_shop_game_sessions').doc(challengeId).set({
          id: challengeId,
          uid: user.uid,
          gameType: 'quiz',
          questionId: q.id,
          correctIndex: shuffled.correctIndex,
          used: false,
          date: todayStr,
          expiresAtMs: now.getTime() + 15 * 60 * 1000,
          createdAt: now.toISOString(),
        }),
        historyRef.set(
          {
            uid: user.uid,
            date: todayStr,
            recentIds: nextRecentIds,
            updatedAt: now.toISOString(),
          },
          { merge: true }
        ),
      ]);

      return res.json({
        challengeId,
        question: q.question,
        options: shuffled.options,
      });
    } catch (err: any) {
      return res.status(500).json({ error: { message: 'Failed to prepare quiz question.' } });
    }
  });

  // 4B. Issue Solvable Scrambled Puzzle Session (Checks enabled status & daily limit)
  app.post(
    '/api/shop/games/puzzle-start',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const todayStr = getServerDateKey(now, settings.streakConfig.timezone);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }
        if (!settings.games.puzzle.enabled) {
          return res.status(403).json({ error: { message: 'The puzzle game is currently disabled.' } });
        }

        const limitSnap = await db.collection('king_shop_game_limits').doc(`${user.uid}_puzzle_${todayStr}`).get();
        const playCount = limitSnap.exists ? Number(limitSnap.data()?.plays) || 0 : 0;
        if (playCount >= settings.games.puzzle.maxDailyPlays) {
          return res.status(429).json({
            error: {
              message: `Daily limit reached for puzzle (${settings.games.puzzle.maxDailyPlays} plays/day). Come back tomorrow!`,
            },
          });
        }

        const initialBoard = generateSolvablePuzzleBoard(14);
        const sessionId = `puz_${randomBytes(12).toString('hex')}`;

        await db.collection('king_shop_game_sessions').doc(sessionId).set({
          id: sessionId,
          uid: user.uid,
          gameType: 'puzzle',
          initialBoard,
          used: false,
          date: todayStr,
          expiresAtMs: now.getTime() + 30 * 60 * 1000,
          createdAt: now.toISOString(),
        });

        return res.json({ sessionId, board: initialBoard });
      } catch (err: any) {
        return res.status(500).json({ error: { message: 'Failed to start puzzle session.' } });
      }
    }
  );

  // 4B-2. Issue Server-Authoritative Scratch & Win Card Session
  app.post(
    '/api/shop/games/scratch-start',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const todayStr = getServerDateKey(now, settings.streakConfig.timezone);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }
        if (!settings.games.scratch.enabled) {
          return res.status(403).json({ error: { message: 'Scratch & Win is currently disabled.' } });
        }

        const limitSnap = await db.collection('king_shop_game_limits').doc(`${user.uid}_scratch_${todayStr}`).get();
        const playCount = limitSnap.exists ? Number(limitSnap.data()?.plays) || 0 : 0;
        if (playCount >= settings.games.scratch.maxDailyPlays) {
          return res.status(429).json({
            error: {
              message: `Daily limit reached for Scratch & Win (${settings.games.scratch.maxDailyPlays} plays/day). Come back tomorrow!`,
            },
          });
        }

        const segments = settings.games.scratch.winSegments.length
          ? settings.games.scratch.winSegments
          : computeScratchSegments(settings.games.scratch.minCoins, settings.games.scratch.maxCoins);
        const rolled = segments[randomInt(0, segments.length)];
        const prizeCoins = clampInt(rolled, settings.games.scratch.minCoins, settings.games.scratch.minCoins, settings.games.scratch.maxCoins);
        const gridSymbols = generateScratchGrid(prizeCoins);
        const sessionId = `scr_${randomBytes(12).toString('hex')}`;

        await db.collection('king_shop_game_sessions').doc(sessionId).set({
          id: sessionId,
          uid: user.uid,
          gameType: 'scratch',
          prizeCoins,
          gridSymbols,
          used: false,
          date: todayStr,
          expiresAtMs: now.getTime() + 15 * 60 * 1000,
          createdAt: now.toISOString(),
        });

        return res.json({
          sessionId,
          gridSize: 9,
          minReveal: 3,
          playsUsed: playCount,
          maxDailyPlays: settings.games.scratch.maxDailyPlays,
        });
      } catch (err: any) {
        return res.status(500).json({ error: { message: 'Failed to start Scratch & Win card.' } });
      }
    }
  );

  // 4B-3. Issue Server-Authoritative Memory Match Session (12 cards = 6 pairs)
  app.post(
    '/api/shop/games/memory-start',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const todayStr = getServerDateKey(now, settings.streakConfig.timezone);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }
        if (!settings.games.memory.enabled) {
          return res.status(403).json({ error: { message: 'Memory Match is currently disabled.' } });
        }

        const limitSnap = await db.collection('king_shop_game_limits').doc(`${user.uid}_memory_${todayStr}`).get();
        const playCount = limitSnap.exists ? Number(limitSnap.data()?.plays) || 0 : 0;
        if (playCount >= settings.games.memory.maxDailyPlays) {
          return res.status(429).json({
            error: {
              message: `Daily limit reached for Memory Match (${settings.games.memory.maxDailyPlays} plays/day). Come back tomorrow!`,
            },
          });
        }

        const deck = generateMemoryDeck();
        const sessionId = `mem_${randomBytes(12).toString('hex')}`;

        await db.collection('king_shop_game_sessions').doc(sessionId).set({
          id: sessionId,
          uid: user.uid,
          gameType: 'memory',
          deck,
          matchedPairs: [],
          matchedIndices: [],
          moves: 0,
          used: false,
          date: todayStr,
          expiresAtMs: now.getTime() + 20 * 60 * 1000,
          createdAt: now.toISOString(),
        });

        return res.json({
          sessionId,
          cardCount: 12,
          pairCount: 6,
          playsUsed: playCount,
          maxDailyPlays: settings.games.memory.maxDailyPlays,
        });
      } catch (err: any) {
        return res.status(500).json({ error: { message: 'Failed to start Memory Match game.' } });
      }
    }
  );

  // 4B-4. Server-Verified Memory Match Flip (Reveals only 2 requested indices)
  app.post(
    '/api/shop/games/memory-flip',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    arcadeFlipRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const sessionId = sanitizeSafeId(req.body?.sessionId, 64);
        const rawIndices = req.body?.indices;

        if (
          !sessionId ||
          !Array.isArray(rawIndices) ||
          rawIndices.length !== 2 ||
          !Number.isInteger(rawIndices[0]) ||
          !Number.isInteger(rawIndices[1]) ||
          rawIndices[0] < 0 ||
          rawIndices[0] > 11 ||
          rawIndices[1] < 0 ||
          rawIndices[1] > 11 ||
          rawIndices[0] === rawIndices[1]
        ) {
          return res.status(400).json({ error: { message: 'Valid sessionId and two distinct card indices (0–11) are required.' } });
        }

        const [idxA, idxB] = rawIndices as [number, number];
        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const todayStr = getServerDateKey(now, settings.streakConfig.timezone);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const sessionRef = db.collection('king_shop_game_sessions').doc(sessionId);
        const outcome = await db.runTransaction(async (tx) => {
          const snap = await tx.get(sessionRef);
          if (!snap.exists) {
            throw Object.assign(new Error('Memory session not found. Please start a new game.'), { statusCode: 404 });
          }
          const sData = snap.data() || {};
          if (sData.uid !== user.uid || sData.gameType !== 'memory' || sData.date !== todayStr) {
            throw new Error('Memory session does not belong to your active session.');
          }
          if (sData.used === true) {
            throw Object.assign(new Error('This Memory Match game is already completed.'), { statusCode: 409 });
          }
          if (Number(sData.expiresAtMs) < now.getTime()) {
            throw new Error('Memory Match session expired. Please start a fresh game.');
          }

          const deck = Array.isArray(sData.deck) ? sData.deck.map(String) : [];
          if (deck.length !== 12) {
            throw new Error('Corrupted Memory Match deck.');
          }

          const matchedIndices: number[] = Array.isArray(sData.matchedIndices)
            ? sData.matchedIndices.map(Number)
            : [];
          const matchedPairs: string[] = Array.isArray(sData.matchedPairs)
            ? sData.matchedPairs.map(String)
            : [];

          if (matchedIndices.includes(idxA) || matchedIndices.includes(idxB)) {
            throw new Error('One of those cards is already matched.');
          }

          const symA = deck[idxA];
          const symB = deck[idxB];
          const isMatch = symA === symB;
          const nextMoves = (Number(sData.moves) || 0) + 1;
          const nextMatchedPairs = isMatch && !matchedPairs.includes(symA) ? [...matchedPairs, symA] : matchedPairs;
          const nextMatchedIndices = isMatch ? [...matchedIndices, idxA, idxB] : matchedIndices;

          tx.update(sessionRef, {
            matchedPairs: nextMatchedPairs,
            matchedIndices: nextMatchedIndices,
            moves: nextMoves,
            updatedAt: now.toISOString(),
          });

          return {
            matched: isMatch,
            cards: [symA, symB],
            matchedPairs: nextMatchedPairs,
            matchedIndices: nextMatchedIndices,
            moves: nextMoves,
            completed: nextMatchedPairs.length === KING_MEMORY_SYMBOLS.length,
          };
        });

        return res.json({ success: true, ...outcome });
      } catch (err: any) {
        const status = err?.statusCode === 404 ? 404 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Memory flip failed.' } });
      }
    }
  );

  // 4C. Mini-Game Reward Verification (Quiz, Puzzle, Spin, Scratch, Memory — strictly server-validated)
  app.post(
    '/api/shop/game/reward',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const gameType = sanitizeSafeId(req.body?.gameType, 24);
        if (!gameType || !['spin', 'quiz', 'puzzle', 'scratch', 'memory'].includes(gameType)) {
          return res.status(400).json({
            error: { message: 'Valid game type (spin, quiz, puzzle, scratch, memory) is required.' },
          });
        }

        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const todayStr = getServerDateKey(now, settings.streakConfig.timezone);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const gameConfig = settings.games[gameType as 'spin' | 'quiz' | 'puzzle' | 'scratch' | 'memory'];
        if (!gameConfig?.enabled) {
          return res.status(403).json({ error: { message: `The ${gameType} game is currently disabled.` } });
        }

        const limitRef = db.collection('king_shop_game_limits').doc(`${user.uid}_${gameType}_${todayStr}`);
        const walletRef = db.collection('king_shop_wallets').doc(user.uid);
        const vipProfileRef = db.collection('king_shop_vip_profiles').doc(user.uid);

        // Validate challenge / session parameters BEFORE entering transaction
        let sessionRef: FirebaseFirestore.DocumentReference | null = null;
        let selectedOption: number | null = null;
        let puzzleMoves: number[] | null = null;
        let scratchCells: number[] | null = null;

        if (gameType === 'quiz') {
          const challengeId = sanitizeSafeId(req.body?.challengeId, 64);
          selectedOption = req.body?.selectedOption;
          if (!challengeId || typeof selectedOption !== 'number' || !Number.isInteger(selectedOption) || selectedOption < 0 || selectedOption > 3) {
            return res.status(400).json({ error: { message: 'Valid quiz challengeId and selectedOption are required.' } });
          }
          sessionRef = db.collection('king_shop_game_sessions').doc(challengeId);
        } else if (gameType === 'puzzle') {
          const sessionId = sanitizeSafeId(req.body?.sessionId, 64);
          const moves = req.body?.moves;
          if (!sessionId || !Array.isArray(moves) || moves.length === 0 || moves.length > 500) {
            return res.status(400).json({ error: { message: 'Valid puzzle sessionId and move sequence are required.' } });
          }
          puzzleMoves = moves;
          sessionRef = db.collection('king_shop_game_sessions').doc(sessionId);
        } else if (gameType === 'scratch') {
          const sessionId = sanitizeSafeId(req.body?.sessionId, 64);
          const rawCells = req.body?.scratchedCells;
          const uniqueCells = Array.isArray(rawCells)
            ? Array.from(
                new Set(
                  rawCells.filter((n: unknown) => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 8)
                )
              )
            : [];
          if (!sessionId || uniqueCells.length < 3) {
            return res.status(400).json({ error: { message: 'Scratch at least 3 tiles cleanly to claim your card.' } });
          }
          scratchCells = uniqueCells;
          sessionRef = db.collection('king_shop_game_sessions').doc(sessionId);
        } else if (gameType === 'memory') {
          const sessionId = sanitizeSafeId(req.body?.sessionId, 64);
          if (!sessionId) {
            return res.status(400).json({ error: { message: 'Valid memory sessionId is required.' } });
          }
          sessionRef = db.collection('king_shop_game_sessions').doc(sessionId);
        }

        const result = await db.runTransaction(async (tx) => {
          const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
            tx.get(limitRef),
            tx.get(walletRef),
            tx.get(vipProfileRef),
          ];
          if (sessionRef) reads.push(tx.get(sessionRef));

          const [limitSnap, walletSnap, vipSnap, sessionSnap] = await Promise.all(reads);
          const playCount = limitSnap.exists ? Number(limitSnap.data()?.plays) || 0 : 0;
          const prevWins = limitSnap.exists ? Number(limitSnap.data()?.wins) || 0 : 0;
          const maxDailyPlays = gameConfig.maxDailyPlays;

          if (sessionSnap && sessionSnap.exists) {
            const preData = sessionSnap.data() || {};
            if (preData.uid === user.uid && preData.gameType === gameType && preData.used === true) {
              throw Object.assign(new Error(`This ${gameType} session was already submitted or claimed.`), {
                statusCode: 409,
              });
            }
          }

          if (playCount >= maxDailyPlays) {
            throw Object.assign(
              new Error(`Daily limit reached for ${gameType} (${maxDailyPlays} plays/day). Come back tomorrow!`),
              { statusCode: 429 }
            );
          }

          let rewardCoins = 0;
          let gameTitle = 'Mini Game Reward';
          let segmentIndex: number | undefined;
          let gridSymbolsOut: string[] | undefined;
          let correct = true;
          let correctIndexOut: number | undefined;

          if (gameType === 'spin') {
            const boundedOptions = computeSpinSegments(settings.games.spin.minCoins, settings.games.spin.maxCoins);
            segmentIndex = randomInt(0, boundedOptions.length);
            rewardCoins = boundedOptions[segmentIndex];
            gameTitle = 'Lucky Spin Reward';
          } else if (gameType === 'quiz') {
            if (!sessionSnap || !sessionSnap.exists) {
              throw new Error('Quiz challenge not found or expired. Please start a new quiz.');
            }
            const sData = sessionSnap.data() || {};
            if (sData.uid !== user.uid || sData.gameType !== 'quiz' || sData.date !== todayStr) {
              throw new Error('Quiz challenge does not belong to your current session.');
            }
            if (sData.used === true) {
              throw Object.assign(new Error('This quiz challenge was already submitted.'), { statusCode: 409 });
            }
            if (Number(sData.expiresAtMs) < now.getTime()) {
              throw new Error('Quiz challenge expired. Please request a new question.');
            }

            correctIndexOut = Number(sData.correctIndex);
            correct = selectedOption === correctIndexOut;

            if (!correct) {
              tx.update(sessionRef!, { used: true, answeredAt: now.toISOString(), selectedOption });
              // Consume one daily play attempt so attackers cannot brute-force endlessly
              tx.set(
                limitRef,
                {
                  uid: user.uid,
                  gameType: 'quiz',
                  date: todayStr,
                  plays: playCount + 1,
                  wins: prevWins,
                  updatedAt: Timestamp.fromDate(now),
                },
                { merge: true }
              );
              const state = resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);
              tx.set(
                walletRef,
                {
                  totalGamesPlayed: state.totalGamesPlayed + 1,
                  updatedAt: now.toISOString(),
                },
                { merge: true }
              );
              return {
                won: false,
                correct: false,
                correctIndex: correctIndexOut,
                added: 0,
                balance: state.balance,
                playsLeft: maxDailyPlays - (playCount + 1),
              };
            }

            rewardCoins = settings.games.quiz.rewardCoins;
            gameTitle = 'KING Quiz Correct Answer';
          } else if (gameType === 'puzzle') {
            if (!sessionSnap || !sessionSnap.exists) {
              throw new Error('Puzzle session not found or expired. Please start a new puzzle.');
            }
            const sData = sessionSnap.data() || {};
            if (sData.uid !== user.uid || sData.gameType !== 'puzzle' || sData.date !== todayStr) {
              throw new Error('Puzzle session does not belong to your current session.');
            }
            if (sData.used === true) {
              throw Object.assign(new Error('This puzzle session was already claimed.'), { statusCode: 409 });
            }
            if (Number(sData.expiresAtMs) < now.getTime()) {
              throw new Error('Puzzle session expired. Please start a fresh puzzle.');
            }
            if (!verifyPuzzleMoves(sData.initialBoard, puzzleMoves)) {
              throw new Error('Puzzle solution could not be verified. Solve all tiles 1–8 cleanly.');
            }

            rewardCoins = settings.games.puzzle.rewardCoins;
            gameTitle = 'KING Puzzle Completion';
          } else if (gameType === 'scratch') {
            if (!sessionSnap || !sessionSnap.exists) {
              throw new Error('Scratch card session not found or expired. Start a fresh card.');
            }
            const sData = sessionSnap.data() || {};
            if (sData.uid !== user.uid || sData.gameType !== 'scratch' || sData.date !== todayStr) {
              throw new Error('Scratch card does not belong to your active session.');
            }
            if (sData.used === true) {
              throw Object.assign(new Error('This Scratch & Win card was already claimed.'), { statusCode: 409 });
            }
            if (Number(sData.expiresAtMs) < now.getTime()) {
              throw new Error('Scratch card expired. Please request a fresh card.');
            }
            rewardCoins = clampInt(
              sData.prizeCoins,
              settings.games.scratch.minCoins,
              settings.games.scratch.minCoins,
              settings.games.scratch.maxCoins
            );
            gridSymbolsOut = Array.isArray(sData.gridSymbols) ? sData.gridSymbols.map(String) : [];
            gameTitle = 'KING Scratch & Win Prize';
          } else if (gameType === 'memory') {
            if (!sessionSnap || !sessionSnap.exists) {
              throw new Error('Memory Match session not found or expired. Start a fresh board.');
            }
            const sData = sessionSnap.data() || {};
            if (sData.uid !== user.uid || sData.gameType !== 'memory' || sData.date !== todayStr) {
              throw new Error('Memory Match session does not belong to your active session.');
            }
            if (sData.used === true) {
              throw Object.assign(new Error('This Memory Match reward was already claimed.'), { statusCode: 409 });
            }
            if (Number(sData.expiresAtMs) < now.getTime()) {
              throw new Error('Memory Match session expired. Please start a fresh board.');
            }
            const matchedPairs = Array.isArray(sData.matchedPairs) ? sData.matchedPairs : [];
            if (matchedPairs.length < KING_MEMORY_SYMBOLS.length) {
              throw new Error('Match all 6 card pairs before claiming your Memory Match reward.');
            }
            rewardCoins = settings.games.memory.rewardCoins;
            gameTitle = 'KING Memory Match Victory';
          }

          const state = resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);
          const vipProfile = resolveEffectiveVipProfile(vipSnap.exists ? vipSnap.data() : null, settings);
          const vipCalc = computeVipBonusCoins(rewardCoins, 'game', vipProfile, settings);
          const cap = applyDailyCapCheck(state, vipCalc.totalRequested, 'game', settings);
          const creditedCoins = cap.creditedCoins;
          const creditedVipBonus = Math.max(0, creditedCoins - Math.min(creditedCoins, vipCalc.baseCoins));
          const newEarned = state.totalEarned + creditedCoins;
          const newBalance = newEarned - state.totalSpent;
          const newWeeklyEarned = state.weeklyEarned + creditedCoins;
          const nowIso = now.toISOString();

          if (gameType === 'quiz') {
            tx.update(sessionRef!, { used: true, answeredAt: nowIso, selectedOption });
          } else if (gameType === 'puzzle') {
            tx.update(sessionRef!, { used: true, completedAt: nowIso, movesCount: puzzleMoves!.length });
          } else if (gameType === 'scratch') {
            tx.update(sessionRef!, { used: true, claimedAt: nowIso, scratchedCells: scratchCells });
          } else if (gameType === 'memory') {
            tx.update(sessionRef!, { used: true, claimedAt: nowIso });
          }

          tx.set(
            limitRef,
            {
              uid: user.uid,
              gameType,
              date: todayStr,
              plays: playCount + 1,
              wins: prevWins + 1,
              updatedAt: Timestamp.fromDate(now),
            },
            { merge: true }
          );

          tx.set(
            walletRef,
            {
              uid: user.uid,
              balance: newBalance,
              totalEarned: newEarned,
              totalSpent: state.totalSpent,
              weeklyEarned: newWeeklyEarned,
              weekKey: state.weekKey,
              dailyEarned: cap.nextDailyEarned,
              dailyKey: state.dailyKey,
              dailySourceEarned: cap.nextDailySourceEarned,
              totalGamesPlayed: state.totalGamesPlayed + 1,
              totalQuizWins: state.totalQuizWins + (gameType === 'quiz' ? 1 : 0),
              weeklyQuizWins: state.weeklyQuizWins + (gameType === 'quiz' ? 1 : 0),
              weeklyQuizWeekKey: state.weekKey,
              totalPuzzleWins: state.totalPuzzleWins + (gameType === 'puzzle' ? 1 : 0),
              updatedAt: nowIso,
            },
            { merge: true }
          );

          const txRef = db.collection('king_shop_transactions').doc();
          tx.set(txRef, {
            id: txRef.id,
            uid: user.uid,
            type: 'game',
            title:
              creditedVipBonus > 0
                ? `${gameTitle} (+${creditedVipBonus} ${vipProfile.tierLabel} VIP)`
                : gameTitle,
            coins: creditedCoins,
            vipBonusCoins: creditedVipBonus,
            createdAt: nowIso,
          });

          return {
            won: true,
            correct: true,
            correctIndex: correctIndexOut,
            segmentIndex,
            gridSymbols: gridSymbolsOut,
            balance: newBalance,
            added: creditedCoins,
            vipBonusCoins: creditedVipBonus,
            vipTier: vipProfile.tier,
            playsLeft: maxDailyPlays - (playCount + 1),
          };
        });

        return res.json({ success: result.won, ...result });
      } catch (err: any) {
        const status = err?.statusCode === 429 ? 429 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Game reward failed' } });
      }
    }
  );

  // 4D. Claim Verified One-Time Achievement (Server-Checked, No VIP Multiplier)
  app.post(
    '/api/shop/achievements/claim',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const achievementId = sanitizeSafeId(req.body?.achievementId, 48);
        if (!achievementId) {
          return res.status(400).json({ error: { message: 'Achievement ID is required.' } });
        }

        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const achConfig = settings.achievements[achievementId];
        if (!achConfig || !achConfig.enabled) {
          return res.status(400).json({ error: { message: 'Invalid or disabled achievement.' } });
        }

        const achRef = db.collection('king_shop_achievements').doc(`${user.uid}_${achievementId}`);
        const walletRef = db.collection('king_shop_wallets').doc(user.uid);
        const vipRef = db.collection('king_shop_vip_profiles').doc(user.uid);

        const result = await db.runTransaction(async (tx) => {
          const [achSnap, walletSnap, vipSnap] = await Promise.all([
            tx.get(achRef),
            tx.get(walletRef),
            tx.get(vipRef),
          ]);

          if (achSnap.exists) {
            throw Object.assign(new Error('You have already claimed this achievement.'), { statusCode: 409 });
          }

          const state = resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);
          const vipProfile = resolveEffectiveVipProfile(vipSnap.exists ? vipSnap.data() : null, settings);
          const currentVal = getAchievementMetricValue(achConfig.metric, state, vipProfile.tierRank);
          if (currentVal < achConfig.target) {
            throw new Error(`Unlock requirement not reached yet (${currentVal}/${achConfig.target}).`);
          }

          // Strict: NO VIP multiplier on achievements
          // Anti-Truncation Protection: One-time lifetime achievements must not be burned for partial coins
          const globalRemaining = Math.max(0, settings.economyConfig.globalDailyEarnCap - state.dailyEarned);
          const sourceCap = settings.economyConfig.sourceDailyCaps.achievement;
          const currentSourceEarned = state.dailySourceEarned.achievement || 0;
          const sourceRemaining = Math.max(0, sourceCap - currentSourceEarned);
          const allowedRemaining = Math.min(globalRemaining, sourceRemaining);

          if (allowedRemaining < achConfig.rewardCoins) {
            throw Object.assign(
              new Error(
                `Daily achievement coin cap exceeded (${allowedRemaining}/${achConfig.rewardCoins} remaining today). Please claim tomorrow after midnight reset to receive your full reward without truncation!`
              ),
              { statusCode: 429 }
            );
          }

          const cap = applyDailyCapCheck(state, achConfig.rewardCoins, 'achievement', settings);
          const rewardCoins = cap.creditedCoins;
          const newEarned = state.totalEarned + rewardCoins;
          const newBalance = newEarned - state.totalSpent;
          const newWeeklyEarned = state.weeklyEarned + rewardCoins;
          const nowIso = now.toISOString();

          tx.set(achRef, {
            uid: user.uid,
            achievementId,
            coins: rewardCoins,
            claimedAt: nowIso,
            createdAt: nowIso,
          });

          tx.set(
            walletRef,
            {
              uid: user.uid,
              balance: newBalance,
              totalEarned: newEarned,
              totalSpent: state.totalSpent,
              weeklyEarned: newWeeklyEarned,
              weekKey: state.weekKey,
              dailyEarned: cap.nextDailyEarned,
              dailyKey: state.dailyKey,
              dailySourceEarned: cap.nextDailySourceEarned,
              updatedAt: nowIso,
            },
            { merge: true }
          );

          const txRef = db.collection('king_shop_transactions').doc();
          tx.set(txRef, {
            id: txRef.id,
            uid: user.uid,
            type: 'achievement',
            title: `Achievement Unlocked: ${achConfig.title}`,
            coins: rewardCoins,
            createdAt: nowIso,
          });

          return {
            achievementId,
            added: rewardCoins,
            balance: newBalance,
          };
        });

        return res.json({ success: true, ...result });
      } catch (err: any) {
        const status = err?.statusCode === 429 ? 429 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Achievement claim failed.' } });
      }
    }
  );

  // 5. Redeem Rewards (Coupons & Free Delivery with Min Order, Expiry, Usage Limits & Atomic Lock)
  app.post(
    '/api/shop/redeem',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const rewardId = sanitizeSafeId(req.body?.rewardId, 48);
        const idempotencyKey = sanitizeSafeId(req.body?.idempotencyKey, 64);

        if (!rewardId) {
          return res.status(400).json({ error: { message: 'Reward ID is required' } });
        }

        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const todayStr = getServerDateKey(now, settings.streakConfig.timezone);

        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const reward = settings.rewardsCatalog[rewardId];
        if (!reward || !reward.enabled) {
          return res.status(400).json({ error: { message: 'Invalid or unavailable reward selection' } });
        }

        const walletRef = db.collection('king_shop_wallets').doc(user.uid);
        const redemptionLimitRef = db.collection('king_shop_redemption_limits').doc(`${user.uid}_${todayStr}`);
        const couponLockRef = db.collection('king_shop_coupon_locks').doc(`${user.uid}_${rewardId}`);
        const idempRef = idempotencyKey
          ? db.collection('king_shop_idempotency').doc(`${user.uid}_redeem_${idempotencyKey}`)
          : null;
        const couponCode = `KING-${randomBytes(4).toString('hex').toUpperCase()}-${reward.value}`;
        const minOrderAmount = Math.max(0, Number(reward.minOrderAmount) || 0);
        const expiryDays = clampInt(reward.expiryDays, 30, 1, 365);
        const expiresAtMs = now.getTime() + expiryDays * 24 * 60 * 60 * 1000;
        const expiresAtIso = new Date(expiresAtMs).toISOString();

        const result = await db.runTransaction(async (tx) => {
          const reads: Promise<FirebaseFirestore.DocumentSnapshot>[] = [
            tx.get(walletRef),
            tx.get(redemptionLimitRef),
            tx.get(couponLockRef),
          ];
          if (idempRef) reads.push(tx.get(idempRef));

          const [walletSnap, limitSnap, lockSnap, idempSnap] = await Promise.all(reads);

          if (idempSnap && idempSnap.exists) {
            throw Object.assign(new Error('Duplicate redemption request detected.'), { statusCode: 409 });
          }

          const state = resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);

          if (state.balance < reward.cost) {
            throw new Error(
              `Insufficient KING Coins! You need ${reward.cost} coins (Balance: ${state.balance}).`
            );
          }

          const dailyCount = limitSnap.exists ? Number(limitSnap.data()?.count) || 0 : 0;
          if (dailyCount >= MAX_DAILY_REDEMPTIONS_PER_USER) {
            throw Object.assign(
              new Error(`Daily redemption limit reached (${MAX_DAILY_REDEMPTIONS_PER_USER}/day). Come back tomorrow!`),
              { statusCode: 429 }
            );
          }

          if (lockSnap.exists) {
            const lockData = lockSnap.data() || {};
            const lockExpiresAtMs = Number(lockData.expiresAtMs) || 0;
            if (lockExpiresAtMs === 0 || lockExpiresAtMs > now.getTime()) {
              throw Object.assign(
                new Error(`You already have an active "${reward.title}" voucher. Use it before redeeming another.`),
                { statusCode: 409 }
              );
            }
          }

          const newSpent = state.totalSpent + reward.cost;
          const newBalance = state.totalEarned - newSpent;
          if (newBalance < 0 || newSpent > state.totalEarned) {
            throw new Error('Wallet balance invariant failed.');
          }
          const nowIso = now.toISOString();

          if (idempRef) {
            tx.set(idempRef, {
              uid: user.uid,
              rewardId,
              createdAt: nowIso,
            });
          }

          tx.set(
            redemptionLimitRef,
            {
              uid: user.uid,
              date: todayStr,
              count: dailyCount + 1,
              updatedAt: nowIso,
            },
            { merge: true }
          );

          tx.set(
            walletRef,
            {
              uid: user.uid,
              balance: newBalance,
              totalEarned: state.totalEarned,
              totalSpent: newSpent,
              weeklyEarned: state.weeklyEarned,
              weekKey: state.weekKey,
              updatedAt: nowIso,
            },
            { merge: true }
          );

          const rewardDiscount = resolveCouponDiscountAmount(
            { type: reward.type, rewardId, code: couponCode, discountAmount: reward.discountAmount },
            settings
          );
          const eligibleCategories = Array.isArray(reward.eligibleCategories)
            ? reward.eligibleCategories
            : [];

          const couponRef = db.collection('king_shop_coupons').doc();
          tx.set(couponRef, {
            id: couponRef.id,
            uid: user.uid,
            rewardId,
            title: reward.title,
            code: couponCode,
            cost: reward.cost,
            type: reward.type,
            discountAmount: rewardDiscount,
            minOrderAmount,
            eligibleCategories,
            maxUses: 1,
            usesCount: 0,
            status: 'active',
            expiresAt: expiresAtIso,
            expiresAtMs,
            createdAt: nowIso,
          });

          tx.set(couponLockRef, {
            uid: user.uid,
            rewardId,
            activeCouponId: couponRef.id,
            expiresAtMs,
            updatedAt: nowIso,
          });

          const txRef = db.collection('king_shop_transactions').doc();
          tx.set(txRef, {
            id: txRef.id,
            uid: user.uid,
            type: 'redeem',
            title: `Redeemed: ${reward.title}`,
            coins: -reward.cost,
            createdAt: nowIso,
          });

          return {
            balance: newBalance,
            code: couponCode,
            title: reward.title,
            couponId: couponRef.id,
            discountAmount: rewardDiscount,
            minOrderAmount,
            expiresAt: expiresAtIso,
          };
        });

        return res.json({ success: true, ...result });
      } catch (err: any) {
        const status = err?.statusCode === 429 ? 429 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Redemption failed' } });
      }
    }
  );

  // 6. Public Multi-Mode Leaderboard (Weekly / Daily / VIP, Masked Nicknames, Privacy Opt-Out, Zero Private PII/Spend)
  app.get('/api/shop/leaderboard', generalApiRateLimiter, async (req: Request, res: Response) => {
    try {
      const rawType = typeof req.query?.type === 'string' ? req.query.type.trim().toLowerCase() : 'weekly';
      if (!['weekly', 'daily', 'vip'].includes(rawType)) {
        return res.status(400).json({ error: { message: 'Valid leaderboard type (weekly|daily|vip) required.' } });
      }
      const mode = rawType as 'weekly' | 'daily' | 'vip';

      const db = getDb();
      const now = getNow();
      const settings = await loadSettings(db);
      const tz = settings.streakConfig.timezone;
      const currentWeekKey = getIsoWeekKey(now, tz);
      const todayStr = getServerDateKey(now, tz);

      if (mode === 'vip') {
        let vipRaw: any[] = [];
        try {
          const snap = await db
            .collection('king_shop_vip_profiles')
            .orderBy('vipScore', 'desc')
            .limit(50)
            .get();
          vipRaw = snap.docs.map((d) => ({ uid: d.id, ...d.data() }));
        } catch (err: any) {
          const msg = String(err?.message || '').toLowerCase();
          if (err?.code === 9 || err?.code === 'failed-precondition' || msg.includes('index')) {
            const fallbackSnap = await db.collection('king_shop_vip_profiles').limit(500).get();
            vipRaw = fallbackSnap.docs
              .map((d) => ({ uid: d.id, ...d.data() }))
              .sort((a: any, b: any) => (Number(b.vipScore) || 0) - (Number(a.vipScore) || 0))
              .slice(0, 50);
          } else {
            throw err;
          }
        }

        const eligibleVips = vipRaw
          .filter((vp) => {
            const spend = Number(vp?.verifiedSpendTotal) || 0;
            const override = typeof vp?.manualOverrideTier === 'string' && vp.manualOverrideTier.length > 0;
            const score = Number(vp?.vipScore) || 0;
            return typeof vp?.uid === 'string' && vp.uid.length > 0 && (spend > 0 || override || score > 0);
          })
          .sort((a: any, b: any) => {
            const diff = (Number(b.vipScore) || 0) - (Number(a.vipScore) || 0);
            if (diff !== 0) return diff;
            return String(a.uid || '').localeCompare(String(b.uid || ''));
          });

        const uids = eligibleVips.map((v) => String(v.uid));
        const profilesMap: Record<string, any> = {};
        const walletsMap: Record<string, any> = {};

        if (uids.length > 0) {
          const profileRefs = uids.map((uid) => db.collection('publicProfiles').doc(uid));
          const walletRefs = uids.map((uid) => db.collection('king_shop_wallets').doc(uid));
          const [profileSnaps, walletSnaps] = await Promise.all([
            db.getAll(...profileRefs),
            db.getAll(...walletRefs),
          ]);
          profileSnaps.forEach((p) => {
            if (p.exists) profilesMap[p.id] = p.data();
          });
          walletSnaps.forEach((w) => {
            if (w.exists) walletsMap[w.id] = w.data();
          });
        }

        const filteredVips = eligibleVips
          .filter((vp) => walletsMap[vp.uid]?.leaderboardOptOut !== true)
          .slice(0, 20);

        const leaderboard = filteredVips.map((vp: any, index: number) => {
          const eff = resolveEffectiveVipProfile(vp, settings);
          const profile = profilesMap[vp.uid] || {};
          const rawHandle = profile.username || profile.displayName || profile.name || '';
          return {
            rank: index + 1,
            nickname: maskNickname(rawHandle, vp.uid),
            photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
            vipTier: eff.tier,
            vipTierLabel: eff.tierLabel,
            vipScore: eff.vipScore,
          };
        });

        return res.json({
          type: 'vip',
          key: 'all_time_vip',
          weekKey: currentWeekKey,
          leaderboard,
        });
      }

      const keyField = mode === 'daily' ? 'dailyKey' : 'weekKey';
      const keyVal = mode === 'daily' ? todayStr : currentWeekKey;
      const metricField = mode === 'daily' ? 'dailyEarned' : 'weeklyEarned';

      let wallets: any[] = [];
      try {
        const snap = await db
          .collection('king_shop_wallets')
          .where(keyField, '==', keyVal)
          .orderBy(metricField, 'desc')
          .limit(50)
          .get();
        wallets = snap.docs.map((d) => d.data());
      } catch (err: any) {
        const msg = String(err?.message || '').toLowerCase();
        if (err?.code === 9 || err?.code === 'failed-precondition' || msg.includes('index')) {
          const fallbackSnap = await db
            .collection('king_shop_wallets')
            .where(keyField, '==', keyVal)
            .limit(500)
            .get();
          wallets = fallbackSnap.docs
            .map((d) => d.data())
            .sort((a: any, b: any) => {
              const diff = (Number(b[metricField]) || 0) - (Number(a[metricField]) || 0);
              if (diff !== 0) return diff;
              return String(a.uid || '').localeCompare(String(b.uid || ''));
            })
            .slice(0, 50);
        } else {
          throw err;
        }
      }

      const activeWallets = wallets
        .filter((w) => Number(w?.[metricField]) > 0 && typeof w?.uid === 'string' && w?.leaderboardOptOut !== true)
        .sort((a: any, b: any) => {
          const diff = (Number(b[metricField]) || 0) - (Number(a[metricField]) || 0);
          if (diff !== 0) return diff;
          return String(a.uid || '').localeCompare(String(b.uid || ''));
        })
        .slice(0, 20);
      const uids = activeWallets.map((w) => String(w.uid));
      const profilesMap: Record<string, any> = {};

      if (uids.length > 0) {
        const refs = uids.map((uid) => db.collection('publicProfiles').doc(uid));
        const profileSnaps = await db.getAll(...refs);
        profileSnaps.forEach((p) => {
          if (p.exists) {
            profilesMap[p.id] = p.data();
          }
        });
      }

      const leaderboard = activeWallets.map((w: any, index: number) => {
        const profile = profilesMap[w.uid] || {};
        const rawHandle = profile.username || profile.displayName || profile.name || '';
        const score = Math.max(0, Number(w[metricField]) || 0);
        return {
          rank: index + 1,
          nickname: maskNickname(rawHandle, w.uid),
          photoURL: typeof profile.photoURL === 'string' ? profile.photoURL : '',
          weeklyCoins: mode === 'weekly' ? score : undefined,
          dailyCoins: mode === 'daily' ? score : undefined,
          coins: score,
        };
      });

      return res.json({
        type: mode,
        key: keyVal,
        weekKey: currentWeekKey,
        dailyKey: todayStr,
        leaderboard,
      });
    } catch (err: any) {
      return res.status(500).json({ error: { message: 'Failed to load leaderboard.' } });
    }
  });

  // 6-priv. Leaderboard Privacy Opt-Out Toggle
  app.post(
    '/api/shop/leaderboard/privacy',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        if (typeof req.body?.optOut !== 'boolean') {
          return res.status(400).json({ error: { message: 'Boolean optOut field is required.' } });
        }
        const optOut = req.body.optOut;
        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const walletRef = db.collection('king_shop_wallets').doc(user.uid);

        await db.runTransaction(async (tx) => {
          const walletSnap = await tx.get(walletRef);
          resolveWalletStateForTx(walletSnap, user.uid, settings, now, tx, db);
          tx.set(
            walletRef,
            {
              uid: user.uid,
              leaderboardOptOut: optOut,
              updatedAt: now.toISOString(),
            },
            { merge: true }
          );
        });

        return res.json({ success: true, leaderboardOptOut: optOut });
      } catch (err: any) {
        return res.status(400).json({ error: { message: err?.message || 'Failed to update privacy preference.' } });
      }
    }
  );

  interface ResolvedCheckoutItem {
    productId: string;
    name: string;
    category: string;
    unitPrice: number;
    quantity: number;
    lineTotal: number;
  }

  async function resolveTrustedCheckoutItems(
    db: Firestore,
    rawItems: unknown
  ): Promise<{ items: ResolvedCheckoutItem[]; subtotal: number }> {
    if (!Array.isArray(rawItems) || rawItems.length === 0 || rawItems.length > 20) {
      throw Object.assign(new Error('At least 1 valid catalog product item is required.'), { statusCode: 400 });
    }

    const aggregatedQty = new Map<string, number>();
    for (const entry of rawItems) {
      const productId = sanitizeSafeId((entry as any)?.productId, 128);
      if (!productId) {
        throw Object.assign(new Error('Valid productId is required for every checkout item.'), { statusCode: 400 });
      }
      const rawQty = (entry as any)?.quantity ?? 1;
      if (typeof rawQty !== 'number' || !Number.isInteger(rawQty) || rawQty < 1 || rawQty > 20) {
        throw Object.assign(new Error('Item quantity must be a whole number between 1 and 20.'), { statusCode: 400 });
      }
      const nextQty = (aggregatedQty.get(productId) || 0) + rawQty;
      if (nextQty > 20) {
        throw Object.assign(new Error('Maximum 20 units per product per WhatsApp order.'), { statusCode: 400 });
      }
      aggregatedQty.set(productId, nextQty);
    }

    const items: ResolvedCheckoutItem[] = [];
    let subtotal = 0;

    for (const [productId, quantity] of aggregatedQty.entries()) {
      const snap = await db.collection('catalog_products').doc(productId).get();
      if (!snap.exists) {
        throw Object.assign(
          new Error(`Product "${productId}" was not found in the active Firestore catalog.`),
          { statusCode: 400 }
        );
      }

      const data = snap.data() || {};
      if (data.isActive === false) {
        throw Object.assign(new Error('One or more selected products are currently unavailable.'), {
          statusCode: 400,
        });
      }
      const name = String(data.name || 'KING Product').trim();
      const category = String(data.category || 'General').trim();
      const orig = Number(data.originalPrice) || 0;
      const disc = Number(data.discountPrice);
      const unitPrice = Number.isFinite(disc) && disc > 0 && disc < orig ? Math.round(disc) : Math.round(orig);
      const stock = Math.max(0, Math.floor(Number(data.stock) || 0));

      if (unitPrice <= 0) {
        throw Object.assign(new Error(`Invalid catalog pricing for "${name}".`), { statusCode: 400 });
      }
      if (stock <= 0 || quantity > stock) {
        throw Object.assign(new Error(`"${name}" does not have enough stock (${stock} available).`), {
          statusCode: 400,
        });
      }

      const lineTotal = unitPrice * quantity;
      subtotal += lineTotal;
      items.push({ productId, name, category, unitPrice, quantity, lineTotal });
    }

    return { items, subtotal };
  }

  function evaluateCouponAgainstItems(
    rawCoupon: any,
    couponId: string,
    uid: string,
    items: ResolvedCheckoutItem[],
    subtotal: number,
    nowMs: number,
    settings: KingShopSettings,
    walletData?: FirebaseFirestore.DocumentData | null
  ) {
    const coupon = normalizeCouponView({ id: couponId, ...rawCoupon }, nowMs, settings);

    if (coupon.uid !== uid) {
      throw Object.assign(new Error('This voucher belongs to a different account.'), { statusCode: 403 });
    }

    if (walletData) {
      const bal = Number(walletData.balance) || 0;
      const earned = Number(walletData.totalEarned) || 0;
      const spent = Number(walletData.totalSpent) || 0;
      if (bal < 0 || spent > earned) {
        throw Object.assign(new Error('Wallet balance integrity check failed for this voucher.'), { statusCode: 400 });
      }
      if (
        typeof coupon.requiresMinBalance === 'number' &&
        coupon.requiresMinBalance > 0 &&
        bal < coupon.requiresMinBalance
      ) {
        throw Object.assign(
          new Error(`Minimum wallet balance of ${coupon.requiresMinBalance} KING Coins required.`),
          { statusCode: 400 }
        );
      }
    }

    if (coupon.status === 'reserved') {
      throw Object.assign(
        new Error(
          `Voucher is currently reserved for pending order ${coupon.reservedOrderRef || ''}. Complete or release it first.`.trim()
        ),
        { statusCode: 409 }
      );
    }
    if (coupon.status === 'used' || coupon.usesCount >= coupon.maxUses) {
      throw Object.assign(new Error('This voucher has already been used.'), { statusCode: 409 });
    }
    if (coupon.status === 'expired') {
      throw Object.assign(new Error('This voucher has expired.'), { statusCode: 400 });
    }
    if (coupon.status !== 'active') {
      throw Object.assign(new Error(`Voucher is ${coupon.status} and cannot be applied.`), { statusCode: 400 });
    }

    const eligibleCats = (coupon.eligibleCategories || []).map((c: string) => c.toLowerCase());
    const eligibleSubtotal =
      eligibleCats.length > 0
        ? items
            .filter((item) => eligibleCats.includes(item.category.toLowerCase()))
            .reduce((sum, item) => sum + item.lineTotal, 0)
        : subtotal;

    if (eligibleSubtotal <= 0) {
      throw Object.assign(
        new Error(`Voucher is only valid for: ${coupon.eligibleCategories.join(', ')}.`),
        { statusCode: 400 }
      );
    }

    if (coupon.minOrderAmount > 0 && subtotal < coupon.minOrderAmount) {
      throw Object.assign(
        new Error(`Minimum order of Rs. ${coupon.minOrderAmount.toLocaleString()} required for this voucher.`),
        { statusCode: 400 }
      );
    }

    const isFreeDelivery = coupon.type === 'delivery';
    const rawDiscount = isFreeDelivery ? 0 : resolveCouponDiscountAmount(coupon, settings);
    const discountAmount = isFreeDelivery ? 0 : Math.min(eligibleSubtotal, Math.max(0, rawDiscount));
    const finalTotal = Math.max(0, subtotal - discountAmount);

    return {
      coupon,
      eligibleSubtotal,
      discountAmount,
      freeDelivery: isFreeDelivery,
      finalTotal,
    };
  }

  function buildVerifiedWhatsAppPayload(params: {
    orderRef: string;
    items: ResolvedCheckoutItem[];
    subtotal: number;
    couponCode?: string;
    discountAmount: number;
    freeDelivery: boolean;
    finalTotal: number;
    reservationExpiresAt?: string;
  }): { message: string; whatsappUrl: string } {
    const itemsText = params.items
      .map((item) => `• ${item.name} x${item.quantity} — Rs. ${item.lineTotal.toLocaleString()}`)
      .join('\n');

    const lines = [
      'Hello KING SHOP! 👑',
      `Order Ref: ${params.orderRef}`,
      'I want to order:',
      itemsText,
      `Subtotal: Rs. ${params.subtotal.toLocaleString()}`,
    ];

    if (params.couponCode) {
      lines.push(`Voucher Code: ${params.couponCode}`);
      if (params.freeDelivery) {
        lines.push('Voucher Benefit: Free Delivery');
      } else {
        lines.push(`Discount: - Rs. ${params.discountAmount.toLocaleString()}`);
      }
    }

    lines.push(`Final Payable: Rs. ${params.finalTotal.toLocaleString()}`);
    if (params.reservationExpiresAt) {
      lines.push(`Voucher Held Until: ${params.reservationExpiresAt}`);
    }
    lines.push('Please confirm my order!');

    const message = lines.join('\n');
    const whatsappUrl = `https://wa.me/${KING_SHOP_OWNER_WHATSAPP}?text=${encodeURIComponent(message)}`;
    return { message, whatsappUrl };
  }

  // 6b. Customer Coupon Validation (Server-Computed Subtotal & Ownership Enforcement)
  app.post(
    '/api/shop/coupons/validate',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
        if (!rawCode || rawCode.length > 64 || !/^[A-Z0-9_-]+$/.test(rawCode)) {
          return res.status(400).json({ error: { message: 'Valid coupon code is required.' } });
        }

        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        if (!settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const { items, subtotal } = await resolveTrustedCheckoutItems(db, req.body?.items);
        const snap = await db.collection('king_shop_coupons').where('code', '==', rawCode).limit(1).get();
        if (snap.docs.length === 0) {
          return res.status(404).json({ error: { message: 'Coupon code not found.' } });
        }

        const walletSnap = await db.collection('king_shop_wallets').doc(user.uid).get();
        const docSnap = snap.docs[0];
        const evaluated = evaluateCouponAgainstItems(
          docSnap.data(),
          docSnap.id,
          user.uid,
          items,
          subtotal,
          now.getTime(),
          settings,
          walletSnap.exists ? walletSnap.data() : null
        );

        return res.json({
          valid: true,
          coupon: evaluated.coupon,
          items,
          subtotal,
          eligibleSubtotal: evaluated.eligibleSubtotal,
          discountAmount: evaluated.discountAmount,
          freeDelivery: evaluated.freeDelivery,
          finalTotal: evaluated.finalTotal,
        });
      } catch (err: any) {
        const status = err?.statusCode || 400;
        return res.status(status).json({ error: { message: err?.message || 'Coupon validation failed.' } });
      }
    }
  );

  // 6c. Secure WhatsApp Checkout with Atomic Short-Lived Coupon Reservation & Idempotency
  app.post(
    '/api/shop/checkout/whatsapp',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const rawCode =
          typeof req.body?.couponCode === 'string' ? req.body.couponCode.trim().toUpperCase() : '';
        if (rawCode && (rawCode.length > 64 || !/^[A-Z0-9_-]+$/.test(rawCode))) {
          return res.status(400).json({ error: { message: 'Invalid coupon code format.' } });
        }
        const idempotencyKey = sanitizeSafeId(req.body?.idempotencyKey, 64);

        const db = getDb();
        const now = getNow();
        const nowMs = now.getTime();
        const nowIso = now.toISOString();
        const settings = await loadSettings(db);

        if (rawCode && !settings.rewardsEnabled) {
          return res.status(403).json({ error: { message: 'Rewards program is currently paused.' } });
        }

        const { items, subtotal } = await resolveTrustedCheckoutItems(db, req.body?.items);
        const itemsSignature = items.map((i) => `${i.productId}:${i.quantity}`).sort().join('|');

        let preFoundCouponId = '';
        if (rawCode) {
          const snap = await db.collection('king_shop_coupons').where('code', '==', rawCode).limit(1).get();
          if (snap.docs.length === 0) {
            return res.status(404).json({ error: { message: 'Coupon code not found.' } });
          }
          preFoundCouponId = snap.docs[0].id;
        }

        const dateCompact = getServerDateKey(now, settings.streakConfig.timezone).replace(/-/g, '');
        const candidateOrderRef = `ORD-${dateCompact}-${randomBytes(3).toString('hex').toUpperCase()}`;
        const reserveUntilMs = nowMs + RESERVATION_TTL_MS;
        const reserveUntilIso = new Date(reserveUntilMs).toISOString();

        const idempRef = idempotencyKey
          ? db.collection('king_shop_idempotency').doc(`${user.uid}_checkout_${idempotencyKey}`)
          : null;
        const couponRef = preFoundCouponId
          ? db.collection('king_shop_coupons').doc(preFoundCouponId)
          : null;
        const walletRef = db.collection('king_shop_wallets').doc(user.uid);

        const orderRefDoc = db.collection('king_shop_orders').doc(candidateOrderRef);
        const result = await db.runTransaction(async (tx) => {
          const [idempSnap, couponSnap, walletSnap, existingOrderSnap] = await Promise.all([
            idempRef ? tx.get(idempRef) : Promise.resolve(null),
            couponRef ? tx.get(couponRef) : Promise.resolve(null),
            tx.get(walletRef),
            tx.get(orderRefDoc),
          ]);

          if (existingOrderSnap.exists) {
            throw Object.assign(new Error('Order reference collision. Please retry checkout.'), { statusCode: 409 });
          }

          if (idempSnap && idempSnap.exists) {
            const cached = idempSnap.data() || {};
            if (
              cached.couponCode !== rawCode ||
              cached.itemsSignature !== itemsSignature
            ) {
              throw Object.assign(
                new Error('Duplicate checkout key does not match original order items or voucher.'),
                { statusCode: 409 }
              );
            }
            const cachedExpiresMs = Number(cached.reservationExpiresAtMs) || 0;
            if (!rawCode || cachedExpiresMs > nowMs) {
              return {
                ...(cached.responseSnapshot || {}),
                idempotentReplay: true,
              };
            }
            throw Object.assign(
              new Error('Previous checkout reservation expired. Please start a fresh checkout.'),
              { statusCode: 409 }
            );
          }

          let discountAmount = 0;
          let freeDelivery = false;
          let validatedCoupon: any = null;

          if (couponRef && couponSnap) {
            if (!couponSnap.exists) {
              throw Object.assign(new Error('Coupon code not found.'), { statusCode: 404 });
            }
            const evaluated = evaluateCouponAgainstItems(
              couponSnap.data(),
              couponSnap.id,
              user.uid,
              items,
              subtotal,
              nowMs,
              settings,
              walletSnap.exists ? walletSnap.data() : null
            );
            discountAmount = evaluated.discountAmount;
            freeDelivery = evaluated.freeDelivery;
            validatedCoupon = {
              ...evaluated.coupon,
              status: 'reserved',
              reservedOrderRef: candidateOrderRef,
              reservedUntil: reserveUntilIso,
            };

            tx.update(couponRef, {
              status: 'reserved',
              reservedOrderRef: candidateOrderRef,
              reservedAt: nowIso,
              reservedUntil: reserveUntilIso,
              reservedUntilMs: reserveUntilMs,
              reservedAmount: subtotal,
              reservedDiscount: discountAmount,
              updatedAt: nowIso,
            });
          }

          const finalTotal = Math.max(0, subtotal - discountAmount);
          const { message, whatsappUrl } = buildVerifiedWhatsAppPayload({
            orderRef: candidateOrderRef,
            items,
            subtotal,
            couponCode: rawCode || undefined,
            discountAmount,
            freeDelivery,
            finalTotal,
            reservationExpiresAt: rawCode ? reserveUntilIso : undefined,
          });

          tx.set(orderRefDoc, {
            orderRef: candidateOrderRef,
            uid: user.uid,
            items,
            subtotal,
            couponId: couponRef ? couponRef.id : '',
            couponCode: rawCode || '',
            discountAmount,
            freeDelivery,
            finalTotal,
            status: 'pending_whatsapp',
            paymentStatus: 'unpaid',
            verificationMethod: 'unverified_whatsapp_pending',
            vipCounted: false,
            vipCountedAmount: 0,
            refundedAmount: 0,
            reservationExpiresAt: rawCode ? reserveUntilIso : '',
            reservationExpiresAtMs: rawCode ? reserveUntilMs : 0,
            auditLog: [
              {
                action: 'whatsapp_checkout_initiated',
                actorUid: user.uid,
                at: nowIso,
                note: 'Customer opened WhatsApp checkout; payment not yet manually verified.',
              },
            ],
            createdAt: nowIso,
            updatedAt: nowIso,
          });

          const responsePayload = {
            orderRef: candidateOrderRef,
            items,
            subtotal,
            couponCode: rawCode || '',
            coupon: validatedCoupon,
            discountAmount,
            freeDelivery,
            finalTotal,
            reservationExpiresAt: rawCode ? reserveUntilIso : '',
            whatsappMessage: message,
            whatsappUrl,
            idempotentReplay: false,
          };

          if (idempRef) {
            tx.set(idempRef, {
              uid: user.uid,
              orderRef: candidateOrderRef,
              couponCode: rawCode,
              itemsSignature,
              reservationExpiresAtMs: rawCode ? reserveUntilMs : nowMs + RESERVATION_TTL_MS,
              responseSnapshot: responsePayload,
              createdAt: nowIso,
            });
          }

          return responsePayload;
        });

        return res.json({ success: true, ...result });
      } catch (err: any) {
        const status = err?.statusCode || 400;
        return res.status(status).json({ error: { message: err?.message || 'WhatsApp checkout failed.' } });
      }
    }
  );

  // 6d. Release Abandoned WhatsApp Checkout Reservation
  app.post(
    '/api/shop/checkout/release',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    mutationRateLimiter,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const user = (req as any).user as VerifiedUser;
        const rawCode =
          typeof req.body?.couponCode === 'string' ? req.body.couponCode.trim().toUpperCase() : '';
        const orderRefId = sanitizeSafeId(req.body?.orderRef, 64);

        if (!rawCode && !orderRefId) {
          return res.status(400).json({ error: { message: 'couponCode or orderRef is required.' } });
        }

        const db = getDb();
        const now = getNow();
        const nowMs = now.getTime();
        const nowIso = now.toISOString();

        let targetCouponId = '';
        if (rawCode) {
          const snap = await db.collection('king_shop_coupons').where('code', '==', rawCode).limit(1).get();
          if (snap.docs.length > 0) targetCouponId = snap.docs[0].id;
        }

        let targetOrderId = orderRefId;
        if (!targetCouponId && targetOrderId) {
          const oSnap = await db.collection('king_shop_orders').doc(targetOrderId).get();
          if (oSnap.exists) {
            const oData = oSnap.data() || {};
            if (oData.uid !== user.uid) {
              return res.status(403).json({ error: { message: 'Order belongs to another user.' } });
            }
            if (typeof oData.couponId === 'string' && oData.couponId) {
              targetCouponId = oData.couponId;
            }
          }
        }

        if (!targetCouponId && !targetOrderId) {
          return res.status(404).json({ error: { message: 'Reservation not found.' } });
        }

        const out = await db.runTransaction(async (tx) => {
          const couponRef = targetCouponId ? db.collection('king_shop_coupons').doc(targetCouponId) : null;
          const couponSnap = couponRef ? await tx.get(couponRef) : null;

          if (couponSnap && !couponSnap.exists) {
            throw Object.assign(new Error('Coupon not found.'), { statusCode: 404 });
          }

          let releasedStatus = 'active';
          let resolvedOrderId = targetOrderId;
          let shouldUpdateCoupon = false;

          if (couponSnap && couponSnap.exists) {
            const cData = couponSnap.data() || {};
            if (cData.uid !== user.uid) {
              throw Object.assign(new Error('You do not own this voucher reservation.'), { statusCode: 403 });
            }
            if (!resolvedOrderId && typeof cData.reservedOrderRef === 'string') {
              resolvedOrderId = cData.reservedOrderRef;
            }
            if (cData.status === 'used') {
              throw Object.assign(new Error('Used coupons cannot be released.'), { statusCode: 409 });
            }
            const cExpiresMs = Number(cData.expiresAtMs) || 0;
            releasedStatus = cExpiresMs > 0 && nowMs > cExpiresMs ? 'expired' : 'active';
            shouldUpdateCoupon = cData.status === 'reserved';
          }

          const oRef = resolvedOrderId ? db.collection('king_shop_orders').doc(resolvedOrderId) : null;
          const oSnap = oRef ? await tx.get(oRef) : null;

          if (oSnap && oSnap.exists) {
            const oData = oSnap.data() || {};
            if (oData.uid !== user.uid) {
              throw Object.assign(new Error('Order belongs to another user.'), { statusCode: 403 });
            }
          }

          // Perform all writes strictly after all reads
          if (shouldUpdateCoupon && couponRef) {
            tx.update(couponRef, {
              status: releasedStatus === 'expired' ? 'expired' : 'active',
              reservedOrderRef: '',
              reservedAt: '',
              reservedUntil: '',
              reservedUntilMs: 0,
              updatedAt: nowIso,
            });
          }

          if (oRef && oSnap && oSnap.exists && oSnap.data()?.status === 'pending_whatsapp') {
            tx.update(oRef, { status: 'cancelled', updatedAt: nowIso });
          }

          return { released: true, status: releasedStatus, orderRef: resolvedOrderId };
        });

        return res.json({ success: true, ...out });
      } catch (err: any) {
        const status = err?.statusCode || 400;
        return res.status(status).json({ error: { message: err?.message || 'Failed to release reservation.' } });
      }
    }
  );

  // 7. Admin Controls — Overview, Settings, Coupons, Orders, Transactions (Super Admin Only)
  app.get(
    '/api/shop/admin/overview',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    async (_req: Request, res: Response) => {
      try {
        const db = getDb();
        const settings = await loadSettings(db);

        let transactions: any[] = [];
        let coupons: any[] = [];
        let orders: any[] = [];
        let vipProfilesRaw: any[] = [];
        let auditLogs: any[] = [];
        try {
          const [txSnap, couponSnap, orderSnap, vipSnap, auditSnap] = await Promise.all([
            db.collection('king_shop_transactions').orderBy('createdAt', 'desc').limit(50).get(),
            db.collection('king_shop_coupons').orderBy('createdAt', 'desc').limit(50).get(),
            db.collection('king_shop_orders').orderBy('createdAt', 'desc').limit(50).get(),
            db.collection('king_shop_vip_profiles').limit(50).get(),
            db.collection('king_shop_admin_audit').orderBy('createdAt', 'desc').limit(30).get(),
          ]);
          transactions = txSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          coupons = couponSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          orders = orderSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          vipProfilesRaw = vipSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          auditLogs = auditSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {
          const [txSnap, couponSnap, orderSnap, vipSnap, auditSnap] = await Promise.all([
            db.collection('king_shop_transactions').limit(50).get(),
            db.collection('king_shop_coupons').limit(50).get(),
            db.collection('king_shop_orders').limit(50).get(),
            db.collection('king_shop_vip_profiles').limit(50).get(),
            db.collection('king_shop_admin_audit').limit(30).get(),
          ]);
          transactions = txSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
          coupons = couponSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
          orders = orderSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
          vipProfilesRaw = vipSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
          auditLogs = auditSnap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }

        const nowMs = getNow().getTime();
        const sanitizedOrders = orders.map((o) => ({
          id: o.id,
          orderRef: o.orderRef || o.id,
          uidPrefix: typeof o.uid === 'string' ? o.uid.slice(0, 8) : '',
          couponCode: o.couponCode || '',
          subtotal: Number(o.subtotal) || 0,
          discountAmount: Number(o.discountAmount) || 0,
          freeDelivery: Boolean(o.freeDelivery),
          finalTotal: Number(o.finalTotal) || 0,
          refundedAmount: Number(o.refundedAmount) || 0,
          paymentStatus: o.paymentStatus || (o.status === 'confirmed' ? 'paid' : o.status === 'refunded' ? 'refunded' : 'unpaid'),
          verificationMethod: o.verificationMethod || (o.status === 'confirmed' ? 'manual_admin' : 'unverified_whatsapp_pending'),
          verifiedBy: o.verifiedBy || '',
          verifiedAt: o.verifiedAt || '',
          verifiedNote: o.verifiedNote || '',
          vipCounted: Boolean(o.vipCounted),
          status:
            o.status === 'pending_whatsapp' &&
            Number(o.reservationExpiresAtMs) > 0 &&
            nowMs >= Number(o.reservationExpiresAtMs)
              ? 'reservation_expired'
              : o.status || 'pending_whatsapp',
          itemSummary: Array.isArray(o.items)
            ? o.items.map((it: any) => `${it.name || 'Item'} x${it.quantity || 1}`).join(', ')
            : '',
          reservationExpiresAt: o.reservationExpiresAt || '',
          createdAt: o.createdAt || '',
        }));

        const vipProfiles = vipProfilesRaw.map((vp) => {
          const eff = resolveEffectiveVipProfile(vp, settings);
          return {
            uid: vp.id,
            uidPrefix: String(vp.id || '').slice(0, 8),
            tier: eff.tier,
            tierLabel: eff.tierLabel,
            verifiedSpendTotal: eff.verifiedSpendTotal,
            verifiedOrderCount: eff.verifiedOrderCount,
            manualOverrideTier: eff.manualOverrideTier,
            manualOverrideReason: eff.manualOverrideReason,
            updatedAt: vp.updatedAt || '',
          };
        });

        return res.json({
          settings,
          transactions,
          coupons: coupons.map((c) => normalizeCouponView(c, nowMs, settings)),
          orders: sanitizedOrders,
          vipProfiles,
          auditLogs,
        });
      } catch (err: any) {
        return res.status(500).json({ error: { message: 'Failed to load KING Shop admin overview.' } });
      }
    }
  );

  app.post(
    '/api/shop/admin/settings',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const db = getDb();
        const current = await loadSettings(db);
        const incomingBody = req.body && typeof req.body === 'object' ? req.body : {};
        const incomingMissions =
          incomingBody.missions && typeof incomingBody.missions === 'object' ? incomingBody.missions : {};
        const mergedMissions: Record<string, any> = { ...current.missions };
        for (const key of Object.keys(incomingMissions)) {
          const entry = incomingMissions[key];
          if (entry && typeof entry === 'object') {
            mergedMissions[key] = { ...(current.missions[key] || {}), ...entry };
          }
        }

        const incomingAchievements =
          incomingBody.achievements && typeof incomingBody.achievements === 'object'
            ? incomingBody.achievements
            : {};
        const mergedAchievements: Record<string, any> = { ...current.achievements };
        for (const key of Object.keys(incomingAchievements)) {
          const entry = incomingAchievements[key];
          if (entry && typeof entry === 'object') {
            mergedAchievements[key] = { ...(current.achievements[key] || {}), ...entry };
          }
        }

        const incomingVipTiers =
          incomingBody.vipConfig?.tiers && typeof incomingBody.vipConfig.tiers === 'object'
            ? incomingBody.vipConfig.tiers
            : {};
        const mergedVipTiers: Record<string, any> = { ...current.vipConfig.tiers };
        for (const tierKey of Object.keys(mergedVipTiers)) {
          if (incomingVipTiers[tierKey] && typeof incomingVipTiers[tierKey] === 'object') {
            mergedVipTiers[tierKey] = { ...mergedVipTiers[tierKey], ...incomingVipTiers[tierKey] };
          }
        }

        const incomingRewards =
          incomingBody.rewardsCatalog && typeof incomingBody.rewardsCatalog === 'object'
            ? incomingBody.rewardsCatalog
            : {};
        const mergedRewardsCatalog: Record<string, any> = { ...current.rewardsCatalog };
        for (const key of Object.keys(incomingRewards)) {
          const entry = incomingRewards[key];
          if (entry && typeof entry === 'object') {
            mergedRewardsCatalog[key] = { ...(current.rewardsCatalog[key] || {}), ...entry };
          }
        }

        const merged = mergeSettings({
          ...current,
          ...incomingBody,
          streakConfig: {
            ...current.streakConfig,
            ...(incomingBody.streakConfig || {}),
          },
          economyConfig: {
            ...current.economyConfig,
            ...(incomingBody.economyConfig || {}),
            sourceDailyCaps: {
              ...current.economyConfig.sourceDailyCaps,
              ...(incomingBody.economyConfig?.sourceDailyCaps || {}),
            },
          },
          vipConfig: {
            ...current.vipConfig,
            ...(incomingBody.vipConfig || {}),
            tiers: mergedVipTiers,
          },
          achievements: mergedAchievements,
          missions: mergedMissions,
          games: {
            spin: { ...current.games.spin, ...(incomingBody.games?.spin || {}) },
            quiz: { ...current.games.quiz, ...(incomingBody.games?.quiz || {}) },
            puzzle: { ...current.games.puzzle, ...(incomingBody.games?.puzzle || {}) },
            scratch: { ...current.games.scratch, ...(incomingBody.games?.scratch || {}) },
            memory: { ...current.games.memory, ...(incomingBody.games?.memory || {}) },
          },
          rewardsCatalog: mergedRewardsCatalog,
        });
        merged.updatedAt = getNow().toISOString();

        await db.collection('king_shop_settings').doc('config').set(merged, { merge: false });
        return res.json({ success: true, settings: merged });
      } catch (err: any) {
        return res.status(400).json({ error: { message: err?.message || 'Failed to update reward settings.' } });
      }
    }
  );

  app.patch(
    '/api/shop/admin/coupons/:couponId',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const couponId = sanitizeSafeId(req.params.couponId, 128);
        const status = req.body?.status;
        const explicitOrderRef = sanitizeSafeId(req.body?.orderRef, 64);
        if (!couponId || !['active', 'used', 'revoked'].includes(status)) {
          return res.status(400).json({ error: { message: 'Valid couponId and status (active|used|revoked) required.' } });
        }
        const adminUser = (req as any).user as VerifiedUser;
        const db = getDb();
        const now = getNow();
        const nowIso = now.toISOString();
        const settings = await loadSettings(db);
        const couponRef = db.collection('king_shop_coupons').doc(couponId);

        const out = await db.runTransaction(async (tx) => {
          const snap = await tx.get(couponRef);
          if (!snap.exists) {
            throw Object.assign(new Error('Coupon not found.'), { statusCode: 404 });
          }

          const data = snap.data() || {};
          const currentStatus = String(data.status || 'active');
          const expiresAtMs = Number(data.expiresAtMs) || 0;
          const isExpired = expiresAtMs > 0 && now.getTime() > expiresAtMs;

          if (currentStatus === 'used') {
            throw Object.assign(new Error('Used coupons cannot be modified or reactivated.'), { statusCode: 409 });
          }
          if (status === 'active' && isExpired) {
            throw Object.assign(new Error('Expired coupons cannot be reactivated.'), { statusCode: 400 });
          }

          const uid = typeof data.uid === 'string' ? data.uid : '';
          const rewardId = typeof data.rewardId === 'string' ? data.rewardId : '';
          const linkedOrderId =
            explicitOrderRef ||
            (typeof data.reservedOrderRef === 'string' ? data.reservedOrderRef : '');

          const lockRef =
            uid && rewardId ? db.collection('king_shop_coupon_locks').doc(`${uid}_${rewardId}`) : null;
          const orderDocRef = linkedOrderId ? db.collection('king_shop_orders').doc(linkedOrderId) : null;
          const vipRef = uid ? db.collection('king_shop_vip_profiles').doc(uid) : null;
          const vipEventRef =
            linkedOrderId && status === 'used'
              ? db.collection('king_shop_vip_events').doc(`${linkedOrderId}_confirm_paid`)
              : null;

          const [lockSnap, orderSnap, vipSnap, vipEventSnap] = await Promise.all([
            lockRef ? tx.get(lockRef) : Promise.resolve(null),
            orderDocRef ? tx.get(orderDocRef) : Promise.resolve(null),
            vipRef ? tx.get(vipRef) : Promise.resolve(null),
            vipEventRef ? tx.get(vipEventRef) : Promise.resolve(null),
          ]);

          const patchPayload: Record<string, any> = {
            status,
            reservedOrderRef: '',
            reservedAt: '',
            reservedUntil: '',
            reservedUntilMs: 0,
            updatedAt: nowIso,
          };
          if (status === 'used') {
            patchPayload.usedAt = nowIso;
            patchPayload.usesCount = Math.max(1, (Number(data.usesCount) || 0) + 1);
            if (linkedOrderId) {
              patchPayload.usedOrderRef = linkedOrderId;
            }
          } else if (status === 'revoked') {
            patchPayload.revokedAt = nowIso;
          }

          tx.update(couponRef, patchPayload);
          if (
            lockRef &&
            lockSnap?.exists &&
            lockSnap.data()?.activeCouponId === couponId &&
            (status === 'used' || status === 'revoked')
          ) {
            tx.delete(lockRef);
          }

          if (orderDocRef && orderSnap?.exists) {
            const oData = orderSnap.data() || {};
            if (oData.status !== 'refunded' && oData.status !== 'cancelled') {
              const prevLog = Array.isArray(oData.auditLog) ? oData.auditLog : [];
              const finalTotal = Math.max(0, Math.round(Number(oData.finalTotal) || 0));
              let nextVipCounted = Boolean(oData.vipCounted);
              let nextVipAmount = Math.max(0, Math.round(Number(oData.vipCountedAmount) || 0));

              if (status === 'used' && !nextVipCounted && !vipEventSnap?.exists && uid && vipRef) {
                const rawVip = vipSnap?.exists ? vipSnap.data() || {} : {};
                const prevSpend = Math.max(0, Math.round(Number(rawVip.verifiedSpendTotal) || 0));
                const prevOrders = Math.max(0, Math.round(Number(rawVip.verifiedOrderCount) || 0));
                const prevRefs = Array.isArray(rawVip.countedOrderRefs) ? rawVip.countedOrderRefs.map(String) : [];
                const nextSpend = prevSpend + finalTotal;
                const effAfter = resolveEffectiveVipProfile(
                  { ...rawVip, verifiedSpendTotal: nextSpend, verifiedOrderCount: prevOrders + 1 },
                  settings
                );
                tx.set(
                  vipRef,
                  {
                    uid,
                    verifiedSpendTotal: nextSpend,
                    verifiedOrderCount: prevOrders + 1,
                    tier: effAfter.tier,
                    lifetimePeakTier: effAfter.lifetimePeakTier,
                    vipScore: effAfter.vipScore,
                    countedOrderRefs: [...prevRefs.slice(-99), linkedOrderId],
                    updatedAt: nowIso,
                  },
                  { merge: true }
                );
                if (vipEventRef) {
                  tx.set(vipEventRef, {
                    uid,
                    orderRef: linkedOrderId,
                    action: 'confirm_paid',
                    amountDelta: finalTotal,
                    actorUid: adminUser.uid,
                    createdAt: nowIso,
                  });
                }
                nextVipCounted = true;
                nextVipAmount = finalTotal;
              }

              tx.update(orderDocRef, {
                status: status === 'used' ? 'confirmed' : 'cancelled',
                paymentStatus: status === 'used' ? 'paid' : 'unpaid',
                verificationMethod: status === 'used' ? 'manual_admin' : 'unverified_whatsapp_pending',
                verifiedBy: status === 'used' ? (adminUser.email || adminUser.uid) : '',
                verifiedAt: status === 'used' ? nowIso : '',
                vipCounted: nextVipCounted,
                vipCountedAmount: nextVipAmount,
                auditLog: [
                  ...prevLog.slice(-19),
                  {
                    action: status === 'used' ? 'manual_admin_coupon_confirm' : 'manual_admin_coupon_cancel',
                    actorUid: adminUser.uid,
                    actorEmail: adminUser.email || '',
                    at: nowIso,
                  },
                ],
                updatedAt: nowIso,
              });
            }
          }

          const auditRef = db.collection('king_shop_admin_audit').doc();
          tx.set(auditRef, {
            id: auditRef.id,
            action: `coupon_${status}`,
            targetType: 'coupon',
            targetId: couponId,
            orderRef: linkedOrderId || '',
            actorUid: adminUser.uid,
            actorEmail: adminUser.email || '',
            createdAt: nowIso,
          });

          return { couponId, status, orderRef: linkedOrderId || '' };
        });

        return res.json({ success: true, ...out });
      } catch (err: any) {
        const status =
          err?.statusCode === 404 ? 404 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Failed to update coupon.' } });
      }
    }
  );

  // Manual Admin Order Verification / Cancellation / Refund (Audited, Syncs Verified VIP Spend)
  app.post(
    '/api/shop/admin/orders/:orderRef/verify',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const adminUser = (req as any).user as VerifiedUser;
        const orderRef = sanitizeSafeId(req.params.orderRef, 64);
        const action = req.body?.action;
        const note = typeof req.body?.note === 'string' ? req.body.note.trim().slice(0, 240) : '';
        const rawRefundAmount = req.body?.refundAmount;

        if (!orderRef || !['confirm_paid', 'cancel', 'refund'].includes(action)) {
          return res.status(400).json({
            error: { message: 'Valid orderRef and action (confirm_paid|cancel|refund) required.' },
          });
        }

        const db = getDb();
        const now = getNow();
        const nowIso = now.toISOString();
        const settings = await loadSettings(db);
        const orderDocRef = db.collection('king_shop_orders').doc(orderRef);

        const out = await db.runTransaction(async (tx) => {
          const orderSnap = await tx.get(orderDocRef);
          if (!orderSnap.exists) {
            throw Object.assign(new Error('Order not found.'), { statusCode: 404 });
          }

          const oData = orderSnap.data() || {};
          const currentStatus = String(oData.status || 'pending_whatsapp');
          const couponId = typeof oData.couponId === 'string' ? oData.couponId : '';
          const uid = typeof oData.uid === 'string' ? oData.uid : '';
          const couponRef = couponId ? db.collection('king_shop_coupons').doc(couponId) : null;
          const lockLookupRewardId = typeof oData.rewardId === 'string' ? oData.rewardId : '';
          const vipRef = uid ? db.collection('king_shop_vip_profiles').doc(uid) : null;
          const vipEventRef = db.collection('king_shop_vip_events').doc(`${orderRef}_${action}`);

          const [couponSnap, vipSnap, vipEventSnap] = await Promise.all([
            couponRef ? tx.get(couponRef) : Promise.resolve(null),
            vipRef ? tx.get(vipRef) : Promise.resolve(null),
            tx.get(vipEventRef),
          ]);
          const couponData = couponSnap?.exists ? couponSnap.data() || {} : null;
          const effectiveRewardId = lockLookupRewardId || (typeof couponData?.rewardId === 'string' ? couponData.rewardId : '');
          const lockRef =
            uid && effectiveRewardId
              ? db.collection('king_shop_coupon_locks').doc(`${uid}_${effectiveRewardId}`)
              : null;
          const lockSnap = lockRef ? await tx.get(lockRef) : null;

          const prevLog = Array.isArray(oData.auditLog) ? oData.auditLog : [];
          const finalTotal = Math.max(0, Math.round(Number(oData.finalTotal) || 0));
          const rawVipData = vipSnap?.exists ? vipSnap.data() || {} : {};
          const prevSpend = Math.max(0, Math.round(Number(rawVipData.verifiedSpendTotal) || 0));
          const prevOrdersCount = Math.max(0, Math.round(Number(rawVipData.verifiedOrderCount) || 0));
          const prevCountedRefs = Array.isArray(rawVipData.countedOrderRefs)
            ? rawVipData.countedOrderRefs.map(String)
            : [];
          let nextVipTierOut = resolveEffectiveVipProfile(rawVipData, settings).tier;

          if (action === 'confirm_paid') {
            if (currentStatus === 'confirmed' && oData.paymentStatus === 'paid') {
              throw Object.assign(new Error('Order is already manually verified as paid.'), { statusCode: 409 });
            }
            if (currentStatus === 'cancelled' || currentStatus === 'refunded') {
              throw Object.assign(new Error(`Cannot confirm an order that is already ${currentStatus}.`), {
                statusCode: 409,
              });
            }
            if (couponSnap && couponSnap.exists) {
              if (couponData?.status === 'used' && couponData?.usedOrderRef && couponData.usedOrderRef !== orderRef) {
                throw Object.assign(
                  new Error(`Order voucher was already used on another order (${couponData.usedOrderRef}).`),
                  { statusCode: 409 }
                );
              }
              if (couponData?.status === 'revoked') {
                throw Object.assign(new Error('Order voucher was revoked and cannot be confirmed.'), {
                  statusCode: 409,
                });
              }
            }

            const alreadyCounted = oData.vipCounted === true || vipEventSnap.exists || prevCountedRefs.includes(orderRef);
            const spendDelta = alreadyCounted ? 0 : finalTotal;
            if (!alreadyCounted && uid && vipRef) {
              const nextSpend = prevSpend + spendDelta;
              const nextOrders = prevOrdersCount + 1;
              const effAfter = resolveEffectiveVipProfile(
                { ...rawVipData, verifiedSpendTotal: nextSpend, verifiedOrderCount: nextOrders },
                settings
              );
              nextVipTierOut = effAfter.tier;
              tx.set(
                vipRef,
                {
                  uid,
                  verifiedSpendTotal: nextSpend,
                  verifiedOrderCount: nextOrders,
                  tier: effAfter.tier,
                  lifetimePeakTier: effAfter.lifetimePeakTier,
                  vipScore: effAfter.vipScore,
                  countedOrderRefs: [...prevCountedRefs.slice(-99), orderRef],
                  updatedAt: nowIso,
                },
                { merge: true }
              );
              tx.set(vipEventRef, {
                uid,
                orderRef,
                action: 'confirm_paid',
                amountDelta: spendDelta,
                actorUid: adminUser.uid,
                createdAt: nowIso,
              });
            }

            tx.update(orderDocRef, {
              status: 'confirmed',
              paymentStatus: 'paid',
              verificationMethod: 'manual_admin',
              verifiedBy: adminUser.email || adminUser.uid,
              verifiedByUid: adminUser.uid,
              verifiedAt: nowIso,
              verifiedNote: note || 'Manually verified by Super Admin',
              vipCounted: true,
              vipCountedAmount: alreadyCounted ? Math.max(0, Number(oData.vipCountedAmount) || 0) : spendDelta,
              auditLog: [
                ...prevLog.slice(-19),
                {
                  action: 'confirm_paid',
                  actorUid: adminUser.uid,
                  actorEmail: adminUser.email || '',
                  note: note || 'Manual payment & delivery verification',
                  at: nowIso,
                },
              ],
              updatedAt: nowIso,
            });

            if (couponRef && couponSnap?.exists && couponData?.status !== 'used') {
              tx.update(couponRef, {
                status: 'used',
                usedAt: nowIso,
                usedOrderRef: orderRef,
                usesCount: Math.max(1, (Number(couponData?.usesCount) || 0) + 1),
                reservedOrderRef: '',
                reservedAt: '',
                reservedUntil: '',
                reservedUntilMs: 0,
                updatedAt: nowIso,
              });
            }
            if (lockRef && lockSnap?.exists && lockSnap.data()?.activeCouponId === couponId) {
              tx.delete(lockRef);
            }
          } else if (action === 'cancel') {
            if (currentStatus === 'refunded') {
              throw Object.assign(new Error('Refunded orders cannot be cancelled.'), { statusCode: 409 });
            }

            const prevVipAmount = Math.max(0, Math.round(Number(oData.vipCountedAmount) || 0));
            const nextCountedRefs = prevCountedRefs.filter((r) => r !== orderRef);
            if (oData.vipCounted === true && prevVipAmount > 0 && uid && vipRef && !vipEventSnap.exists) {
              const nextSpend = Math.max(0, prevSpend - prevVipAmount);
              const nextOrders = Math.max(0, prevOrdersCount - 1);
              const effAfter = resolveEffectiveVipProfile(
                { ...rawVipData, verifiedSpendTotal: nextSpend, verifiedOrderCount: nextOrders },
                settings
              );
              nextVipTierOut = effAfter.tier;
              tx.set(
                vipRef,
                {
                  uid,
                  verifiedSpendTotal: nextSpend,
                  verifiedOrderCount: nextOrders,
                  tier: effAfter.tier,
                  lifetimePeakTier: effAfter.lifetimePeakTier,
                  vipScore: effAfter.vipScore,
                  countedOrderRefs: nextCountedRefs,
                  updatedAt: nowIso,
                },
                { merge: true }
              );
              tx.set(vipEventRef, {
                uid,
                orderRef,
                action: 'cancel',
                amountDelta: -prevVipAmount,
                actorUid: adminUser.uid,
                createdAt: nowIso,
              });
            } else if (uid && vipRef && prevCountedRefs.includes(orderRef)) {
              tx.set(
                vipRef,
                {
                  countedOrderRefs: nextCountedRefs,
                  updatedAt: nowIso,
                },
                { merge: true }
              );
            }

            tx.update(orderDocRef, {
              status: 'cancelled',
              paymentStatus: 'unpaid',
              vipCounted: false,
              vipCountedAmount: 0,
              cancelledBy: adminUser.email || adminUser.uid,
              cancelledAt: nowIso,
              cancelReason: note || 'Cancelled by Super Admin',
              auditLog: [
                ...prevLog.slice(-19),
                {
                  action: 'cancel',
                  actorUid: adminUser.uid,
                  actorEmail: adminUser.email || '',
                  note: note || 'Cancelled by Super Admin',
                  at: nowIso,
                },
              ],
              updatedAt: nowIso,
            });

            if (
              couponRef &&
              couponSnap?.exists &&
              couponData?.status === 'reserved' &&
              couponData?.reservedOrderRef === orderRef
            ) {
              const expMs = Number(couponData.expiresAtMs) || 0;
              tx.update(couponRef, {
                status: expMs > 0 && now.getTime() > expMs ? 'expired' : 'active',
                reservedOrderRef: '',
                reservedAt: '',
                reservedUntil: '',
                reservedUntilMs: 0,
                updatedAt: nowIso,
              });
            }
          } else if (action === 'refund') {
            if (currentStatus !== 'confirmed' || oData.paymentStatus !== 'paid') {
              throw Object.assign(new Error('Only manually verified paid orders can be refunded.'), {
                statusCode: 409,
              });
            }
            const refundAmt =
              rawRefundAmount !== undefined
                ? clampInt(rawRefundAmount, finalTotal, 1, Math.max(1, finalTotal))
                : finalTotal;

            const prevVipAmount = Math.max(0, Math.round(Number(oData.vipCountedAmount) || 0));
            const deductAmt = oData.vipCounted === true ? Math.min(prevVipAmount, refundAmt) : 0;
            const remainingVipAmt = Math.max(0, prevVipAmount - deductAmt);
            const nextCountedRefs = remainingVipAmt === 0
              ? prevCountedRefs.filter((r) => r !== orderRef)
              : prevCountedRefs;

            if (deductAmt > 0 && uid && vipRef && !vipEventSnap.exists) {
              const nextSpend = Math.max(0, prevSpend - deductAmt);
              const nextOrders = remainingVipAmt === 0 ? Math.max(0, prevOrdersCount - 1) : prevOrdersCount;
              const effAfter = resolveEffectiveVipProfile(
                { ...rawVipData, verifiedSpendTotal: nextSpend, verifiedOrderCount: nextOrders },
                settings
              );
              nextVipTierOut = effAfter.tier;
              tx.set(
                vipRef,
                {
                  uid,
                  verifiedSpendTotal: nextSpend,
                  verifiedOrderCount: nextOrders,
                  tier: effAfter.tier,
                  lifetimePeakTier: effAfter.lifetimePeakTier,
                  vipScore: effAfter.vipScore,
                  countedOrderRefs: nextCountedRefs,
                  updatedAt: nowIso,
                },
                { merge: true }
              );
              tx.set(vipEventRef, {
                uid,
                orderRef,
                action: 'refund',
                amountDelta: -deductAmt,
                actorUid: adminUser.uid,
                createdAt: nowIso,
              });
            } else if (remainingVipAmt === 0 && uid && vipRef && prevCountedRefs.includes(orderRef)) {
              tx.set(
                vipRef,
                {
                  countedOrderRefs: nextCountedRefs,
                  updatedAt: nowIso,
                },
                { merge: true }
              );
            }

            tx.update(orderDocRef, {
              status: 'refunded',
              paymentStatus: 'refunded',
              refundedAmount: refundAmt,
              vipCounted: remainingVipAmt > 0,
              vipCountedAmount: remainingVipAmt,
              refundedBy: adminUser.email || adminUser.uid,
              refundedAt: nowIso,
              refundReason: note || 'Refunded by Super Admin',
              auditLog: [
                ...prevLog.slice(-19),
                {
                  action: 'refund',
                  refundAmount: refundAmt,
                  actorUid: adminUser.uid,
                  actorEmail: adminUser.email || '',
                  note: note || 'Refunded by Super Admin',
                  at: nowIso,
                },
              ],
              updatedAt: nowIso,
            });
          }

          const auditRef = db.collection('king_shop_admin_audit').doc();
          tx.set(auditRef, {
            id: auditRef.id,
            action: `order_${action}`,
            targetType: 'order',
            targetId: orderRef,
            targetUid: uid,
            note,
            actorUid: adminUser.uid,
            actorEmail: adminUser.email || '',
            createdAt: nowIso,
          });

          return {
            orderRef,
            status: action === 'confirm_paid' ? 'confirmed' : action === 'cancel' ? 'cancelled' : 'refunded',
            paymentStatus: action === 'confirm_paid' ? 'paid' : action === 'refund' ? 'refunded' : 'unpaid',
            verificationMethod: action === 'confirm_paid' ? 'manual_admin' : oData.verificationMethod || '',
            vipTier: nextVipTierOut,
          };
        });

        return res.json({ success: true, ...out });
      } catch (err: any) {
        const status =
          err?.statusCode === 404 ? 404 : err?.statusCode === 409 ? 409 : 400;
        return res.status(status).json({ error: { message: err?.message || 'Order verification failed.' } });
      }
    }
  );

  // Manual Admin Wallet Coin Adjustment (Requires Reason, Prevents Negative Balance, Logged to Audit)
  app.post(
    '/api/shop/admin/wallet/adjust',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const adminUser = (req as any).user as VerifiedUser;
        const targetUid = sanitizeSafeId(req.body?.targetUid, 128);
        const rawAmount = req.body?.amount;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';
        const includeInWeekly = req.body?.includeInWeekly === true;

        if (!targetUid) {
          return res.status(400).json({ error: { message: 'Valid targetUid is required.' } });
        }
        if (typeof rawAmount !== 'number' || !Number.isInteger(rawAmount) || rawAmount === 0 || Math.abs(rawAmount) > 50_000) {
          return res.status(400).json({ error: { message: 'Integer amount between -50000 and 50000 (non-zero) is required.' } });
        }
        if (reason.length < 3) {
          return res.status(400).json({ error: { message: 'A clear adjustment reason (min 3 characters) is required.' } });
        }

        const db = getDb();
        const now = getNow();
        const nowIso = now.toISOString();
        const settings = await loadSettings(db);
        const walletRef = db.collection('king_shop_wallets').doc(targetUid);

        const out = await db.runTransaction(async (tx) => {
          const walletSnap = await tx.get(walletRef);
          const state = resolveWalletStateForTx(walletSnap, targetUid, settings, now, tx, db);

          let newEarned = state.totalEarned;
          let newSpent = state.totalSpent;
          let newWeekly = state.weeklyEarned;
          if (rawAmount > 0) {
            newEarned += rawAmount;
            if (includeInWeekly) newWeekly += rawAmount;
          } else {
            const deduct = Math.abs(rawAmount);
            if (state.balance < deduct) {
              throw new Error(`Cannot deduct ${deduct} Coins (current balance: ${state.balance}). Balance cannot go negative.`);
            }
            newSpent += deduct;
          }

          const newBalance = newEarned - newSpent;
          tx.set(
            walletRef,
            {
              uid: targetUid,
              balance: newBalance,
              totalEarned: newEarned,
              totalSpent: newSpent,
              weeklyEarned: newWeekly,
              weekKey: state.weekKey,
              updatedAt: nowIso,
            },
            { merge: true }
          );

          const txRef = db.collection('king_shop_transactions').doc();
          tx.set(txRef, {
            id: txRef.id,
            uid: targetUid,
            type: 'admin_adjust',
            title: `Admin Adjustment: ${reason}`,
            coins: rawAmount,
            adminEmail: adminUser.email || '',
            createdAt: nowIso,
          });

          const auditRef = db.collection('king_shop_admin_audit').doc();
          tx.set(auditRef, {
            id: auditRef.id,
            action: 'wallet_adjust',
            targetType: 'wallet',
            targetId: targetUid,
            targetUid,
            amount: rawAmount,
            reason,
            actorUid: adminUser.uid,
            actorEmail: adminUser.email || '',
            createdAt: nowIso,
          });

          return { targetUid, amount: rawAmount, balance: newBalance, reason };
        });

        return res.json({ success: true, ...out });
      } catch (err: any) {
        return res.status(400).json({ error: { message: err?.message || 'Wallet adjustment failed.' } });
      }
    }
  );

  // Manual Admin VIP Tier Override (Requires Reason, Audited)
  app.post(
    '/api/shop/admin/vip/override',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const adminUser = (req as any).user as VerifiedUser;
        const targetUid = sanitizeSafeId(req.body?.targetUid, 128);
        const tier = req.body?.tier;
        const reason = typeof req.body?.reason === 'string' ? req.body.reason.trim().slice(0, 200) : '';

        if (!targetUid || !['auto', 'bronze', 'silver', 'gold', 'platinum', 'diamond'].includes(tier)) {
          return res.status(400).json({ error: { message: 'Valid targetUid and tier (auto|bronze|silver|gold|platinum|diamond) required.' } });
        }
        if (reason.length < 3) {
          return res.status(400).json({ error: { message: 'A clear VIP override reason (min 3 characters) is required.' } });
        }

        const db = getDb();
        const now = getNow();
        const nowIso = now.toISOString();
        const settings = await loadSettings(db);
        const vipRef = db.collection('king_shop_vip_profiles').doc(targetUid);

        const out = await db.runTransaction(async (tx) => {
          const vipSnap = await tx.get(vipRef);
          const rawVip = vipSnap.exists ? vipSnap.data() || {} : {};
          const overrideVal = tier === 'auto' ? '' : tier;
          const updatedProfile = resolveEffectiveVipProfile(
            { ...rawVip, manualOverrideTier: overrideVal, manualOverrideReason: reason },
            settings
          );

          tx.set(
            vipRef,
            {
              uid: targetUid,
              verifiedSpendTotal: updatedProfile.verifiedSpendTotal,
              verifiedOrderCount: updatedProfile.verifiedOrderCount,
              tier: updatedProfile.tier,
              lifetimePeakTier: updatedProfile.lifetimePeakTier,
              manualOverrideTier: overrideVal,
              manualOverrideReason: overrideVal ? reason : '',
              manualOverrideBy: adminUser.email || adminUser.uid,
              manualOverrideAt: nowIso,
              vipScore: updatedProfile.vipScore,
              updatedAt: nowIso,
            },
            { merge: true }
          );

          const auditRef = db.collection('king_shop_admin_audit').doc();
          tx.set(auditRef, {
            id: auditRef.id,
            action: 'vip_override',
            targetType: 'vip_profile',
            targetId: targetUid,
            targetUid,
            tier,
            reason,
            actorUid: adminUser.uid,
            actorEmail: adminUser.email || '',
            createdAt: nowIso,
          });

          return {
            targetUid,
            vip: updatedProfile,
          };
        });

        return res.json({ success: true, ...out });
      } catch (err: any) {
        return res.status(400).json({ error: { message: err?.message || 'VIP tier override failed.' } });
      }
    }
  );

  app.post(
    '/api/shop/admin/coupons/verify',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    jsonParser,
    async (req: Request, res: Response) => {
      try {
        const rawCode = typeof req.body?.code === 'string' ? req.body.code.trim().toUpperCase() : '';
        if (!rawCode || rawCode.length > 64 || !/^[A-Z0-9_-]+$/.test(rawCode)) {
          return res.status(400).json({ error: { message: 'Valid coupon code is required.' } });
        }
        const orderAmount = Number(req.body?.orderAmount ?? 0);
        if (!Number.isFinite(orderAmount) || orderAmount < 0) {
          return res.status(400).json({ error: { message: 'Valid orderAmount is required.' } });
        }

        const db = getDb();
        const now = getNow();
        const settings = await loadSettings(db);
        const snap = await db.collection('king_shop_coupons').where('code', '==', rawCode).limit(1).get();
        if (snap.docs.length === 0) {
          return res.status(404).json({ error: { message: 'Coupon code not found.' } });
        }

        const coupon = normalizeCouponView({ id: snap.docs[0].id, ...snap.docs[0].data() }, now.getTime(), settings);
        let valid = true;
        let reason = 'Coupon is active and valid.';

        if (coupon.status === 'reserved') {
          valid = false;
          reason = `Coupon is currently reserved for order ${coupon.reservedOrderRef || ''}.`.trim();
        } else if (coupon.status !== 'active') {
          valid = false;
          reason = `Coupon is ${coupon.status}.`;
        } else if (coupon.usesCount >= coupon.maxUses) {
          valid = false;
          reason = 'Coupon usage limit already reached.';
        } else if (coupon.minOrderAmount > 0 && orderAmount < coupon.minOrderAmount) {
          valid = false;
          reason = `Minimum order of Rs. ${coupon.minOrderAmount.toLocaleString()} required for this voucher.`;
        }

        return res.json({
          valid,
          reason,
          coupon,
        });
      } catch (err: any) {
        return res.status(400).json({ error: { message: err?.message || 'Coupon verification failed.' } });
      }
    }
  );

  app.get(
    '/api/shop/admin/transactions',
    generalApiRateLimiter,
    authenticateFirebaseToken,
    requireSuperAdmin,
    async (_req: Request, res: Response) => {
      try {
        const db = getDb();
        let transactions: any[] = [];
        try {
          const snap = await db
            .collection('king_shop_transactions')
            .orderBy('createdAt', 'desc')
            .limit(50)
            .get();
          transactions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        } catch {
          const snap = await db.collection('king_shop_transactions').limit(50).get();
          transactions = snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));
        }
        return res.json({ transactions });
      } catch (err: any) {
        return res.status(500).json({ error: { message: 'Failed to fetch admin transactions' } });
      }
    }
  );

  return {
    resetRateLimiter: mutationRateLimiter.reset,
  };
}
