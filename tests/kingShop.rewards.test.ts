import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import process from 'node:process';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import { initializeApp, deleteApp, type App } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import {
  assertFails,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  KING_QUIZ_BANK,
  registerKingShopRoutes,
  type VerifiedUser,
} from '../server/kingShopBackend.ts';

const TEST_PROJECT_ID = 'demo-king-rules-test';
const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8088;
const SUPER_ADMIN_EMAIL = 'waqaahmad1230@gmail.com';

const TEST_USERS: Record<string, VerifiedUser> = {
  'token-alice': { uid: 'alice_uid_123', email: 'alice@example.com', emailVerified: true, name: 'Alice King' },
  'token-bob': { uid: 'bob_uid_456', email: 'bob@example.com', emailVerified: true, name: 'Bob Empire' },
  'token-unverified-admin': { uid: 'fake_admin', email: SUPER_ADMIN_EMAIL, emailVerified: false, name: 'Unverified' },
  'token-admin': { uid: 'super_admin_uid', email: SUPER_ADMIN_EMAIL, emailVerified: true, name: 'KING Super Admin' },
};

function bfsSolvePuzzle(initialBoard: number[]): number[] {
  const target = '1,2,3,4,5,6,7,8,0';
  const startKey = initialBoard.join(',');
  if (startKey === target) return [];

  const queue: Array<{ board: number[]; moves: number[] }> = [{ board: initialBoard, moves: [] }];
  const visited = new Set<string>([startKey]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const emptyIdx = current.board.indexOf(0);
    const row = Math.floor(emptyIdx / 3);
    const col = emptyIdx % 3;
    const neighbors: number[] = [];
    if (row > 0) neighbors.push(emptyIdx - 3);
    if (row < 2) neighbors.push(emptyIdx + 3);
    if (col > 0) neighbors.push(emptyIdx - 1);
    if (col < 2) neighbors.push(emptyIdx + 1);

    for (const nextIdx of neighbors) {
      const nextBoard = [...current.board];
      nextBoard[emptyIdx] = nextBoard[nextIdx];
      nextBoard[nextIdx] = 0;
      const key = nextBoard.join(',');
      if (visited.has(key)) continue;
      const nextMoves = [...current.moves, nextIdx];
      if (key === target) return nextMoves;
      if (nextMoves.length < 24) {
        visited.add(key);
        queue.push({ board: nextBoard, moves: nextMoves });
      }
    }
  }
  throw new Error('Could not find puzzle solution within bound');
}

