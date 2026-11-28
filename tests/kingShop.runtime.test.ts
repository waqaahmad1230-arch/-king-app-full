import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import http from 'node:http';
import { promisify } from 'node:util';
import { after, before, beforeEach, describe, it } from 'node:test';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import {
  KING_QUIZ_BANK,
  RESERVATION_TTL_MS,
  registerKingShopRoutes,
  type VerifiedUser,
} from '../server/kingShopBackend.ts';

const execFileAsync = promisify(execFile);
const SUPER_ADMIN_EMAIL = 'waqaahmad1230@gmail.com';

const TEST_USERS: Record<string, VerifiedUser> = {
  'token-alice': { uid: 'alice_uid_123', email: 'alice@example.com', emailVerified: true, name: 'Alice King' },
  'token-bob': { uid: 'bob_uid_456', email: 'bob@example.com', emailVerified: true, name: 'Bob Empire' },
  'token-unverified-admin': { uid: 'fake_admin', email: SUPER_ADMIN_EMAIL, emailVerified: false, name: 'Unverified' },
  'token-admin': { uid: 'super_admin_uid', email: SUPER_ADMIN_EMAIL, emailVerified: true, name: 'KING Super Admin' },
};

/**
 * Minimal isolated in-memory Firestore mock with strict read-before-write check
 * and serialized transaction execution to test concurrency and rollback safety.
 */
class InMemoryFirestore {
  private collections = new Map<string, Map<string, Record<string, any>>>();
  private txQueue: Promise<any> = Promise.resolve();
  private autoIdCounter = 0;

  clear() {
    this.collections.clear();
  }

  private getColMap(name: string): Map<string, Record<string, any>> {
    let col = this.collections.get(name);
    if (!col) {
      col = new Map();
      this.collections.set(name, col);
    }
    return col;
  }

  private makeSnap(id: string, data: Record<string, any> | undefined) {
    const cloned = data ? structuredClone(data) : undefined;
    return {
      id,
      exists: Boolean(cloned),
      data: () => cloned,
    };
  }

  doc(colName: string, id?: string) {
    const docId = id || `auto_${++this.autoIdCounter}`;
    const self = this;
    return {
      id: docId,
      path: `${colName}/${docId}`,
      _col: colName,
      async get() {
        const d = self.getColMap(colName).get(docId);
        return self.makeSnap(docId, d);
      },
      async set(data: Record<string, any>, opts?: { merge?: boolean }) {
        const map = self.getColMap(colName);
        if (opts?.merge && map.has(docId)) {
          map.set(docId, { ...map.get(docId)!, ...structuredClone(data) });
        } else {
          map.set(docId, structuredClone(data));
        }
      },
      async update(data: Record<string, any>) {
        const map = self.getColMap(colName);
        if (!map.has(docId)) throw new Error(`NOT_FOUND: ${colName}/${docId}`);
        map.set(docId, { ...map.get(docId)!, ...structuredClone(data) });
      },
      async delete() {
        self.getColMap(colName).delete(docId);
      },
    };
  }

  collection(colName: string) {
    const self = this;
    const filters: Array<{ field: string; op: string; val: any }> = [];
    let orderField: string | null = null;
    let orderDir: 'asc' | 'desc' = 'asc';
    let limitCount: number | null = null;

    const queryObj: any = {
      doc(id?: string) {
        return self.doc(colName, id);
      },
      where(field: string, op: string, val: any) {
        filters.push({ field, op, val });
        return queryObj;
      },
      orderBy(field: string, dir: 'asc' | 'desc' = 'asc') {
        orderField = field;
        orderDir = dir;
        return queryObj;
      },
      limit(n: number) {
        limitCount = n;
        return queryObj;
      },
      async get() {
        const map = self.getColMap(colName);
        let items = Array.from(map.entries()).map(([id, data]) => ({
          id,
          data: structuredClone(data),
        }));

        for (const f of filters) {
          if (f.op === '==') {
            items = items.filter((item) => item.data[f.field] === f.val);
          }
        }

        if (orderField) {
          const field = orderField;
          items.sort((a, b) => {
            const av = a.data[field];
            const bv = b.data[field];
            const cmp =
              typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av ?? '').localeCompare(String(bv ?? ''));
            return orderDir === 'desc' ? -cmp : cmp;
          });
        }

        if (limitCount !== null) {
          items = items.slice(0, limitCount);
        }

        return {
          size: items.length,
          docs: items.map((i) => self.makeSnap(i.id, i.data)),
        };
      },
    };
    return queryObj;
  }

  async getAll(...refs: Array<{ _col: string; id: string }>) {
    return refs.map((ref) => selfSnap(this.getColMap(ref._col).get(ref.id), ref.id));
    function selfSnap(d: Record<string, any> | undefined, id: string) {
      const cloned = d ? structuredClone(d) : undefined;
      return { id, exists: Boolean(cloned), data: () => cloned };
    }
  }

  async runTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
    const run = async () => {
      let wrote = false;
      const staged: Array<() => void> = [];
      const self = this;

      const tx = {
        async get(ref: { _col: string; id: string }) {
          if (wrote) {
            throw new Error('Firestore transactions require all reads to be executed before all writes.');
          }
          const d = self.getColMap(ref._col).get(ref.id);
          return self.makeSnap(ref.id, d);
        },
        set(ref: { _col: string; id: string }, data: Record<string, any>, opts?: { merge?: boolean }) {
          wrote = true;
          const payload = structuredClone(data);
          staged.push(() => {
            const map = self.getColMap(ref._col);
            if (opts?.merge && map.has(ref.id)) {
              map.set(ref.id, { ...map.get(ref.id)!, ...payload });
            } else {
              map.set(ref.id, payload);
            }
          });
        },
        update(ref: { _col: string; id: string }, data: Record<string, any>) {
          wrote = true;
          const payload = structuredClone(data);
          staged.push(() => {
            const map = self.getColMap(ref._col);
            if (!map.has(ref.id)) throw new Error(`NOT_FOUND: ${ref._col}/${ref.id}`);
            map.set(ref.id, { ...map.get(ref.id)!, ...payload });
          });
        },
        delete(ref: { _col: string; id: string }) {
          wrote = true;
          staged.push(() => {
            self.getColMap(ref._col).delete(ref.id);
          });
        },
      };

      const res = await fn(tx);
      for (const apply of staged) apply();
      return res;
    };

    const next = this.txQueue.then(run, run);
    this.txQueue = next.catch(() => {});
    return next;
  }
}

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
  throw new Error('Puzzle BFS bound exceeded');
}

