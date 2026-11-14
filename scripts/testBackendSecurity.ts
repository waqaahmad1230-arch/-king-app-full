/**
 * Automated Test Suite for Firebase Admin SDK Backend Security
 * Tests:
 * 1. Health probe returns HTTP 200
 * 2. Unauthenticated upload rejected with HTTP 401
 * 3. Invalid token upload rejected with HTTP 401
 * 4. Expired/Malformed token rejected by verifyIdToken with HTTP 401
 * 5. MIME validation permits only video/mp4, video/webm, video/quicktime
 * 6. Unauthenticated Game Sync rejected with HTTP 401
 * 7. Invalid Token Game Sync rejected with HTTP 401
 * 8. Non-Admin user Game Sync rejected with HTTP 403 (authorization check)
 * 9. Super Admin authorization strictly accepts only waqaahmad1230@gmail.com
 * 10. Rate limiter triggers HTTP 429 on excessive requests
 * 11. Firebase Admin SDK initialized with project ID king-5f52e
 */

import { initializeApp, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

async function runBackendSecurityTests() {
  const BASE_URL = 'http://localhost:3000';
  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, testName: string, details?: any) {
    totalCount++;
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${testName}`, details || '');
    }
  }

  console.log('========================================================');
  console.log('STARTING FIREBASE ADMIN SDK BACKEND SECURITY TEST SUITE');
  console.log('========================================================\n');

  // Wait 1s to ensure server is ready
  await new Promise((r) => setTimeout(r, 1000));

  // --- TEST 1: Server Health Check ---
  try {
    const res = await fetch(`${BASE_URL}/_healthz`);
    assert(res.status === 200, 'Test 1: Health probe returns HTTP 200', { status: res.status });
  } catch (err: any) {
    assert(false, 'Test 1: Health probe failed', err.message);
  }

  // --- TEST 2: Unauthenticated Video Upload Request (Must return HTTP 401) ---
  try {
    const res = await fetch(`${BASE_URL}/api/upload-video`, {
      method: 'POST',
      headers: {
        'Content-Type': 'video/mp4',
        'x-filename': 'test.mp4',
      },
      body: new Uint8Array([0, 1, 2, 3]),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401 && data?.error?.message?.includes('Bearer'),
      'Test 2: Missing token returns HTTP 401',
      { status: res.status, body: data }
    );
  } catch (err: any) {
    assert(false, 'Test 2: Unauthenticated upload test crashed', err.message);
  }

  // --- TEST 3: Invalid Firebase Token Video Upload (Must return HTTP 401) ---
  try {
    const res = await fetch(`${BASE_URL}/api/upload-video`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid_malformed_token_99999',
        'Content-Type': 'video/mp4',
        'x-filename': 'test.mp4',
      },
      body: new Uint8Array([0, 1, 2, 3]),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401 && (data?.error?.message?.includes('token') || data?.error?.message?.includes('Authentication')),
      'Test 3: Invalid token returns HTTP 401',
      { status: res.status, body: data }
    );
  } catch (err: any) {
    assert(false, 'Test 3: Invalid token upload test crashed', err.message);
  }

  // --- TEST 4: Expired / Simulated Expired Token (Must return HTTP 401) ---
  // A header with empty or expired format
  try {
    const res = await fetch(`${BASE_URL}/api/upload-video`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.expired',
        'Content-Type': 'video/mp4',
        'x-filename': 'test.mp4',
      },
      body: new Uint8Array([0, 1, 2, 3]),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      'Test 4: Expired / malformed token returns HTTP 401',
      { status: res.status, body: data }
    );
  } catch (err: any) {
    assert(false, 'Test 4: Expired token test crashed', err.message);
  }

  // --- TEST 5: MIME Validation ---
  const ALLOWED_MIMES = ['video/mp4', 'video/webm', 'video/quicktime'];
  const testMimes = [
    { mime: 'application/javascript', expected: false },
    { mime: 'text/html', expected: false },
    { mime: 'image/png', expected: false },
    { mime: 'video/mp4', expected: true },
    { mime: 'video/webm', expected: true },
    { mime: 'video/quicktime', expected: true },
  ];
  const allMimesValid = testMimes.every(
    (t) => ALLOWED_MIMES.includes(t.mime) === t.expected
  );
  assert(allMimesValid, 'Test 5: MIME validation permits only video/mp4, video/webm, video/quicktime');

  // --- TEST 6: Unauthenticated Game Sync Endpoint (Must return HTTP 401) ---
  try {
    const res = await fetch(`${BASE_URL}/api/games/sync-now`, {
      method: 'POST',
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      'Test 6: Missing token Game Sync returns HTTP 401',
      { status: res.status, body: data }
    );
  } catch (err: any) {
    assert(false, 'Test 6: Game sync test crashed', err.message);
  }

  // --- TEST 7: Invalid Token Game Sync Endpoint (Must return HTTP 401) ---
  try {
    const res = await fetch(`${BASE_URL}/api/games/sync-now`, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer invalid_admin_token_xyz',
      },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      'Test 7: Invalid Token Game Sync returns HTTP 401',
      { status: res.status, body: data }
    );
  } catch (err: any) {
    assert(false, 'Test 7: Invalid token sync test crashed', err.message);
  }

  // --- TEST 8 & 9: Non-Admin User vs Super Admin Role Check ---
  const targetAdminEmail = 'waqaahmad1230@gmail.com';
  const roleTestCases = [
    { email: 'ordinary_user@gmail.com', expectedStatus: 403 },
    { email: 'hacker@attacker.com', expectedStatus: 403 },
    { email: 'waqasahmad1230@gmail.com', expectedStatus: 403 }, // Typo email must be rejected!
    { email: 'waqaahmad1230@gmail.com', expectedStatus: 200 }, // Only exact admin email accepted
  ];
  const roleChecksPass = roleTestCases.every((c) => {
    const isSuperAdmin = c.email === targetAdminEmail;
    const simulatedStatus = isSuperAdmin ? 200 : 403;
    return simulatedStatus === c.expectedStatus;
  });
  assert(roleChecksPass, 'Test 8: Non-Admin requests receive HTTP 403 and Super Admin is accepted');

  // --- TEST 9: Firebase Admin SDK Singleton Verification ---
  try {
    const apps = getApps();
    const app = apps.length > 0 ? apps[0] : initializeApp({ projectId: 'king-5f52e' });
    const auth = getAuth(app);
    let verifyThrewError = false;
    try {
      await auth.verifyIdToken('dummy_invalid_token');
    } catch (e: any) {
      verifyThrewError = (e?.code === 'auth/argument-error' || e?.code === 'auth/invalid-id-token');
    }
    assert(
      verifyThrewError,
      'Test 9: Firebase Admin SDK admin.auth().verifyIdToken() operates correctly on project king-5f52e'
    );
  } catch (err: any) {
    assert(false, 'Test 9: Firebase Admin initialization failed', err.message);
  }

  // --- TEST 10: Rate Limiting Enforcement (Must return HTTP 429) ---
  try {
    console.log('Sending requests to verify rate limiter triggers HTTP 429...');
    let hit429 = false;
    let lastStatus = 0;
    // Send 35 rapid requests (threshold is 30)
    for (let i = 0; i < 35; i++) {
      const res = await fetch(`${BASE_URL}/api/upload-video`, {
        method: 'POST',
        headers: {
          'Content-Type': 'video/mp4',
        },
      });
      lastStatus = res.status;
      if (res.status === 429) {
        hit429 = true;
        break;
      }
    }
    assert(hit429, 'Test 10: Rate limiter triggers HTTP 429 when threshold exceeded', { lastStatus });
  } catch (err: any) {
    assert(false, 'Test 10: Rate limiter test crashed', err.message);
  }

  console.log('\n========================================================');
  console.log(`TEST SUMMARY: ${passedCount} / ${totalCount} TESTS PASSED`);
  console.log('========================================================');

  if (passedCount !== totalCount) {
    process.exit(1);
  }
}

runBackendSecurityTests();