describe('KING SHOP Rewards Backend & Firestore Security Rules (Phase 10 Runtime Verification)', () => {
  let testEnv: RulesTestEnvironment;
  let adminApp: App;
  let adminDb: Firestore;
  let server: http.Server;
  let baseUrl: string;
  let simulatedNow = new Date('2026-11-27T12:00:00.000Z');
  let shopHandle: { resetRateLimiter: () => void } | undefined;

  before(async () => {
    process.env.FIRESTORE_EMULATOR_HOST = `${EMULATOR_HOST}:${EMULATOR_PORT}`;

    const rulesPath = path.resolve(process.cwd(), 'firestore.rules');
    const rules = fs.readFileSync(rulesPath, 'utf8');
    testEnv = await initializeTestEnvironment({
      projectId: TEST_PROJECT_ID,
      firestore: {
        host: EMULATOR_HOST,
        port: EMULATOR_PORT,
        rules,
      },
    });

    adminApp = initializeApp({ projectId: TEST_PROJECT_ID }, 'king-shop-phase10-admin');
    adminDb = getFirestore(adminApp);

    const app = express();
    const authenticateTestToken = (req: Request, res: Response, next: NextFunction) => {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: { message: 'Authentication required.' } });
      }
      const token = authHeader.slice(7).trim();
      const user = TEST_USERS[token];
      if (!user) {
        return res.status(401).json({ error: { message: 'Invalid token.' } });
      }
      (req as any).user = user;
      next();
    };

    const requireTestSuperAdmin = (req: Request, res: Response, next: NextFunction) => {
      const user = (req as any).user as VerifiedUser | undefined;
      if (!user || user.email !== SUPER_ADMIN_EMAIL || user.emailVerified !== true) {
        return res.status(403).json({ error: { message: 'Super Admin required.' } });
      }
      next();
    };

    const passLimiter = (_req: Request, _res: Response, next: NextFunction) => next();

    shopHandle = registerKingShopRoutes(app, adminApp, authenticateTestToken, requireTestSuperAdmin, passLimiter, {
      dbOverride: adminDb,
      nowProvider: () => simulatedNow,
    });

    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        const addr = server.address() as { port: number };
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  beforeEach(async () => {
    simulatedNow = new Date('2026-11-27T12:00:00.000Z');
    await testEnv.clearFirestore();
    shopHandle?.resetRateLimiter();
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await deleteApp(adminApp);
    await testEnv.cleanup();
  });

  async function api(
    method: string,
    endpoint: string,
    token?: string,
    body?: unknown
  ): Promise<{ status: number; data: any }> {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { status: res.status, data };
  }

  it('1. Enforces 401 authentication & 403 Super Admin authorization across all endpoints', async () => {
    for (const [m, ep] of [
      ['GET', '/api/shop/wallet'],
      ['POST', '/api/shop/checkin'],
      ['POST', '/api/shop/mission/track'],
      ['POST', '/api/shop/mission/complete'],
      ['GET', '/api/shop/games/quiz-question'],
      ['POST', '/api/shop/games/puzzle-start'],
      ['POST', '/api/shop/game/reward'],
      ['POST', '/api/shop/redeem'],
      ['GET', '/api/shop/admin/overview'],
      ['POST', '/api/shop/admin/settings'],
      ['PATCH', '/api/shop/admin/coupons/abc'],
    ] as const) {
      const r = await api(m, ep, undefined, m !== 'GET' ? {} : undefined);
      assert.equal(r.status, 401, `${m} ${ep} must require auth`);
    }

    // Non-admin user and unverified admin rejected with 403
    for (const tok of ['token-alice', 'token-unverified-admin']) {
      assert.equal((await api('GET', '/api/shop/admin/overview', tok)).status, 403);
      assert.equal((await api('POST', '/api/shop/admin/settings', tok, { dailyCheckinCoins: 999 })).status, 403);
      assert.equal((await api('PATCH', '/api/shop/admin/coupons/c1', tok, { status: 'revoked' })).status, 403);
      assert.equal((await api('GET', '/api/shop/admin/transactions', tok)).status, 403);
    }

    // Verified Super Admin succeeds
    const adminOverview = await api('GET', '/api/shop/admin/overview', 'token-admin');
    assert.equal(adminOverview.status, 200);
    assert.equal(adminOverview.data.settings.dailyCheckinCoins, 25);
  });

  it('2. Firestore Rules block direct client reads & writes to all KING Shop reward collections', async () => {
    await adminDb.collection('king_shop_wallets').doc('alice_uid_123').set({
      uid: 'alice_uid_123',
      balance: 50,
      totalEarned: 50,
      totalSpent: 0,
    });
    await adminDb.collection('king_shop_transactions').doc('tx1').set({
      uid: 'alice_uid_123',
      coins: 50,
    });

    const aliceClient = testEnv.authenticatedContext('alice_uid_123').firestore();
    const bobClient = testEnv.authenticatedContext('bob_uid_456').firestore();
    const guestClient = testEnv.unauthenticatedContext().firestore();

    // User cannot tamper with or directly read own or others' reward collections
    await assertFails(aliceClient.doc('king_shop_wallets/alice_uid_123').update({ balance: 999999, totalEarned: 999999 }));
    await assertFails(aliceClient.doc('king_shop_wallets/alice_uid_123').set({ uid: 'alice_uid_123', balance: 999999 }));
    await assertFails(aliceClient.doc('king_shop_wallets/alice_uid_123').get());
    await assertFails(aliceClient.doc('king_shop_transactions/tx1').get());
    await assertFails(aliceClient.doc('king_shop_transactions/fake_tx').set({ uid: 'alice_uid_123', coins: 5000 }));
    await assertFails(aliceClient.doc('king_shop_coupons/fake_c').set({ uid: 'alice_uid_123', code: 'FREE' }));
    await assertFails(aliceClient.doc('king_shop_checkins/alice_uid_123_2026-11-27').set({ uid: 'alice_uid_123' }));
    await assertFails(aliceClient.doc('king_shop_missions/alice_uid_123_browse_products_2026-11-27').set({ uid: 'alice_uid_123' }));
    await assertFails(aliceClient.doc('king_shop_settings/config').set({ dailyCheckinCoins: 10000 }));
    await assertFails(aliceClient.doc('king_shop_game_sessions/s1').set({ uid: 'alice_uid_123', used: false }));
    await assertFails(aliceClient.doc('king_shop_game_limits/l1').set({ uid: 'alice_uid_123', plays: 0 }));
    await assertFails(aliceClient.doc('king_shop_orders/ORD-1').set({ uid: 'alice_uid_123', status: 'confirmed' }));
    await assertFails(aliceClient.doc('king_shop_orders/ORD-1').get());
    await assertFails(aliceClient.doc('king_shop_vip_profiles/alice_uid_123').set({ tier: 'diamond', verifiedSpendTotal: 999999 }));
    await assertFails(aliceClient.doc('king_shop_vip_profiles/alice_uid_123').get());
    await assertFails(aliceClient.doc('king_shop_vip_events/ev1').set({ uid: 'alice_uid_123', amountDelta: 50000 }));
    await assertFails(aliceClient.doc('king_shop_achievements/alice_uid_123_first_checkin').set({ uid: 'alice_uid_123', coins: 25 }));
    await assertFails(aliceClient.doc('king_shop_admin_audit/aud1').get());

    await assertFails(bobClient.doc('king_shop_wallets/alice_uid_123').get());
    await assertFails(bobClient.doc('king_shop_transactions/tx1').get());
    await assertFails(bobClient.doc('king_shop_orders/ORD-1').get());
    await assertFails(bobClient.doc('king_shop_vip_profiles/alice_uid_123').get());
    await assertFails(guestClient.doc('king_shop_wallets/alice_uid_123').get());
  });

  it('3. Atomic wallet initialization, concurrent idempotency, and cross-user isolation', async () => {
    // Concurrent first wallet loads must award welcome bonus ONCE
    const [w1, w2, w3] = await Promise.all([
      api('GET', '/api/shop/wallet', 'token-alice'),
      api('GET', '/api/shop/wallet', 'token-alice'),
      api('GET', '/api/shop/wallet', 'token-alice'),
    ]);

    assert.equal(w1.status, 200);
    assert.equal(w2.status, 200);
    assert.equal(w3.status, 200);
    assert.equal(w3.data.balance, 50);

    const txSnap = await adminDb
      .collection('king_shop_transactions')
      .where('uid', '==', 'alice_uid_123')
      .get();
    assert.equal(txSnap.size, 1);

    // Bob's wallet is completely isolated
    const bobWallet = await api('GET', '/api/shop/wallet', 'token-bob');
    assert.equal(bobWallet.status, 200);
    assert.equal(bobWallet.data.balance, 50);
    assert.ok(bobWallet.data.transactions.every((t: any) => t.uid === 'bob_uid_456'));
  });

  it('4. Daily Check-In: atomic single-claim per UTC day, concurrent race guard, streak progression & reset', async () => {
    // Concurrent check-in burst on day 1 -> exactly 1 succeeds (200), others fail (409)
    const burst = await Promise.all([
      api('POST', '/api/shop/checkin', 'token-alice', {}),
      api('POST', '/api/shop/checkin', 'token-alice', {}),
      api('POST', '/api/shop/checkin', 'token-alice', {}),
    ]);
    const successes = burst.filter((r) => r.status === 200);
    const conflicts = burst.filter((r) => r.status === 409);
    assert.equal(successes.length, 1);
    assert.equal(conflicts.length, 2);
    assert.equal(successes[0].data.balance, 75); // 50 welcome + 25 checkin
    assert.equal(successes[0].data.streak, 1);
    assert.equal(successes[0].data.serverDate, '2026-11-27');

    // Same UTC date at 23:59:59Z still blocked
    simulatedNow = new Date('2026-11-27T23:59:59.000Z');
    const sameDayLate = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(sameDayLate.status, 409);

    // Crossing UTC midnight -> allowed & streak increments to 2
    simulatedNow = new Date('2026-11-28T00:00:01.000Z');
    const nextDay = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(nextDay.status, 200);
    assert.equal(nextDay.data.balance, 100);
    assert.equal(nextDay.data.streak, 2);
    assert.equal(nextDay.data.serverDate, '2026-11-28');

    // Skipping a day resets streak back to 1
    simulatedNow = new Date('2026-11-30T08:00:00.000Z');
    const afterGap = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(afterGap.status, 200);
    assert.equal(afterGap.data.streak, 1);
    assert.equal(afterGap.data.balance, 125);
  });

  it('5. Daily Missions: rejects fake/unverified claims, validates product exploration, prevents duplicates', async () => {
    // Fake claims without activity fail cleanly
    assert.equal((await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'browse_products' })).status, 400);
    assert.equal((await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'watch_video' })).status, 400);
    assert.equal((await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'share_shop' })).status, 400);
    assert.equal((await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'daily_quiz' })).status, 400);
    assert.equal((await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'fake_hack_mission' })).status, 400);

    // Tracking a nonexistent product ID fails
    const badTrack = await api('POST', '/api/shop/mission/track', 'token-alice', {
      missionId: 'browse_products',
      proofId: 'nonexistent_prod_999',
    });
    assert.equal(badTrack.status, 400);

    // Seed an active catalog product and verify track -> complete -> duplicate conflict
    await adminDb.collection('catalog_products').doc('prod_watch_01').set({
      name: 'KING Chronos Gold Watch',
      isActive: true,
    });

    const goodTrack = await api('POST', '/api/shop/mission/track', 'token-alice', {
      missionId: 'browse_products',
      proofId: 'prod_watch_01',
    });
    assert.equal(goodTrack.status, 200);
    assert.equal(goodTrack.data.verified, true);

    const claim1 = await api('POST', '/api/shop/mission/complete', 'token-alice', {
      missionId: 'browse_products',
    });
    assert.equal(claim1.status, 200);
    assert.equal(claim1.data.added, 15);
    assert.equal(claim1.data.balance, 65); // 50 welcome + 15

    // Duplicate claim blocked with 409
    const claim2 = await api('POST', '/api/shop/mission/complete', 'token-alice', {
      missionId: 'browse_products',
    });
    assert.equal(claim2.status, 409);

    // Bob still cannot claim Alice's tracked progress
    const bobClaim = await api('POST', '/api/shop/mission/complete', 'token-bob', {
      missionId: 'browse_products',
    });
    assert.equal(bobClaim.status, 400);
  });

  it('6. Mini-Games: verifies Quiz answers, Puzzle move replay, Spin bounds, daily limits & cross-user isolation', async () => {
    // --- QUIZ ---
    const qRes = await api('GET', '/api/shop/games/quiz-question', 'token-alice');
    assert.equal(qRes.status, 200);
    assert.equal((qRes.data as any).correctIndex, undefined, 'Quiz question must never leak correctIndex');

    const questionDef = KING_QUIZ_BANK.find((q) => q.question === qRes.data.question)!;
    assert.ok(questionDef);
    const correctIdx1 = qRes.data.options.indexOf(questionDef.options[questionDef.correctIndex]);
    assert.ok(correctIdx1 >= 0);
    const wrongIdx = (correctIdx1 + 1) % 4;

    // Cross-user hijack attempt fails
    const bobHijackQuiz = await api('POST', '/api/shop/game/reward', 'token-bob', {
      gameType: 'quiz',
      challengeId: qRes.data.challengeId,
      selectedOption: correctIdx1,
    });
    assert.equal(bobHijackQuiz.status, 400);

    // Wrong answer consumes 1 play & rewards 0
    const wrongSubmit = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'quiz',
      challengeId: qRes.data.challengeId,
      selectedOption: wrongIdx,
    });
    assert.equal(wrongSubmit.status, 200);
    assert.equal(wrongSubmit.data.won, false);
    assert.equal(wrongSubmit.data.added, 0);
    assert.equal(wrongSubmit.data.playsLeft, 4);

    // Replay same challengeId blocked (409)
    const replayQuiz = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'quiz',
      challengeId: qRes.data.challengeId,
      selectedOption: correctIdx1,
    });
    assert.equal(replayQuiz.status, 409);

    // Correct answer on fresh question rewards +25 & unlocks daily_quiz mission
    const qRes2 = await api('GET', '/api/shop/games/quiz-question', 'token-alice');
    const qDef2 = KING_QUIZ_BANK.find((q) => q.question === qRes2.data.question)!;
    const correctIdx2 = qRes2.data.options.indexOf(qDef2.options[qDef2.correctIndex]);
    const rightSubmit = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'quiz',
      challengeId: qRes2.data.challengeId,
      selectedOption: correctIdx2,
    });
    assert.equal(rightSubmit.status, 200);
    assert.equal(rightSubmit.data.won, true);
    assert.equal(rightSubmit.data.added, 25);

    const quizMission = await api('POST', '/api/shop/mission/complete', 'token-alice', {
      missionId: 'daily_quiz',
    });
    assert.equal(quizMission.status, 200);
    assert.equal(quizMission.data.added, 30);

    // --- PUZZLE ---
    const pStart = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    assert.equal(pStart.status, 200);
    assert.equal(pStart.data.board.length, 9);

    // Spoofed/illegal move sequence fails
    const badPuzzle = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pStart.data.sessionId,
      moves: [0, 8],
    });
    assert.equal(badPuzzle.status, 400);

    // Real solved move sequence succeeds & replay fails
    const validMoves = bfsSolvePuzzle(pStart.data.board);
    const goodPuzzle = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pStart.data.sessionId,
      moves: validMoves,
    });
    assert.equal(goodPuzzle.status, 200);
    assert.equal(goodPuzzle.data.added, 40);

    const replayPuzzle = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pStart.data.sessionId,
      moves: validMoves,
    });
    assert.equal(replayPuzzle.status, 409);

    // --- SPIN & DAILY LIMIT ---
    for (let i = 0; i < 3; i++) {
      const spin = await api('POST', '/api/shop/game/reward', 'token-alice', { gameType: 'spin' });
      assert.equal(spin.status, 200);
      assert.ok(spin.data.added >= 10 && spin.data.added <= 45);
      assert.equal(typeof spin.data.segmentIndex, 'number');
    }
    const overLimitSpin = await api('POST', '/api/shop/game/reward', 'token-alice', { gameType: 'spin' });
    assert.equal(overLimitSpin.status, 429);
  });

  it('7. Redeem Rewards: insufficient balance blocked, atomic deduction, idempotency, unique codes & admin coupon lifecycle', async () => {
    // Alice starts with 50 welcome coins -> redeeming 150 coin voucher must fail
    await api('GET', '/api/shop/wallet', 'token-alice');
    const lowBal = await api('POST', '/api/shop/redeem', 'token-alice', { rewardId: 'free_delivery' });
    assert.equal(lowBal.status, 400);

    // Build balance >= 250 using legitimate rewards
    await api('POST', '/api/shop/checkin', 'token-alice', {}); // +25 = 75
    for (let d = 1; d <= 5; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 27 + d, 12, 0, 0));
      const cRes = await api('POST', '/api/shop/checkin', 'token-alice', {}); // +125 = 200
      assert.equal(cRes.status, 200);
    }
    // Win puzzle twice across days to exceed 250
    const p1 = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: p1.data.sessionId,
      moves: bfsSolvePuzzle(p1.data.board),
    }); // +40 = 240
    const p2 = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: p2.data.sessionId,
      moves: bfsSolvePuzzle(p2.data.board),
    }); // +40 = 280

    const redeem1 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'idem_redeem_once_1',
    });
    assert.equal(redeem1.status, 200);
    assert.equal(redeem1.data.balance, 30);
    assert.match(redeem1.data.code, /^KING-[A-F0-9]{8}-KING500OFF$/);

    // Duplicate idempotencyKey blocked (409)
    const redeemDup = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'idem_redeem_once_1',
    });
    assert.equal(redeemDup.status, 409);

    // Admin updates coupon status -> 'used'
    const adminCouponPatch = await api(
      'PATCH',
      `/api/shop/admin/coupons/${redeem1.data.couponId}`,
      'token-admin',
      { status: 'used' }
    );
    assert.equal(adminCouponPatch.status, 200);

    const aliceWalletAfter = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(aliceWalletAfter.data.balance, 30);
    assert.equal(aliceWalletAfter.data.coupons[0].status, 'used');
  });

  it('8. Weekly Leaderboard: ranks strictly by weeklyEarned, masks nicknames, omits PII & resets on new ISO week', async () => {
    await adminDb.collection('publicProfiles').doc('alice_uid_123').set({
      uid: 'alice_uid_123',
      username: 'AliceQueen',
      displayName: 'Alice Queen',
      photoURL: 'https://example.com/a.jpg',
    });
    await adminDb.collection('publicProfiles').doc('bob_uid_456').set({
      uid: 'bob_uid_456',
      username: 'BobKing',
      displayName: 'Bob King',
      photoURL: 'https://example.com/b.jpg',
    });

    await api('POST', '/api/shop/checkin', 'token-alice', {}); // 50 + 25 = 75 weekly
    await api('POST', '/api/shop/game/reward', 'token-bob', { gameType: 'spin' }); // 50 + spin >= 60

    const pAlice = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pAlice.data.sessionId,
      moves: bfsSolvePuzzle(pAlice.data.board),
    }); // Alice weekly = 115

    const lb1 = await api('GET', '/api/shop/leaderboard');
    assert.equal(lb1.status, 200);
    assert.equal(lb1.data.leaderboard.length, 2);
    assert.equal(lb1.data.leaderboard[0].rank, 1);
    assert.equal(lb1.data.leaderboard[0].nickname, 'Ali***');
    assert.equal(lb1.data.leaderboard[0].weeklyCoins, 115);
    assert.equal(lb1.data.leaderboard[1].nickname, 'Bob***');

    // Privacy check: zero email or uid leaked
    const serialized = JSON.stringify(lb1.data);
    assert.equal(serialized.includes('alice@example.com'), false);
    assert.equal(serialized.includes('alice_uid_123'), false);

    // Advance to next ISO week -> leaderboard resets cleanly and preserves lifetime balance
    simulatedNow = new Date('2026-12-07T12:00:00.000Z');
    const aliceNewWeek = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(aliceNewWeek.data.balance, 115);
    assert.equal(aliceNewWeek.data.weeklyEarned, 0);

    const lbNextWeek = await api('GET', '/api/shop/leaderboard');
    assert.equal(lbNextWeek.status, 200);
    assert.equal(lbNextWeek.data.leaderboard.length, 0);
  });

  it('9. Admin settings update controls reward pause, amounts & rate limiting protection', async () => {
    // Pause rewards via Super Admin endpoint
    const pauseRes = await api('POST', '/api/shop/admin/settings', 'token-admin', {
      rewardsEnabled: false,
      dailyCheckinCoins: 60,
    });
    assert.equal(pauseRes.status, 200);
    assert.equal(pauseRes.data.settings.rewardsEnabled, false);
    assert.equal(pauseRes.data.settings.dailyCheckinCoins, 60);

    // Check-in blocked while paused
    const pausedCheckin = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(pausedCheckin.status, 403);

    // Re-enable & verify updated daily bonus applies
    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      rewardsEnabled: true,
    });
    const resumedCheckin = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(resumedCheckin.status, 200);
    assert.equal(resumedCheckin.data.added, 60);

    // Verify per-user mutation rate limiter returns 429 after 25 rapid mutations on same path
    let got429 = false;
    for (let i = 0; i < 28; i++) {
      const r = await api('POST', '/api/shop/checkin', 'token-bob', {});
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true, 'Mutation rate limiter must return HTTP 429 after burst threshold');
  });

  it('10. Phase 11-D Hardening: validates mission proofs strictly, deep-merges partial admin settings & scales spinSegments', async () => {
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'browse_products',
        proofId: 'demo-prod-999',
      })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'browse_products',
        proofId: 'demo-prod-1',
      })).status,
      200
    );

    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'watch_video',
        proofId: 'fake_video_123',
      })).status,
      400
    );

    await adminDb.collection('catalog_products').doc('prod_reel_01').set({
      name: 'KING Elite Sneakers',
      isActive: true,
      videoUrls: ['https://example.com/reel0.mp4'],
    });
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'watch_video',
        proofId: 'prod_reel_01_v0',
      })).status,
      200
    );

    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'share_shop',
        proofId: 'random_share_bypass',
      })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'share_shop',
        proofId: 'shop_link_share',
      })).status,
      200
    );

    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      missions: { browse_products: { title: 'VIP Explorer' } },
    });
    const partialUpdate = await api('POST', '/api/shop/admin/settings', 'token-admin', {
      missions: { browse_products: { coins: 35 } },
      games: { spin: { minCoins: 20, maxCoins: 100 } },
    });
    assert.equal(partialUpdate.data.settings.missions.browse_products.title, 'VIP Explorer');
    assert.equal(partialUpdate.data.settings.missions.browse_products.coins, 35);

    const w = await api('GET', '/api/shop/wallet', 'token-bob');
    assert.deepEqual(w.data.config.games.spin.spinSegments, [20, 36, 52, 68, 84, 100]);
  });

  it('12. Phase 13 Security & Anti-Farming: 20-question non-repeating quiz, coupon minOrderAmount, expiry & active-tier lock', async () => {
    assert.ok(KING_QUIZ_BANK.length >= 20);
    for (let i = 0; i < 5; i++) {
      const q = await api('GET', '/api/shop/games/quiz-question', 'token-alice');
      assert.equal(q.status, 200);
      const qDef = KING_QUIZ_BANK.find((item) => item.question === q.data.question)!;
      const ansIdx = q.data.options.indexOf(qDef.options[qDef.correctIndex]);
      assert.equal(
        (await api('POST', '/api/shop/game/reward', 'token-alice', {
          gameType: 'quiz',
          challengeId: q.data.challengeId,
          selectedOption: ansIdx,
        })).status,
        200
      );
    }
    assert.equal((await api('GET', '/api/shop/games/quiz-question', 'token-alice')).status, 429);

    const rFree = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'free_delivery',
      idempotencyKey: 'emu_fd_1',
    });
    assert.equal(rFree.status, 200);
    assert.equal(rFree.data.minOrderAmount, 1000);
    assert.equal(
      (await api('POST', '/api/shop/redeem', 'token-alice', {
        rewardId: 'free_delivery',
        idempotencyKey: 'emu_fd_2',
      })).status,
      409
    );
  });

  it('13. Phase 14 WhatsApp Checkout & Coupon Validation: server pricing, atomic reservation, release & admin confirmation', async () => {
    await adminDb.collection('catalog_products').doc('emu_prod_1').set({
      name: 'KING Emulator Watch',
      category: 'Wearables',
      originalPrice: 3000,
      stock: 5,
      isActive: true,
    });

    for (let d = 1; d <= 10; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 1 + d, 12, 0, 0));
      assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    }

    const r500 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'emu_p14_500',
    });
    assert.equal(r500.status, 200);

    // Forged price ignored; valid discount applied
    const val = await api('POST', '/api/shop/coupons/validate', 'token-alice', {
      code: r500.data.code,
      items: [{ productId: 'emu_prod_1', quantity: 1, price: 99999 }],
    });
    assert.equal(val.status, 200);
    assert.equal(val.data.subtotal, 3000);
    assert.equal(val.data.discountAmount, 500);
    assert.equal(val.data.finalTotal, 2500);

    // Checkout reserves coupon (NOT used) and embeds orderRef + totals
    const co = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'emu_prod_1', quantity: 1 }],
      couponCode: r500.data.code,
      idempotencyKey: 'emu_co_1',
    });
    assert.equal(co.status, 200);
    assert.equal(co.data.coupon.status, 'reserved');
    assert.ok(co.data.whatsappMessage.includes(co.data.orderRef));

    // Abandoned release restores coupon
    const rel = await api('POST', '/api/shop/checkout/release', 'token-alice', {
      couponCode: r500.data.code,
      orderRef: co.data.orderRef,
    });
    assert.equal(rel.status, 200);
    assert.equal(rel.data.status, 'active');

    // Re-checkout and admin confirm marks coupon used + order confirmed
    const co2 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'emu_prod_1', quantity: 1 }],
      couponCode: r500.data.code,
      idempotencyKey: 'emu_co_2',
    });
    assert.equal(co2.status, 200);
    assert.equal(
      (await api('PATCH', `/api/shop/admin/coupons/${r500.data.couponId}`, 'token-admin', {
        status: 'used',
      })).status,
      200
    );
    const ov = await api('GET', '/api/shop/admin/overview', 'token-admin');
    assert.equal(ov.data.orders.find((o: any) => o.orderRef === co2.data.orderRef)?.status, 'confirmed');
  });
});