describe('KING SHOP Phase 10 Isolated Express Runtime Verification (In-Memory Transactional DB)', () => {
  const memDb = new InMemoryFirestore();
  let server: http.Server;
  let baseUrl: string;
  let simulatedNow = new Date('2026-11-27T12:00:00.000Z');
  let shopHandle: { resetRateLimiter: () => void } | undefined;

  before(async () => {
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

    shopHandle = registerKingShopRoutes(app, null, authenticateTestToken, requireTestSuperAdmin, passLimiter, {
      dbOverride: memDb as any,
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

  beforeEach(() => {
    simulatedNow = new Date('2026-11-27T12:00:00.000Z');
    memDb.clear();
    shopHandle?.resetRateLimiter();
  });

  after(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
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

  it('1. Native Node v22 TypeScript ESM import succeeds cleanly without express named-export crash', async () => {
    const { stdout } = await execFileAsync('node', [
      '-e',
      "import('./server/kingShopBackend.ts').then(m => console.log(typeof m.registerKingShopRoutes))",
    ]);
    assert.equal(stdout.trim(), 'function');
  });

  it('2. Enforces 401 auth & 403 Super Admin authorization across all reward and admin routes', async () => {
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
      assert.equal(r.status, 401, `${m} ${ep} must reject unauthenticated callers`);
    }

    for (const tok of ['token-alice', 'token-unverified-admin']) {
      assert.equal((await api('GET', '/api/shop/admin/overview', tok)).status, 403);
      assert.equal((await api('POST', '/api/shop/admin/settings', tok, { dailyCheckinCoins: 999 })).status, 403);
      assert.equal((await api('PATCH', '/api/shop/admin/coupons/c1', tok, { status: 'revoked' })).status, 403);
      assert.equal((await api('GET', '/api/shop/admin/transactions', tok)).status, 403);
    }

    const okAdmin = await api('GET', '/api/shop/admin/overview', 'token-admin');
    assert.equal(okAdmin.status, 200);
    assert.equal(okAdmin.data.settings.dailyCheckinCoins, 25);
  });

  it('3. Atomic wallet initialization, concurrency idempotency, balance invariant, and cross-user isolation', async () => {
    const [w1, w2, w3] = await Promise.all([
      api('GET', '/api/shop/wallet', 'token-alice'),
      api('GET', '/api/shop/wallet', 'token-alice'),
      api('GET', '/api/shop/wallet', 'token-alice'),
    ]);

    assert.equal(w1.status, 200);
    assert.equal(w2.status, 200);
    assert.equal(w3.status, 200);
    assert.equal(w3.data.balance, 50);
    assert.equal(w3.data.transactions.length, 1);

    const bobWallet = await api('GET', '/api/shop/wallet', 'token-bob');
    assert.equal(bobWallet.status, 200);
    assert.equal(bobWallet.data.balance, 50);
    assert.ok(bobWallet.data.transactions.every((t: any) => t.uid === 'bob_uid_456'));
  });

  it('4. Daily Check-In: atomic race prevention, Asia/Karachi midnight rollover, streak increment & gap reset', async () => {
    const burst = await Promise.all([
      api('POST', '/api/shop/checkin', 'token-alice', {}),
      api('POST', '/api/shop/checkin', 'token-alice', {}),
      api('POST', '/api/shop/checkin', 'token-alice', {}),
    ]);
    assert.equal(burst.filter((r) => r.status === 200).length, 1);
    assert.equal(burst.filter((r) => r.status === 409).length, 2);
    assert.equal(burst.find((r) => r.status === 200)!.data.balance, 75);

    // 18:59:59Z === 23:59:59 Asia/Karachi (still Nov 27)
    simulatedNow = new Date('2026-11-27T18:59:59.000Z');
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 409);

    // 19:00:01Z === 00:00:01 Asia/Karachi (Nov 28)
    simulatedNow = new Date('2026-11-27T19:00:01.000Z');
    const nextDay = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(nextDay.status, 200);
    assert.equal(nextDay.data.streak, 2);
    assert.equal(nextDay.data.balance, 100);

    simulatedNow = new Date('2026-11-30T10:00:00.000Z');
    const afterGap = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(afterGap.status, 200);
    assert.equal(afterGap.data.streak, 1);
  });

  it('5. Daily Missions: rejects spoofed claims, validates real catalog product, prevents duplicate claims', async () => {
    for (const missionId of ['browse_products', 'watch_video', 'share_shop', 'daily_quiz', 'spoof_mission']) {
      assert.equal((await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId })).status, 400);
    }

    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'browse_products',
        proofId: 'missing_prod_id',
      })).status,
      400
    );

    await memDb.collection('catalog_products').doc('prod_gold_01').set({
      name: 'KING Gold Watch',
      isActive: true,
    });

    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'browse_products',
        proofId: 'prod_gold_01',
      })).status,
      200
    );

    const claim = await api('POST', '/api/shop/mission/complete', 'token-alice', {
      missionId: 'browse_products',
    });
    assert.equal(claim.status, 200);
    assert.equal(claim.data.added, 15);
    assert.equal(claim.data.balance, 65);

    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-alice', {
        missionId: 'browse_products',
      })).status,
      409
    );
    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-bob', {
        missionId: 'browse_products',
      })).status,
      400
    );
  });

  it('6. Mini-Games: verifies Quiz answers, Puzzle BFS move replay, Spin bounds, daily limits & session isolation', async () => {
    const q1 = await api('GET', '/api/shop/games/quiz-question', 'token-alice');
    assert.equal(q1.status, 200);
    assert.equal((q1.data as any).correctIndex, undefined);

    const qDef1 = KING_QUIZ_BANK.find((q) => q.question === q1.data.question)!;
    const correctIdx1 = q1.data.options.indexOf(qDef1.options[qDef1.correctIndex]);
    assert.ok(correctIdx1 >= 0);

    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-bob', {
        gameType: 'quiz',
        challengeId: q1.data.challengeId,
        selectedOption: correctIdx1,
      })).status,
      400
    );

    const wrong = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'quiz',
      challengeId: q1.data.challengeId,
      selectedOption: (correctIdx1 + 1) % 4,
    });
    assert.equal(wrong.status, 200);
    assert.equal(wrong.data.won, false);
    assert.equal(wrong.data.added, 0);
    assert.equal(wrong.data.playsLeft, 4);

    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'quiz',
        challengeId: q1.data.challengeId,
        selectedOption: correctIdx1,
      })).status,
      409
    );

    const q2 = await api('GET', '/api/shop/games/quiz-question', 'token-alice');
    const qDef2 = KING_QUIZ_BANK.find((q) => q.question === q2.data.question)!;
    const correctIdx2 = q2.data.options.indexOf(qDef2.options[qDef2.correctIndex]);
    const right = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'quiz',
      challengeId: q2.data.challengeId,
      selectedOption: correctIdx2,
    });
    assert.equal(right.status, 200);
    assert.equal(right.data.won, true);
    assert.equal(right.data.added, 25);

    const pStart = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    assert.equal(pStart.status, 200);
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'puzzle',
        sessionId: pStart.data.sessionId,
        moves: [0, 8],
      })).status,
      400
    );

    const validMoves = bfsSolvePuzzle(pStart.data.board);
    const pWin = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pStart.data.sessionId,
      moves: validMoves,
    });
    assert.equal(pWin.status, 200);
    assert.equal(pWin.data.added, 40);

    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'puzzle',
        sessionId: pStart.data.sessionId,
        moves: validMoves,
      })).status,
      409
    );

    for (let i = 0; i < 3; i++) {
      const spin = await api('POST', '/api/shop/game/reward', 'token-alice', { gameType: 'spin' });
      assert.equal(spin.status, 200);
      assert.ok(spin.data.added >= 10 && spin.data.added <= 45);
    }
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', { gameType: 'spin' })).status,
      429
    );
  });

  it('7. Redeem Rewards: insufficient balance check, atomic deduction, idempotency, unique codes & admin coupon update', async () => {
    await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(
      (await api('POST', '/api/shop/redeem', 'token-alice', { rewardId: 'free_delivery' })).status,
      400
    );

    await api('POST', '/api/shop/checkin', 'token-alice', {}); // 75
    for (let d = 1; d <= 5; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 27 + d, 12, 0, 0));
      const cRes = await api('POST', '/api/shop/checkin', 'token-alice', {}); // 200
      assert.equal(cRes.status, 200);
    }
    for (let p = 0; p < 2; p++) {
      const ps = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
      assert.equal(ps.status, 200);
      await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'puzzle',
        sessionId: ps.data.sessionId,
        moves: bfsSolvePuzzle(ps.data.board),
      });
    } // 280

    const redeem1 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'idem_coupon_1',
    });
    assert.equal(redeem1.status, 200);
    assert.equal(redeem1.data.balance, 30);
    assert.match(redeem1.data.code, /^KING-[A-F0-9]{8}-KING500OFF$/);

    assert.equal(
      (await api('POST', '/api/shop/redeem', 'token-alice', {
        rewardId: 'coupon_500',
        idempotencyKey: 'idem_coupon_1',
      })).status,
      409
    );

    const patchCoupon = await api(
      'PATCH',
      `/api/shop/admin/coupons/${redeem1.data.couponId}`,
      'token-admin',
      { status: 'used' }
    );
    assert.equal(patchCoupon.status, 200);

    const wAfter = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(wAfter.data.coupons[0].status, 'used');
  });

  it('8. Weekly Leaderboard: ranks strictly by weeklyEarned, masks nicknames, hides PII & resets next ISO week', async () => {
    await memDb.collection('publicProfiles').doc('alice_uid_123').set({
      uid: 'alice_uid_123',
      username: 'AliceQueen',
      displayName: 'Alice Queen',
      photoURL: 'https://example.com/a.jpg',
    });
    await memDb.collection('publicProfiles').doc('bob_uid_456').set({
      uid: 'bob_uid_456',
      username: 'BobKing',
      displayName: 'Bob King',
      photoURL: 'https://example.com/b.jpg',
    });

    await api('POST', '/api/shop/checkin', 'token-alice', {}); // 75
    await api('POST', '/api/shop/game/reward', 'token-bob', { gameType: 'spin' }); // <= 95
    const pAlice = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pAlice.data.sessionId,
      moves: bfsSolvePuzzle(pAlice.data.board),
    }); // 115

    const lb1 = await api('GET', '/api/shop/leaderboard');
    assert.equal(lb1.status, 200);
    assert.equal(lb1.data.leaderboard.length, 2);
    assert.equal(lb1.data.leaderboard[0].nickname, 'Ali***');
    assert.equal(lb1.data.leaderboard[0].weeklyCoins, 115);

    const serialized = JSON.stringify(lb1.data);
    assert.equal(serialized.includes('alice@example.com'), false);
    assert.equal(serialized.includes('alice_uid_123'), false);

    simulatedNow = new Date('2026-12-07T12:00:00.000Z');
    const newWeekWallet = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(newWeekWallet.data.balance, 115);
    assert.equal(newWeekWallet.data.weeklyEarned, 0);

    const lb2 = await api('GET', '/api/shop/leaderboard');
    assert.equal(lb2.status, 200);
    assert.equal(lb2.data.leaderboard.length, 0);
  });

  it('9. Admin settings update & per-user mutation rate limiting (HTTP 429)', async () => {
    const pause = await api('POST', '/api/shop/admin/settings', 'token-admin', {
      rewardsEnabled: false,
      dailyCheckinCoins: 60,
    });
    assert.equal(pause.status, 200);
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 403);

    await api('POST', '/api/shop/admin/settings', 'token-admin', { rewardsEnabled: true });
    const resumed = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(resumed.status, 200);
    assert.equal(resumed.data.added, 60);

    let got429 = false;
    for (let i = 0; i < 28; i++) {
      const r = await api('POST', '/api/shop/checkin', 'token-bob', {});
      if (r.status === 429) {
        got429 = true;
        break;
      }
    }
    assert.equal(got429, true);
  });

  it('10. Phase 11-D Hardening: validates mission proofs strictly, deep-merges partial admin settings & scales spinSegments', async () => {
    // Arbitrary demo-prod-999 prefix bypass rejected; valid demo-prod-1 accepted
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

    // watch_video rejects fabricated proofId, accepts real product videoUrls[idx] and published video doc
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'watch_video',
        proofId: 'fake_video_123',
      })).status,
      400
    );

    await memDb.collection('catalog_products').doc('prod_reel_01').set({
      name: 'KING Elite Sneakers',
      isActive: true,
      videoUrls: ['https://example.com/reel0.mp4'],
    });
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'watch_video',
        proofId: 'prod_reel_01_v1', // out-of-bounds index rejected
      })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-alice', {
        missionId: 'watch_video',
        proofId: 'prod_reel_01_v0',
      })).status,
      200
    );

    // share_shop rejects arbitrary proofId and accepts exact shop_link_share
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

    // Partial admin updates preserve existing custom title when only coins/enabled is updated
    const setCustomTitle = await api('POST', '/api/shop/admin/settings', 'token-admin', {
      missions: { browse_products: { title: 'VIP Explorer' } },
    });
    assert.equal(setCustomTitle.status, 200);
    assert.equal(setCustomTitle.data.settings.missions.browse_products.title, 'VIP Explorer');

    const partialUpdate = await api('POST', '/api/shop/admin/settings', 'token-admin', {
      missions: { browse_products: { coins: 35 } },
      games: { spin: { minCoins: 20, maxCoins: 100 } },
    });
    assert.equal(partialUpdate.status, 200);
    assert.equal(partialUpdate.data.settings.missions.browse_products.title, 'VIP Explorer');
    assert.equal(partialUpdate.data.settings.missions.browse_products.coins, 35);

    // Custom spin bounds scale spinSegments across [20..100] and rewards stay within [20..100]
    const w = await api('GET', '/api/shop/wallet', 'token-bob');
    assert.deepEqual(w.data.config.games.spin.spinSegments, [20, 36, 52, 68, 84, 100]);

    const spinRes = await api('POST', '/api/shop/game/reward', 'token-bob', { gameType: 'spin' });
    assert.equal(spinRes.status, 200);
    assert.ok([20, 36, 52, 68, 84, 100].includes(spinRes.data.added));

    // Paused rewards program blocks mission/track cleanly
    await api('POST', '/api/shop/admin/settings', 'token-admin', { rewardsEnabled: false });
    assert.equal(
      (await api('POST', '/api/shop/mission/track', 'token-bob', {
        missionId: 'share_shop',
        proofId: 'shop_link_share',
      })).status,
      403
    );
  });

  it('11. Phase 12 Concurrency & End-to-End Guards: simultaneous redeem race, simultaneous puzzle claim race, cross-user rejection & full pause gate', async () => {
    // Accumulate Alice to exactly 155 coins (50 welcome + 25 checkin + 40 puzzle + 40 puzzle)
    await api('POST', '/api/shop/checkin', 'token-alice', {}); // 75
    const pA1 = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pA1.data.sessionId,
      moves: bfsSolvePuzzle(pA1.data.board),
    }); // 115
    const pA2 = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: pA2.data.sessionId,
      moves: bfsSolvePuzzle(pA2.data.board),
    }); // 155

    // Two simultaneous redemptions for free_delivery (150 each) with different keys -> only 1 succeeds, balance never goes negative
    const [r1, r2] = await Promise.all([
      api('POST', '/api/shop/redeem', 'token-alice', {
        rewardId: 'free_delivery',
        idempotencyKey: 'race_k1',
      }),
      api('POST', '/api/shop/redeem', 'token-alice', {
        rewardId: 'free_delivery',
        idempotencyKey: 'race_k2',
      }),
    ]);
    const rStatuses = [r1.status, r2.status].sort((a, b) => a - b);
    assert.deepEqual(rStatuses, [200, 400]);

    const walletAfterRedeem = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(walletAfterRedeem.data.balance, 5);
    assert.equal(walletAfterRedeem.data.coupons.length, 1);

    // Simultaneous puzzle claim burst on same valid session -> 1 wins (200), 1 rejected as replay (409)
    const pRace = await api('POST', '/api/shop/games/puzzle-start', 'token-bob', {});
    const bobMoves = bfsSolvePuzzle(pRace.data.board);

    // Cross-user puzzle hijack rejected
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'puzzle',
        sessionId: pRace.data.sessionId,
        moves: bobMoves,
      })).status,
      400
    );

    const [pBurst1, pBurst2] = await Promise.all([
      api('POST', '/api/shop/game/reward', 'token-bob', {
        gameType: 'puzzle',
        sessionId: pRace.data.sessionId,
        moves: bobMoves,
      }),
      api('POST', '/api/shop/game/reward', 'token-bob', {
        gameType: 'puzzle',
        sessionId: pRace.data.sessionId,
        moves: bobMoves,
      }),
    ]);
    assert.deepEqual([pBurst1.status, pBurst2.status].sort((a, b) => a - b), [200, 409]);

    // Pause rewards -> every mutation endpoint rejects with 403
    await api('POST', '/api/shop/admin/settings', 'token-admin', { rewardsEnabled: false });
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 403);
    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-bob', { missionId: 'share_shop' })).status,
      403
    );
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-bob', { gameType: 'spin' })).status,
      403
    );
    assert.equal(
      (await api('POST', '/api/shop/redeem', 'token-bob', { rewardId: 'free_delivery' })).status,
      403
    );
  });

  it('12. Phase 13 Security & Anti-Farming: 20-question non-repeating quiz, game-start daily cap, coupon minOrderAmount, expiry, active-tier lock & verify endpoint', async () => {
    assert.ok(KING_QUIZ_BANK.length >= 20, 'KING_QUIZ_BANK must have at least 20 unique questions');

    // Issue 5 unique quiz challenges for Alice and solve all 5 -> 6th quiz-question call blocked (429) before issuing challenge
    const seenQuestions = new Set<string>();
    for (let i = 0; i < 5; i++) {
      const q = await api('GET', '/api/shop/games/quiz-question', 'token-alice');
      assert.equal(q.status, 200);
      assert.equal(seenQuestions.has(q.data.question), false, 'Should avoid repeating quiz questions same day');
      seenQuestions.add(q.data.question);

      const qDef = KING_QUIZ_BANK.find((item) => item.question === q.data.question)!;
      const ansIdx = q.data.options.indexOf(qDef.options[qDef.correctIndex]);
      const sub = await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'quiz',
        challengeId: q.data.challengeId,
        selectedOption: ansIdx,
      });
      assert.equal(sub.status, 200);
    }
    assert.equal((await api('GET', '/api/shop/games/quiz-question', 'token-alice')).status, 429);

    // Exhaust Alice puzzle plays (5x40 = 200 coins; total now 50 + 125 + 200 = 375 coins) -> 6th puzzle-start blocked (429)
    for (let p = 0; p < 5; p++) {
      const ps = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
      assert.equal(ps.status, 200);
      const pw = await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'puzzle',
        sessionId: ps.data.sessionId,
        moves: bfsSolvePuzzle(ps.data.board),
      });
      assert.equal(pw.status, 200);
    }
    assert.equal((await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {})).status, 429);

    // Give Alice more coins via check-ins across days to test coupon locks & daily redemption cap
    for (let d = 1; d <= 14; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 27 + d, 12, 0, 0));
      assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    } // +350 => balance 725 (enough for 150 + 150 + 250 + 150 attempt)

    // Redeem free_delivery (150, minOrderAmount 1000)
    const rFree = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'free_delivery',
      idempotencyKey: 'p13_fd_1',
    });
    assert.equal(rFree.status, 200);
    assert.equal(rFree.data.minOrderAmount, 1000);
    assert.ok(rFree.data.expiresAt);

    // Duplicate active voucher for SAME reward tier blocked (409) even with different idempotencyKey
    const rFreeDup = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'free_delivery',
      idempotencyKey: 'p13_fd_2',
    });
    assert.equal(rFreeDup.status, 409);

    // Admin coupon verify: fails if orderAmount < minOrderAmount, succeeds when >= minOrderAmount
    const vFailMin = await api('POST', '/api/shop/admin/coupons/verify', 'token-admin', {
      code: rFree.data.code,
      orderAmount: 500,
    });
    assert.equal(vFailMin.status, 200);
    assert.equal(vFailMin.data.valid, false);

    const vPass = await api('POST', '/api/shop/admin/coupons/verify', 'token-admin', {
      code: rFree.data.code,
      orderAmount: 1500,
    });
    assert.equal(vPass.status, 200);
    assert.equal(vPass.data.valid, true);

    // Admin marks coupon 'used' -> cannot revert to 'active' (409), verify rejects, and active lock is released
    assert.equal(
      (await api('PATCH', `/api/shop/admin/coupons/${rFree.data.couponId}`, 'token-admin', {
        status: 'used',
      })).status,
      200
    );
    assert.equal(
      (await api('PATCH', `/api/shop/admin/coupons/${rFree.data.couponId}`, 'token-admin', {
        status: 'active',
      })).status,
      409
    );
    const vAfterUse = await api('POST', '/api/shop/admin/coupons/verify', 'token-admin', {
      code: rFree.data.code,
      orderAmount: 1500,
    });
    assert.equal(vAfterUse.data.valid, false);

    // Lock cleared, so Alice can redeem free_delivery a 2nd time, plus coupon_500 (3rd redemption today)
    const rFree2 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'free_delivery',
      idempotencyKey: 'p13_fd_3',
    });
    assert.equal(rFree2.status, 200);
    const r500 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'p13_c500_1',
    });
    assert.equal(r500.status, 200);
    assert.equal(r500.data.minOrderAmount, 2000);

    // Mark rFree2 used too so only daily limit applies; 4th redemption in same UTC day blocked (429)
    await api('PATCH', `/api/shop/admin/coupons/${rFree2.data.couponId}`, 'token-admin', { status: 'used' });
    const r4th = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'free_delivery',
      idempotencyKey: 'p13_fd_4',
    });
    assert.equal(r4th.status, 429);

    // Fast-forward 31 days -> coupon_500 shows 'expired' & cannot be reactivated (400)
    simulatedNow = new Date(simulatedNow.getTime() + 31 * 24 * 60 * 60 * 1000);
    const wExpired = await api('GET', '/api/shop/wallet', 'token-alice');
    const c500View = wExpired.data.coupons.find((c: any) => c.id === r500.data.couponId);
    assert.equal(c500View.status, 'expired');

    assert.equal(
      (await api('PATCH', `/api/shop/admin/coupons/${r500.data.couponId}`, 'token-admin', {
        status: 'active',
      })).status,
      400
    );
  });

  it('13. Phase 14 Customer Coupon Validation & Secure WhatsApp Checkout: trusted pricing, ownership, category/minOrder, clamping & concurrent reservation', async () => {
    // Seed real catalog products in Firestore
    await memDb.collection('catalog_products').doc('prod_low').set({
      name: 'KING Gaming Pad',
      category: 'Gaming',
      originalPrice: 1500,
      discountPrice: 1200,
      stock: 10,
      isActive: true,
    });
    await memDb.collection('catalog_products').doc('prod_wear').set({
      name: 'KING Smart Band',
      category: 'Wearables',
      originalPrice: 650,
      stock: 5,
      isActive: true,
    });

    // Give Alice coins for coupon_500 (250) + coupon_1000 (450) within 25/min path limit: 20 checkins (500) + 50 welcome + 5 puzzles (200) = 750
    for (let d = 1; d <= 20; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 1 + d, 12, 0, 0));
      assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    }
    for (let p = 0; p < 5; p++) {
      const ps = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
      assert.equal((await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'puzzle',
        sessionId: ps.data.sessionId,
        moves: bfsSolvePuzzle(ps.data.board),
      })).status, 200);
    }

    const r500 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'p14_500',
    });
    assert.equal(r500.status, 200);
    const code500 = r500.data.code;

    // 0) Unseeded demo fallback products MUST NOT be accepted for production pricing/checkout
    assert.equal(
      (await api('POST', '/api/shop/coupons/validate', 'token-alice', {
        code: code500,
        items: [{ productId: 'demo-prod-1', quantity: 1 }],
      })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
        items: [{ productId: 'demo-prod-1', quantity: 1 }],
        idempotencyKey: 'demo_reject_1',
      })).status,
      400
    );

    // 1) Invalid & malformed codes rejected against real seeded catalog product
    assert.equal(
      (await api('POST', '/api/shop/coupons/validate', 'token-alice', {
        code: 'KING-FAKE-999',
        items: [{ productId: 'prod_low', quantity: 2 }],
      })).status,
      404
    );
    assert.equal(
      (await api('POST', '/api/shop/coupons/validate', 'token-alice', {
        code: 'bad code!!',
        items: [{ productId: 'prod_low', quantity: 2 }],
      })).status,
      400
    );

    // 2) Another user's coupon rejected (403)
    const otherUserVal = await api('POST', '/api/shop/coupons/validate', 'token-bob', {
      code: code500,
      items: [{ productId: 'prod_low', quantity: 2 }],
    });
    assert.equal(otherUserVal.status, 403);
    const otherUserCheckout = await api('POST', '/api/shop/checkout/whatsapp', 'token-bob', {
      items: [{ productId: 'prod_low', quantity: 2 }],
      couponCode: code500,
      idempotencyKey: 'bob_steal_1',
    });
    assert.equal(otherUserCheckout.status, 403);

    // 3) Below minOrderAmount (2000) rejected against prod_low (1200)
    const belowMin = await api('POST', '/api/shop/coupons/validate', 'token-alice', {
      code: code500,
      items: [{ productId: 'prod_low', quantity: 1 }],
    });
    assert.equal(belowMin.status, 400);

    // 4) Forged client prices/discounts ignored; qty=2 of prod_low => 2 * 1200 = 2400 (>= 2000)
    const validForgedFields = await api('POST', '/api/shop/coupons/validate', 'token-alice', {
      code: code500,
      items: [{ productId: 'prod_low', quantity: 2, price: 999999, unitPrice: 1, lineTotal: 1 }],
      subtotal: 999999,
      discountAmount: 99999,
      finalTotal: 1,
    });
    assert.equal(validForgedFields.status, 200);
    assert.equal(validForgedFields.data.subtotal, 2400);
    assert.equal(validForgedFields.data.discountAmount, 500);
    assert.equal(validForgedFields.data.finalTotal, 1900);

    // 5) Concurrent duplicate WhatsApp checkout with same coupon: one succeeds (200), one blocked (409)
    const [coA, coB] = await Promise.all([
      api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
        items: [{ productId: 'prod_low', quantity: 2, price: 50 }],
        couponCode: code500,
        idempotencyKey: 'conc_a',
      }),
      api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
        items: [{ productId: 'prod_low', quantity: 2, price: 50 }],
        couponCode: code500,
        idempotencyKey: 'conc_b',
      }),
    ]);
    const statuses = [coA.status, coB.status].sort((a, b) => a - b);
    assert.deepEqual(statuses, [200, 409], 'Concurrent coupon checkout must reserve once and reject duplicate');
    const winner = coA.status === 200 ? coA : coB;
    const orderRef = winner.data.orderRef;

    assert.ok(orderRef.startsWith('ORD-'));
    assert.equal(winner.data.subtotal, 2400);
    assert.equal(winner.data.discountAmount, 500);
    assert.equal(winner.data.finalTotal, 1900);
    assert.equal(winner.data.coupon.status, 'reserved', 'Opening WhatsApp must reserve coupon, NOT mark used');
    assert.ok(winner.data.whatsappMessage.includes(orderRef));
    assert.ok(winner.data.whatsappMessage.includes(code500));
    assert.ok(winner.data.whatsappMessage.includes('2,400'));
    assert.ok(winner.data.whatsappMessage.includes('500'));
    assert.ok(winner.data.whatsappMessage.includes('1,900'));

    // 6) Idempotent retry returns same orderRef & snapshot; mismatched items with same key rejected (409)
    const winnerKey = coA.status === 200 ? 'conc_a' : 'conc_b';
    const replay = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_low', quantity: 2 }],
      couponCode: code500,
      idempotencyKey: winnerKey,
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.data.idempotentReplay, true);
    assert.equal(replay.data.orderRef, orderRef);

    const mismatchKey = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_low', quantity: 1 }],
      couponCode: code500,
      idempotencyKey: winnerKey,
    });
    assert.equal(mismatchKey.status, 409);

    // 7) Category eligibility + discount clamping (Rs. 1000 voucher on Rs. 650 Wearables item -> clamped to 650, final 0)
    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      rewardsCatalog: {
        coupon_1000: {
          minOrderAmount: 0,
          eligibleCategories: ['Wearables'],
        },
      },
    });
    const r1000 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_1000',
      idempotencyKey: 'p14_1000',
    });
    assert.equal(r1000.status, 200);

    // Wrong category rejected
    assert.equal(
      (await api('POST', '/api/shop/coupons/validate', 'token-alice', {
        code: r1000.data.code,
        items: [{ productId: 'prod_low', quantity: 1 }],
      })).status,
      400
    );

    // Mixed cart: prod_low (Gaming 1200) + prod_wear (Wearables 650) = 1850; eligibleSubtotal=650 => discount=650, finalTotal=1200
    const clampedQuote = await api('POST', '/api/shop/coupons/validate', 'token-alice', {
      code: r1000.data.code,
      items: [
        { productId: 'prod_low', quantity: 1 },
        { productId: 'prod_wear', quantity: 1 },
      ],
    });
    assert.equal(clampedQuote.status, 200);
    assert.equal(clampedQuote.data.subtotal, 1850);
    assert.equal(clampedQuote.data.eligibleSubtotal, 650);
    assert.equal(clampedQuote.data.discountAmount, 650);
    assert.equal(clampedQuote.data.finalTotal, 1200);

    // Wearables-only cart (650): discount clamped to 650, finalTotal === 0 (never negative)
    const zeroFloorQuote = await api('POST', '/api/shop/coupons/validate', 'token-alice', {
      code: r1000.data.code,
      items: [{ productId: 'prod_wear', quantity: 1 }],
    });
    assert.equal(zeroFloorQuote.status, 200);
    assert.equal(zeroFloorQuote.data.discountAmount, 650);
    assert.equal(zeroFloorQuote.data.finalTotal, 0);
  });

  it('14. Phase 14 Reservation Lifecycle: abandoned release, TTL auto-expiry, expired coupon, rewards pause & admin order confirmation', async () => {
    await memDb.collection('catalog_products').doc('prod_std').set({
      name: 'KING Elite Watch',
      category: 'Wearables',
      originalPrice: 5000,
      stock: 5,
      isActive: true,
    });

    for (let d = 1; d <= 15; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 1 + d, 12, 0, 0));
      assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    }

    const r500 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'p14_life_500',
    });
    assert.equal(r500.status, 200);
    const code = r500.data.code;

    // 1) Reserve via WhatsApp checkout
    const co1 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_std', quantity: 1 }],
      couponCode: code,
      idempotencyKey: 'life_co_1',
    });
    assert.equal(co1.status, 200);
    const order1 = co1.data.orderRef;

    // Cannot validate while reserved (409)
    assert.equal(
      (await api('POST', '/api/shop/coupons/validate', 'token-alice', {
        code,
        items: [{ productId: 'prod_std', quantity: 1 }],
      })).status,
      409
    );

    // Bob cannot release Alice's reservation (403)
    assert.equal(
      (await api('POST', '/api/shop/checkout/release', 'token-bob', {
        couponCode: code,
        orderRef: order1,
      })).status,
      403
    );

    // Alice releases abandoned checkout -> coupon active again & order cancelled
    const rel = await api('POST', '/api/shop/checkout/release', 'token-alice', {
      couponCode: code,
      orderRef: order1,
    });
    assert.equal(rel.status, 200);
    assert.equal(rel.data.released, true);
    assert.equal(rel.data.status, 'active');

    // Coupon works again after release -> create co2
    const co2 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_std', quantity: 1 }],
      couponCode: code,
      idempotencyKey: 'life_co_2',
    });
    assert.equal(co2.status, 200);
    const order2 = co2.data.orderRef;

    // 2) Reservation TTL expires after 15 minutes -> auto-releases without losing coupon, old order flagged reservation_expired
    simulatedNow = new Date(simulatedNow.getTime() + RESERVATION_TTL_MS + 1000);
    const valAfterTtl = await api('POST', '/api/shop/coupons/validate', 'token-alice', {
      code,
      items: [{ productId: 'prod_std', quantity: 1 }],
    });
    assert.equal(valAfterTtl.status, 200);
    assert.equal(valAfterTtl.data.coupon.status, 'active');

    const overviewExpired = await api('GET', '/api/shop/admin/overview', 'token-admin');
    const order2Summary = overviewExpired.data.orders.find((o: any) => o.orderRef === order2);
    assert.equal(order2Summary.status, 'reservation_expired');
    assert.equal(JSON.stringify(overviewExpired.data.orders).includes('alice@example.com'), false);

    // 3) Rewards paused disables coupon validation & coupon checkout
    await api('POST', '/api/shop/admin/settings', 'token-admin', { rewardsEnabled: false });
    assert.equal(
      (await api('POST', '/api/shop/coupons/validate', 'token-alice', {
        code,
        items: [{ productId: 'prod_std', quantity: 1 }],
      })).status,
      403
    );
    assert.equal(
      (await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
        items: [{ productId: 'prod_std', quantity: 1 }],
        couponCode: code,
        idempotencyKey: 'life_co_paused',
      })).status,
      403
    );
    await api('POST', '/api/shop/admin/settings', 'token-admin', { rewardsEnabled: true });

    // 4) Re-reserve via checkout (co3) & Admin confirms payment -> marks coupon 'used' + order 'confirmed'
    const co3 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_std', quantity: 1 }],
      couponCode: code,
      idempotencyKey: 'life_co_3',
    });
    assert.equal(co3.status, 200);
    const order3 = co3.data.orderRef;

    const overviewReserved = await api('GET', '/api/shop/admin/overview', 'token-admin');
    const cView = overviewReserved.data.coupons.find((c: any) => c.id === r500.data.couponId);
    assert.equal(cView.status, 'reserved');
    assert.equal(cView.reservedOrderRef, order3);

    const adminConfirm = await api('PATCH', `/api/shop/admin/coupons/${r500.data.couponId}`, 'token-admin', {
      status: 'used',
    });
    assert.equal(adminConfirm.status, 200);

    const overviewConfirmed = await api('GET', '/api/shop/admin/overview', 'token-admin');
    const cConfirmed = overviewConfirmed.data.coupons.find((c: any) => c.id === r500.data.couponId);
    const oConfirmed = overviewConfirmed.data.orders.find((o: any) => o.orderRef === order3);
    assert.equal(cConfirmed.status, 'used');
    assert.equal(cConfirmed.usedOrderRef, order3);
    assert.equal(oConfirmed.status, 'confirmed');

    // Used coupon cannot be reused (409)
    assert.equal(
      (await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
        items: [{ productId: 'prod_std', quantity: 1 }],
        couponCode: code,
        idempotencyKey: 'life_co_4',
      })).status,
      409
    );

    // 5) Expired coupon (31d later) rejected by validate & checkout
    const rFree = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'free_delivery',
      idempotencyKey: 'p14_exp_fd',
    });
    assert.equal(rFree.status, 200);
    simulatedNow = new Date(simulatedNow.getTime() + 31 * 24 * 60 * 60 * 1000);
    assert.equal(
      (await api('POST', '/api/shop/coupons/validate', 'token-alice', {
        code: rFree.data.code,
        items: [{ productId: 'prod_std', quantity: 1 }],
      })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
        items: [{ productId: 'prod_std', quantity: 1 }],
        couponCode: rFree.data.code,
        idempotencyKey: 'life_co_exp',
      })).status,
      400
    );
  });

  it('15. Stage 15A Order Infrastructure: manual admin verify (confirm_paid, cancel, refund), guards & audit log', async () => {
    await memDb.collection('catalog_products').doc('prod_watch').set({
      name: 'KING Sapphire Watch',
      category: 'Watches',
      originalPrice: 6000,
      stock: 5,
      isActive: true,
    });

    for (let d = 1; d <= 12; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 1 + d, 12, 0, 0));
      assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    }

    const r500 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'p15a_500',
    });
    assert.equal(r500.status, 200);

    // Order 1: WhatsApp checkout starts unpaid / unverified_whatsapp_pending
    const co1 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_watch', quantity: 1 }],
      couponCode: r500.data.code,
      idempotencyKey: 'p15a_co_1',
    });
    assert.equal(co1.status, 200);
    const ref1 = co1.data.orderRef;

    // Non-admin cannot verify orders
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-alice', {
        action: 'confirm_paid',
      })).status,
      403
    );

    // Confirm paid manually by Super Admin
    const confirm1 = await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-admin', {
      action: 'confirm_paid',
      note: 'Bank transfer receipt #8821 verified',
    });
    assert.equal(confirm1.status, 200);
    assert.equal(confirm1.data.status, 'confirmed');
    assert.equal(confirm1.data.paymentStatus, 'paid');
    assert.equal(confirm1.data.verificationMethod, 'manual_admin');

    // Double confirmation blocked (409)
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-admin', {
        action: 'confirm_paid',
      })).status,
      409
    );

    // Overview shows verified metadata and coupon marked used
    const ov1 = await api('GET', '/api/shop/admin/overview', 'token-admin');
    const ord1 = ov1.data.orders.find((o: any) => o.orderRef === ref1);
    assert.equal(ord1.paymentStatus, 'paid');
    assert.equal(ord1.verificationMethod, 'manual_admin');

    // Refund order 1
    const refund1 = await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-admin', {
      action: 'refund',
      note: 'Customer returned item',
    });
    assert.equal(refund1.status, 200);
    assert.equal(refund1.data.status, 'refunded');
    assert.equal(refund1.data.paymentStatus, 'refunded');

    // Cancelled order cannot later be confirmed (409)
    const co2 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_watch', quantity: 1 }],
      idempotencyKey: 'p15a_co_2',
    });
    assert.equal(co2.status, 200);
    const cancel2 = await api('POST', `/api/shop/admin/orders/${co2.data.orderRef}/verify`, 'token-admin', {
      action: 'cancel',
      note: 'No response on WhatsApp',
    });
    assert.equal(cancel2.status, 200);
    assert.equal(cancel2.data.status, 'cancelled');

    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${co2.data.orderRef}/verify`, 'token-admin', {
        action: 'confirm_paid',
      })).status,
      409
    );
  });

  it('16. Stage 15B Progressive 7-Day Streak, Grace Day, Timezone Switch & Daily Global/Source Coin Caps', async () => {
    // Enable progressive 7-day streak + Day 7 bonus + 1 grace day + strict daily global cap = 70
    const cfg = await api('POST', '/api/shop/admin/settings', 'token-admin', {
      streakConfig: {
        timezone: 'Asia/Karachi',
        useProgressiveSchedule: true,
        schedule: [20, 25, 35, 40, 50, 60, 100],
        day7BonusCoins: 25,
        graceDays: 1,
        missedDayResetPolicy: 'decrement_by_one',
      },
      economyConfig: {
        globalDailyEarnCap: 70,
        sourceDailyCaps: {
          checkin: 150,
          game: 50,
          mission: 50,
          achievement: 200,
        },
      },
    });
    assert.equal(cfg.status, 200);

    // Day 1..6 progressive payouts (Nov 1..6, 12:00 UTC = 17:00 PKT)
    const expectedPayouts = [20, 25, 35, 40, 50, 60];
    for (let i = 0; i < 6; i++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 1 + i, 12, 0, 0));
      const res = await api('POST', '/api/shop/checkin', 'token-alice', {});
      assert.equal(res.status, 200);
      assert.equal(res.data.streak, i + 1);
      assert.equal(res.data.added, expectedPayouts[i]);
    }

    // Day 7: 100 base + 25 Day-7 bonus = 125 requested, clamped cleanly by globalDailyEarnCap = 70!
    simulatedNow = new Date(Date.UTC(2026, 10, 7, 12, 0, 0));
    const day7 = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(day7.status, 200);
    assert.equal(day7.data.streak, 7);
    assert.equal(day7.data.added, 70);
    assert.equal(day7.data.isDay7Milestone, true);
    assert.equal(day7.data.has7DayBadge, true);

    // Further game earn on same day rejected with 429 due to globalDailyEarnCap reached (70/70)
    const blockedSpin = await api('POST', '/api/shop/game/reward', 'token-alice', { gameType: 'spin' });
    assert.equal(blockedSpin.status, 429);

    // Skip 1 day (Nov 8 missed, check-in Nov 9 = diff 2 -> 1 grace day preserves streak -> 8!)
    simulatedNow = new Date(Date.UTC(2026, 10, 9, 12, 0, 0));
    const graceCheckin = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(graceCheckin.status, 200);
    assert.equal(graceCheckin.data.streak, 8);
    assert.equal(graceCheckin.data.usedGrace, true);

    // Source daily cap check (game cap = 50): spin once or twice then blocked with 429
    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      economyConfig: {
        globalDailyEarnCap: 500,
        sourceDailyCaps: { game: 25 },
      },
    });
    const q1 = await api('GET', '/api/shop/games/quiz-question', 'token-bob');
    const qDef = KING_QUIZ_BANK.find((q) => q.question === q1.data.question)!;
    const ans = q1.data.options.indexOf(qDef.options[qDef.correctIndex]);
    const qWin = await api('POST', '/api/shop/game/reward', 'token-bob', {
      gameType: 'quiz',
      challengeId: q1.data.challengeId,
      selectedOption: ans,
    });
    assert.equal(qWin.status, 200);
    assert.equal(qWin.data.added, 25);

    const pBob = await api('POST', '/api/shop/games/puzzle-start', 'token-bob', {});
    const pBlocked = await api('POST', '/api/shop/game/reward', 'token-bob', {
      gameType: 'puzzle',
      sessionId: pBob.data.sessionId,
      moves: bfsSolvePuzzle(pBob.data.board),
    });
    assert.equal(pBlocked.status, 429);

    // Skip 3 days for Alice (Nov 9 -> Nov 12, diff=3 > 1+graceDays) with decrement_by_one policy (streak 8 -> 7)
    simulatedNow = new Date(Date.UTC(2026, 10, 12, 12, 0, 0));
    const decRes = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(decRes.status, 200);
    assert.equal(decRes.data.streak, 7);
    assert.equal(decRes.data.bestStreak, 8);

    // Verify Admin configurable timezone to UTC changes rollover boundary
    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      streakConfig: { timezone: 'UTC' },
    });
    simulatedNow = new Date('2026-11-12T23:59:59.000Z');
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 409);
    simulatedNow = new Date('2026-11-13T00:00:01.000Z');
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
  });

  it('17. Stage 15C KING Arcade: Scratch & Win + Memory Match server validation, concealment & replay guards', async () => {
    // 1) Scratch & Win: start does NOT leak prizeCoins; requires >= 3 unique cells; awards bounded prize; blocks replay & daily cap
    const scrStart = await api('POST', '/api/shop/games/scratch-start', 'token-alice', {});
    assert.equal(scrStart.status, 200);
    assert.equal(scrStart.data.gridSize, 9);
    assert.equal((scrStart.data as any).prizeCoins, undefined);

    // Reject < 3 tiles scratched
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'scratch',
        sessionId: scrStart.data.sessionId,
        scratchedCells: [0, 1],
      })).status,
      400
    );

    // Cross-user hijack rejected
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-bob', {
        gameType: 'scratch',
        sessionId: scrStart.data.sessionId,
        scratchedCells: [0, 1, 2],
      })).status,
      400
    );

    // Valid claim awards server-rolled prize in [10..50]
    const scrClaim = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'scratch',
      sessionId: scrStart.data.sessionId,
      scratchedCells: [0, 4, 8],
    });
    assert.equal(scrClaim.status, 200);
    assert.ok(scrClaim.data.added >= 10 && scrClaim.data.added <= 50);
    assert.equal(scrClaim.data.playsLeft, 0);

    // Replay blocked (409) and 2nd scratch-start same day blocked (429)
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'scratch',
        sessionId: scrStart.data.sessionId,
        scratchedCells: [0, 4, 8],
      })).status,
      409
    );
    assert.equal((await api('POST', '/api/shop/games/scratch-start', 'token-alice', {})).status, 429);

    // 2) Memory Match: start conceals deck, flips pair-by-pair cleanly, blocks premature claim, pays on all 6 pairs
    const memStart = await api('POST', '/api/shop/games/memory-start', 'token-alice', {});
    assert.equal(memStart.status, 200);
    assert.equal(memStart.data.cardCount, 12);
    assert.equal((memStart.data as any).deck, undefined);

    // Premature reward claim before matching 6 pairs rejected (400)
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'memory',
        sessionId: memStart.data.sessionId,
      })).status,
      400
    );

    // Flip indices sequentially to learn deck legitimately via server /memory-flip endpoint, then match all pairs
    const discovered = new Map<number, string>();
    let matchedCount = 0;
    for (let i = 0; i < 12 && matchedCount < 6; i += 2) {
      const f = await api('POST', '/api/shop/games/memory-flip', 'token-alice', {
        sessionId: memStart.data.sessionId,
        indices: [i, i + 1],
      });
      assert.equal(f.status, 200);
      discovered.set(i, f.data.cards[0]);
      discovered.set(i + 1, f.data.cards[1]);
      matchedCount = f.data.matchedPairs.length;
    }

    // Group remaining unmatched indices by symbol and flip each matching pair
    const sessionSnap = await memDb.collection('king_shop_game_sessions').doc(memStart.data.sessionId).get();
    const matchedIdxSet = new Set<number>(sessionSnap.data()?.matchedIndices || []);
    const bySymbol = new Map<string, number[]>();
    for (const [idx, sym] of discovered.entries()) {
      if (matchedIdxSet.has(idx)) continue;
      bySymbol.set(sym, [...(bySymbol.get(sym) || []), idx]);
    }
    for (const pair of bySymbol.values()) {
      if (pair.length === 2) {
        const fMatch = await api('POST', '/api/shop/games/memory-flip', 'token-alice', {
          sessionId: memStart.data.sessionId,
          indices: [pair[0], pair[1]],
        });
        assert.equal(fMatch.status, 200);
        assert.equal(fMatch.data.matched, true);
        matchedCount = fMatch.data.matchedPairs.length;
      }
    }
    assert.equal(matchedCount, 6);

    const memClaim = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'memory',
      sessionId: memStart.data.sessionId,
    });
    assert.equal(memClaim.status, 200);
    assert.equal(memClaim.data.added, 30);

    // Replay blocked (409)
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'memory',
        sessionId: memStart.data.sessionId,
      })).status,
      409
    );
  });

  it('18. Stage 15C Verified Daily & Weekly Missions: activity proof enforcement, duplicate guards & weekly rollover', async () => {
    // None of the new missions can be spoof-claimed before performing real actions
    for (const mId of [
      'daily_checkin_mission',
      'play_games_2',
      'arcade_variety_2',
      'weekly_streak_5',
      'weekly_quiz_5',
    ]) {
      assert.equal((await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: mId })).status, 400);
    }

    // Perform check-in + 2 different games (spin + scratch) -> unlocks daily_checkin_mission, play_games_2, arcade_variety_2
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'daily_checkin_mission' })).status,
      200
    );

    assert.equal((await api('POST', '/api/shop/game/reward', 'token-alice', { gameType: 'spin' })).status, 200);
    const scr = await api('POST', '/api/shop/games/scratch-start', 'token-alice', {});
    assert.equal(
      (await api('POST', '/api/shop/game/reward', 'token-alice', {
        gameType: 'scratch',
        sessionId: scr.data.sessionId,
        scratchedCells: [1, 2, 3],
      })).status,
      200
    );

    const wDaily = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.ok(wDaily.data.verifiedMissionsToday.includes('daily_checkin_mission'));
    assert.ok(wDaily.data.verifiedMissionsToday.includes('play_games_2'));
    assert.ok(wDaily.data.verifiedMissionsToday.includes('arcade_variety_2'));

    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'play_games_2' })).status,
      200
    );
    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'arcade_variety_2' })).status,
      200
    );
    // Duplicate same-day claim blocked (409)
    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'play_games_2' })).status,
      409
    );

    // 5 quiz wins in the same ISO week (Nov 23 Mon .. Nov 27 Fri -> same week as 2026-11-27) + 4 more checkins = 5 checkins this week
    for (let d = 1; d <= 4; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, 27 - d, 12, 0, 0));
      assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    }
    simulatedNow = new Date('2026-11-27T12:00:00.000Z');
    for (let i = 0; i < 5; i++) {
      const q = await api('GET', '/api/shop/games/quiz-question', 'token-alice');
      const qDef = KING_QUIZ_BANK.find((item) => item.question === q.data.question)!;
      const ans = q.data.options.indexOf(qDef.options[qDef.correctIndex]);
      assert.equal(
        (await api('POST', '/api/shop/game/reward', 'token-alice', {
          gameType: 'quiz',
          challengeId: q.data.challengeId,
          selectedOption: ans,
        })).status,
        200
      );
    }

    const wWeekly = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.ok(wWeekly.data.verifiedMissionsWeekly.includes('weekly_streak_5'));
    assert.ok(wWeekly.data.verifiedMissionsWeekly.includes('weekly_quiz_5'));

    const claimW1 = await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'weekly_streak_5' });
    assert.equal(claimW1.status, 200);
    assert.equal(claimW1.data.added, 60);
    const claimW2 = await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'weekly_quiz_5' });
    assert.equal(claimW2.status, 200);
    assert.equal(claimW2.data.added, 50);

    // Duplicate claim same week blocked (409), even on next day within same week (Sat Nov 28)
    simulatedNow = new Date('2026-11-28T12:00:00.000Z');
    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'weekly_quiz_5' })).status,
      409
    );

    // Next ISO week resets weekly progress so cannot claim without re-earning
    simulatedNow = new Date('2026-12-01T12:00:00.000Z');
    assert.equal(
      (await api('POST', '/api/shop/mission/complete', 'token-alice', { missionId: 'weekly_quiz_5' })).status,
      400
    );
  });

  it('19. Stage 15D VIP Loyalty: verified spend integrity, tier progression, capped Coin multiplier & refund policy', async () => {
    await memDb.collection('catalog_products').doc('prod_vip_6k').set({
      name: 'KING Elite Chronograph',
      category: 'Watches',
      originalPrice: 6000,
      stock: 10,
      isActive: true,
    });
    await memDb.collection('catalog_products').doc('prod_vip_10k').set({
      name: 'KING Imperial Sapphire',
      category: 'Luxury',
      originalPrice: 10000,
      stock: 10,
      isActive: true,
    });

    // Give Alice enough Coins via checkins & quiz wins for a 500-PKR coupon + ensure check-in balance doesn't count as VIP spend
    for (let d = 1; d <= 12; d++) {
      simulatedNow = new Date(Date.UTC(2026, 10, d, 12, 0, 0));
      assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    }
    const r500 = await api('POST', '/api/shop/redeem', 'token-alice', {
      rewardId: 'coupon_500',
      idempotencyKey: 'p15d_vip_500',
    });
    assert.equal(r500.status, 200);

    // 1) Opening WhatsApp checkout (even with 16k cart) must NOT grant VIP spend
    const coPending = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_vip_6k', quantity: 1 }],
      couponCode: r500.data.code,
      idempotencyKey: 'p15d_co_1',
    });
    assert.equal(coPending.status, 200);
    assert.equal(coPending.data.finalTotal, 5500);

    let w = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(w.data.vip.tier, 'bronze');
    assert.equal(w.data.vip.verifiedSpendTotal, 0);

    // Cancelled order does NOT grant VIP spend
    const coCancelled = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_vip_10k', quantity: 1 }],
      idempotencyKey: 'p15d_co_cancel',
    });
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${coCancelled.data.orderRef}/verify`, 'token-admin', {
        action: 'cancel',
        note: 'Cancelled before payment',
      })).status,
      200
    );
    w = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(w.data.vip.verifiedSpendTotal, 0);

    // 2) Manual confirm_paid credits NET payable (6000 - 500 = 5500) -> promotes to Silver (5,000+)
    const conf1 = await api('POST', `/api/shop/admin/orders/${coPending.data.orderRef}/verify`, 'token-admin', {
      action: 'confirm_paid',
      note: 'Cash on delivery verified',
    });
    assert.equal(conf1.status, 200);
    assert.equal(conf1.data.vipTier, 'silver');

    w = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(w.data.vip.tier, 'silver');
    assert.equal(w.data.vip.verifiedSpendTotal, 5500);
    assert.equal(w.data.vip.multiplierPercent, 5);

    // 3) Second verified order (10,000) -> 15,500 total -> Gold (15,000+, +10% multiplier)
    const co2 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_vip_10k', quantity: 1 }],
      idempotencyKey: 'p15d_co_2',
    });
    const conf2 = await api('POST', `/api/shop/admin/orders/${co2.data.orderRef}/verify`, 'token-admin', {
      action: 'confirm_paid',
      note: 'Bank IBFT settled',
    });
    assert.equal(conf2.status, 200);
    assert.equal(conf2.data.vipTier, 'gold');

    // Verify Gold +10% bonus applies strictly on Daily Check-In & Game Wins (puzzle base 40 -> 44), capped by maxBonusCoinsPerAction
    simulatedNow = new Date('2026-11-15T12:00:00.000Z');
    const goldCheckin = await api('POST', '/api/shop/checkin', 'token-alice', {});
    assert.equal(goldCheckin.status, 200);
    assert.ok(goldCheckin.data.vipBonusCoins > 0);
    assert.equal(goldCheckin.data.vipTier, 'gold');

    const puzStart = await api('POST', '/api/shop/games/puzzle-start', 'token-alice', {});
    const puzWin = await api('POST', '/api/shop/game/reward', 'token-alice', {
      gameType: 'puzzle',
      sessionId: puzStart.data.sessionId,
      moves: bfsSolvePuzzle(puzStart.data.board),
    });
    assert.equal(puzWin.status, 200);
    assert.equal(puzWin.data.vipBonusCoins, 4);
    assert.equal(puzWin.data.added, 44);

    // VIP multiplier does NOT apply to Achievements (first_checkin = exact 25 coins)
    const achFirst = await api('POST', '/api/shop/achievements/claim', 'token-alice', {
      achievementId: 'first_checkin',
    });
    assert.equal(achFirst.status, 200);
    assert.equal(achFirst.data.added, 25);

    // 4) Refund with downgradePolicy='never' (default) preserves Gold tier while deducting verifiedSpendTotal
    const refund1 = await api('POST', `/api/shop/admin/orders/${coPending.data.orderRef}/verify`, 'token-admin', {
      action: 'refund',
      note: 'Returned watch',
    });
    assert.equal(refund1.status, 200);
    assert.equal(refund1.data.vipTier, 'gold');

    // Switch downgradePolicy='recalculate_on_refund' and refund second order -> drops back to Bronze
    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      vipConfig: { downgradePolicy: 'recalculate_on_refund' },
    });
    const refund2 = await api('POST', `/api/shop/admin/orders/${co2.data.orderRef}/verify`, 'token-admin', {
      action: 'refund',
      note: 'Full refund',
    });
    assert.equal(refund2.status, 200);
    assert.equal(refund2.data.vipTier, 'bronze');
    w = await api('GET', '/api/shop/wallet', 'token-alice');
    assert.equal(w.data.vip.verifiedSpendTotal, 0);
    assert.equal(w.data.vip.tier, 'bronze');
  });

  it('20. Stage 15D Achievements + Admin Manual Wallet Adjust & VIP Override with Audit Logs', async () => {
    // Premature claims rejected (400)
    assert.equal(
      (await api('POST', '/api/shop/achievements/claim', 'token-alice', { achievementId: 'first_checkin' })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/achievements/claim', 'token-alice', { achievementId: 'warrior_7d' })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/achievements/claim', 'token-alice', { achievementId: 'silver_member' })).status,
      400
    );

    // Complete 1 check-in -> unlocks first_checkin (25 Coins), duplicate claim rejected (409)
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    const claim1 = await api('POST', '/api/shop/achievements/claim', 'token-alice', {
      achievementId: 'first_checkin',
    });
    assert.equal(claim1.status, 200);
    assert.equal(claim1.data.added, 25);
    assert.equal(
      (await api('POST', '/api/shop/achievements/claim', 'token-alice', { achievementId: 'first_checkin' })).status,
      409
    );

    // Admin wallet adjustment auth & validation guards
    assert.equal(
      (await api('POST', '/api/shop/admin/wallet/adjust', 'token-alice', {
        targetUid: 'alice_uid_123',
        amount: 100,
        reason: 'Self grant attempt',
      })).status,
      403
    );
    assert.equal(
      (await api('POST', '/api/shop/admin/wallet/adjust', 'token-admin', {
        targetUid: 'alice_uid_123',
        amount: 100,
        reason: 'x',
      })).status,
      400
    );
    assert.equal(
      (await api('POST', '/api/shop/admin/wallet/adjust', 'token-admin', {
        targetUid: 'alice_uid_123',
        amount: -9999,
        reason: 'Overdraw attempt',
      })).status,
      400
    );

    const adjPlus = await api('POST', '/api/shop/admin/wallet/adjust', 'token-admin', {
      targetUid: 'alice_uid_123',
      amount: 120,
      reason: 'VIP support goodwill credit',
    });
    assert.equal(adjPlus.status, 200);
    assert.equal(adjPlus.data.balance, claim1.data.balance + 120);

    const adjMinus = await api('POST', '/api/shop/admin/wallet/adjust', 'token-admin', {
      targetUid: 'alice_uid_123',
      amount: -20,
      reason: 'Correction for duplicate manual promo',
    });
    assert.equal(adjMinus.status, 200);
    assert.equal(adjMinus.data.balance, claim1.data.balance + 100);

    // Admin VIP tier override auth & validation + audit + reset to 'auto'
    assert.equal(
      (await api('POST', '/api/shop/admin/vip/override', 'token-alice', {
        targetUid: 'alice_uid_123',
        tier: 'diamond',
        reason: 'Self promote attempt',
      })).status,
      403
    );
    assert.equal(
      (await api('POST', '/api/shop/admin/vip/override', 'token-admin', {
        targetUid: 'alice_uid_123',
        tier: 'platinum',
        reason: 'no',
      })).status,
      400
    );

    const ovSet = await api('POST', '/api/shop/admin/vip/override', 'token-admin', {
      targetUid: 'alice_uid_123',
      tier: 'platinum',
      reason: 'Official KING VIP partner',
    });
    assert.equal(ovSet.status, 200);
    assert.equal(ovSet.data.vip.tier, 'platinum');
    assert.equal(ovSet.data.vip.manualOverrideTier, 'platinum');

    // Override unlocks silver_member + gold_king achievements
    const achGold = await api('POST', '/api/shop/achievements/claim', 'token-alice', {
      achievementId: 'gold_king',
    });
    assert.equal(achGold.status, 200);
    assert.equal(achGold.data.added, 125);

    // Reset VIP override back to 'auto'
    const ovAuto = await api('POST', '/api/shop/admin/vip/override', 'token-admin', {
      targetUid: 'alice_uid_123',
      tier: 'auto',
      reason: 'Reverting temporary promo tier',
    });
    assert.equal(ovAuto.status, 200);
    assert.equal(ovAuto.data.vip.tier, 'bronze');
    assert.equal(ovAuto.data.vip.manualOverrideTier, '');

    // Audit logs contain wallet_adjust and vip_override entries
    const adminOv = await api('GET', '/api/shop/admin/overview', 'token-admin');
    assert.equal(adminOv.status, 200);
    assert.ok(adminOv.data.auditLogs.some((l: any) => l.action === 'wallet_adjust'));
    assert.ok(adminOv.data.auditLogs.some((l: any) => l.action === 'vip_override'));
  });

  it('21. Stage 15E Multi-Mode Leaderboards (Weekly, Daily, VIP) & Privacy Opt-Out Toggle', async () => {
    await memDb.collection('publicProfiles').doc('alice_uid_123').set({ username: 'AliceRoyale' });
    await memDb.collection('publicProfiles').doc('bob_uid_456').set({ username: 'BobEmpire' });
    await memDb.collection('catalog_products').doc('prod_lb_gold').set({
      name: 'KING Crown Watch',
      category: 'Watches',
      originalPrice: 16000,
      stock: 5,
      isActive: true,
    });

    // Invalid mode returns 400
    assert.equal((await api('GET', '/api/shop/leaderboard?type=yearly')).status, 400);

    // Alice earns more dailyCoins than Bob on Day 1
    assert.equal((await api('POST', '/api/shop/checkin', 'token-alice', {})).status, 200);
    assert.equal((await api('POST', '/api/shop/game/reward', 'token-alice', { gameType: 'spin' })).status, 200);
    assert.equal((await api('POST', '/api/shop/checkin', 'token-bob', {})).status, 200);

    const lbDaily = await api('GET', '/api/shop/leaderboard?type=daily');
    assert.equal(lbDaily.status, 200);
    assert.equal(lbDaily.data.type, 'daily');
    assert.equal(lbDaily.data.leaderboard.length, 2);
    assert.ok(lbDaily.data.leaderboard[0].dailyCoins >= lbDaily.data.leaderboard[1].dailyCoins);
    assert.equal(lbDaily.data.leaderboard[0].nickname.startsWith('Ali***'), true);

    // Next day daily leaderboard resets cleanly while weekly persists within same ISO week
    simulatedNow = new Date('2026-11-28T12:00:00.000Z');
    const lbDailyNext = await api('GET', '/api/shop/leaderboard?type=daily');
    assert.equal(lbDailyNext.status, 200);
    assert.equal(lbDailyNext.data.leaderboard.length, 0);
    const lbWeeklyStill = await api('GET', '/api/shop/leaderboard?type=weekly');
    assert.equal(lbWeeklyStill.data.leaderboard.length, 2);

    // Promote Alice to Gold via manually verified paid order & Bob to Silver via override
    const co = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_lb_gold', quantity: 1 }],
      idempotencyKey: 'p15e_vip_lb',
    });
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${co.data.orderRef}/verify`, 'token-admin', {
        action: 'confirm_paid',
        note: 'Verified luxury order',
      })).status,
      200
    );
    await api('POST', '/api/shop/admin/vip/override', 'token-admin', {
      targetUid: 'bob_uid_456',
      tier: 'silver',
      reason: 'VIP test rank check',
    });

    const lbVip = await api('GET', '/api/shop/leaderboard?type=vip');
    assert.equal(lbVip.status, 200);
    assert.equal(lbVip.data.type, 'vip');
    assert.equal(lbVip.data.leaderboard.length, 2);
    assert.equal(lbVip.data.leaderboard[0].vipTier, 'gold');
    assert.equal(lbVip.data.leaderboard[1].vipTier, 'silver');
    const serializedVip = JSON.stringify(lbVip.data);
    assert.equal(serializedVip.includes('verifiedSpendTotal'), false);
    assert.equal(serializedVip.includes('alice_uid_123'), false);
    assert.equal(serializedVip.includes('balance'), false);

    // Alice opts out -> immediately excluded from Weekly, Daily, and VIP leaderboards
    const privOn = await api('POST', '/api/shop/leaderboard/privacy', 'token-alice', { optOut: true });
    assert.equal(privOn.status, 200);
    assert.equal(privOn.data.leaderboardOptOut, true);

    const lbWeeklyPriv = await api('GET', '/api/shop/leaderboard?type=weekly');
    assert.equal(lbWeeklyPriv.data.leaderboard.length, 1);
    assert.equal(lbWeeklyPriv.data.leaderboard[0].nickname.startsWith('Bob***'), true);

    const lbVipPriv = await api('GET', '/api/shop/leaderboard?type=vip');
    assert.equal(lbVipPriv.data.leaderboard.length, 1);
    assert.equal(lbVipPriv.data.leaderboard[0].vipTier, 'silver');

    // Alice opts back in -> visible again on VIP & Weekly
    await api('POST', '/api/shop/leaderboard/privacy', 'token-alice', { optOut: false });
    const lbVipBack = await api('GET', '/api/shop/leaderboard?type=vip');
    assert.equal(lbVipBack.data.leaderboard.length, 2);
  });

  it('22. Stage 16 Hardening: Streak missedDayResetPolicy normalization & Achievement Cap Anti-Truncation Protection', async () => {
    // 1) Admin settings accepts both 'reset_to_1' and 'reset_to_day_1' and updates streak policy
    const sUpdate = await api('POST', '/api/shop/admin/settings', 'token-admin', {
      streakConfig: { missedDayResetPolicy: 'reset_to_1' },
    });
    assert.equal(sUpdate.status, 200);
    assert.equal(sUpdate.data.settings.streakConfig.missedDayResetPolicy, 'reset_to_day_1');

    // 2) Achievement Anti-Truncation Guard:
    // If daily achievement cap remaining < achievement reward, reject with 429 rather than permanently burning reward
    // Allow Bob enough quiz plays to unlock quiz_master (10 wins) and set achievement cap to 30 coins (lower than quiz_master's 50 coins)
    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      games: {
        quiz: { maxDailyPlays: 15 },
      },
      economyConfig: {
        globalDailyEarnCap: 700,
        sourceDailyCaps: {
          checkin: 150,
          game: 400,
          mission: 200,
          achievement: 30, // low cap
        },
      },
    });

    // Bob triggers quiz_master eligibility (10 quiz wins)
    for (let i = 0; i < 10; i++) {
      const qStart = await api('GET', '/api/shop/games/quiz-question', 'token-bob');
      const challengeId = qStart.data.challengeId;
      const sDoc = await memDb.collection('king_shop_game_sessions').doc(challengeId).get();
      assert.equal(
        (await api('POST', '/api/shop/game/reward', 'token-bob', {
          gameType: 'quiz',
          challengeId,
          selectedOption: sDoc.data().correctIndex,
        })).status,
        200
      );
    }

    // quiz_master awards 50 Coins, but remaining achievement cap is only 30 Coins!
    // Must reject with 429 to protect customer against partial truncation
    const achTruncGuard = await api('POST', '/api/shop/achievements/claim', 'token-bob', {
      achievementId: 'quiz_master',
    });
    assert.equal(achTruncGuard.status, 429);
    assert.ok(achTruncGuard.data.error.message.includes('cap'));

    // Verify achievement is NOT marked claimed in DB
    const achDocPre = await memDb.collection('king_shop_achievements').doc('bob_uid_456_quiz_master').get();
    assert.equal(achDocPre.exists, false);

    // Next day (midnight rollover) with standard achievement cap allows full 50 Coins claim
    simulatedNow = new Date('2026-11-29T12:00:00.000Z');
    await api('POST', '/api/shop/admin/settings', 'token-admin', {
      economyConfig: {
        sourceDailyCaps: { achievement: 500 },
      },
    });
    const achFull = await api('POST', '/api/shop/achievements/claim', 'token-bob', {
      achievementId: 'quiz_master',
    });
    assert.equal(achFull.status, 200);
    assert.equal(achFull.data.added, 60);
  });

  it('23. Stage 16 Hardening: VIP countedOrderRefs cleanup, double refund protection & deterministic leaderboard ties', async () => {
    await memDb.collection('catalog_products').doc('prod_perfume').set({
      name: 'KING Royal Oud',
      category: 'Fragrance',
      originalPrice: 8000,
      stock: 5,
      isActive: true,
    });

    // Order 1: Create, verify confirm_paid -> orderRef added to countedOrderRefs
    const co1 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_perfume', quantity: 1 }],
      idempotencyKey: 'p16_co_1',
    });
    assert.equal(co1.status, 200);
    const ref1 = co1.data.orderRef;

    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-admin', {
        action: 'confirm_paid',
        note: 'Order 1 verified',
      })).status,
      200
    );

    let vipSnap = await memDb.collection('king_shop_vip_profiles').doc('alice_uid_123').get();
    assert.ok(vipSnap.data().countedOrderRefs.includes(ref1));

    // Full refund order 1 -> orderRef cleanly removed from countedOrderRefs
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-admin', {
        action: 'refund',
        note: 'Customer returned Royal Oud',
      })).status,
      200
    );

    vipSnap = await memDb.collection('king_shop_vip_profiles').doc('alice_uid_123').get();
    assert.equal(vipSnap.data().countedOrderRefs.includes(ref1), false);

    // Double refund on already refunded order is strictly rejected (409)
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-admin', {
        action: 'refund',
        note: 'Second refund attempt',
      })).status,
      409
    );

    // Confirming already refunded order is rejected (409)
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${ref1}/verify`, 'token-admin', {
        action: 'confirm_paid',
        note: 'Reconfirm attempt',
      })).status,
      409
    );

    // Cancel an order -> cleans up countedOrderRefs if present
    const co2 = await api('POST', '/api/shop/checkout/whatsapp', 'token-alice', {
      items: [{ productId: 'prod_perfume', quantity: 1 }],
      idempotencyKey: 'p16_co_2',
    });
    const ref2 = co2.data.orderRef;
    assert.equal(
      (await api('POST', `/api/shop/admin/orders/${ref2}/verify`, 'token-admin', {
        action: 'cancel',
        note: 'Customer cancelled before payment',
      })).status,
      200
    );

    vipSnap = await memDb.collection('king_shop_vip_profiles').doc('alice_uid_123').get();
    assert.equal(vipSnap.data().countedOrderRefs.includes(ref2), false);

    // Deterministic tie-breaking on leaderboards:
    // If two users have identical daily scores, order is deterministic
    const lbDaily = await api('GET', '/api/shop/leaderboard?type=daily');
    assert.equal(lbDaily.status, 200);
    if (lbDaily.data.leaderboard.length >= 2) {
      const u1 = lbDaily.data.leaderboard[0];
      const u2 = lbDaily.data.leaderboard[1];
      if (u1.coins === u2.coins) {
        assert.ok(u1.rank === 1 && u2.rank === 2);
      }
    }
  });
});






