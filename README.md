# KING App — GitHub Sync Package (Vercel Cold-Start & Gemini Health Fix)

This archive contains the verified 13-file update for `waqaahmad1230-arch/king-app-full`.
No `.env` files, API keys, secrets, credentials, `node_modules`, or unrelated files are included.

## Included Files (13 Code/Config Files + README)

- `package.json` — sets Vercel-compatible `"engines": { "node": "22.x" }`
- `vercel.json` — adds `"buildCommand": "npm run build"` and `"includeFiles": "api/_lib/**"`
- `api/tsconfig.json` — `NodeNext` ESM TypeScript config for `api/**/*.ts`
- `scripts/build-vercel-api.mjs` — targets `node20` (compatible with Node 20 and Node 22 ESM)
- `server/aiBackend.ts` — CJS/ESM-safe default import for `cloudinary` (`cloudinaryPkg.v2`)
- `api/_lib/statusBackend.ts` — CJS/ESM-safe default import for `cloudinary` (`cloudinaryPkg.v2`)
- `server/aiVault.ts` — uses `os.tmpdir()` fallback when `VERCEL` is set and `AI_VAULT_DIR` is unset
- `api/_lib/vercelCore.mjs` — rebuilt serverless shared bundle matching the fixes above
- `api/admin/ai.ts` — forwards `projectId` in `POST /api/admin/ai/keys`
- `server.ts` — forwards `req.body.projectId` in Express `POST /api/admin/ai/keys`
- `src/services/postAiService.ts` — reports `healthy`, `zero_keys`, `server_error`, and `unavailable` distinctly
- `src/components/GeminiManagerModal.tsx` — renders distinct UI states for HTTP 500, backend unavailable, and 0 keys
- `src/components/PostAiWorkspaceModal.tsx` — propagates backend health/error state into notices and labels

## Safe GitHub Update Instructions

1. Clone or update your local checkout of the existing GitHub repository:
   ```bash
   git clone https://github.com/waqaahmad1230-arch/king-app-full.git
   cd king-app-full
   git checkout main
   git pull origin main
   ```

2. Unzip this package into a separate temporary folder first (so you can inspect differences before overwriting anything):
   ```bash
   mkdir -p ../king-sync-tmp
   unzip king-app-github-sync-fix.zip -d ../king-sync-tmp
   ```

3. Compare each file against your existing GitHub files before copying (especially `package.json`, `vercel.json`, `api/admin/ai.ts`, and `server.ts` if you made manual edits on GitHub):
   ```bash
   for f in package.json vercel.json api/tsconfig.json server/aiBackend.ts api/_lib/statusBackend.ts server/aiVault.ts scripts/build-vercel-api.mjs src/services/postAiService.ts src/components/GeminiManagerModal.tsx src/components/PostAiWorkspaceModal.tsx api/_lib/vercelCore.mjs api/admin/ai.ts server.ts; do
     echo "=== $f ==="
     diff -u "$f" "../king-sync-tmp/$f" || true
   done
   ```

4. Once verified, copy the files into your repository root (excluding `README.md` if you want to keep your repo's existing README):
   ```bash
   cp ../king-sync-tmp/package.json ./package.json
   cp ../king-sync-tmp/vercel.json ./vercel.json
   mkdir -p api/_lib api/admin server src/services src/components scripts
   cp ../king-sync-tmp/api/tsconfig.json ./api/tsconfig.json
   cp ../king-sync-tmp/scripts/build-vercel-api.mjs ./scripts/build-vercel-api.mjs
   cp ../king-sync-tmp/server/aiBackend.ts ./server/aiBackend.ts
   cp ../king-sync-tmp/api/_lib/statusBackend.ts ./api/_lib/statusBackend.ts
   cp ../king-sync-tmp/server/aiVault.ts ./server/aiVault.ts
   cp ../king-sync-tmp/api/_lib/vercelCore.mjs ./api/_lib/vercelCore.mjs
   cp ../king-sync-tmp/api/admin/ai.ts ./api/admin/ai.ts
   cp ../king-sync-tmp/server.ts ./server.ts
   cp ../king-sync-tmp/src/services/postAiService.ts ./src/services/postAiService.ts
   cp ../king-sync-tmp/src/components/GeminiManagerModal.tsx ./src/components/GeminiManagerModal.tsx
   cp ../king-sync-tmp/src/components/PostAiWorkspaceModal.tsx ./src/components/PostAiWorkspaceModal.tsx
   ```

5. Install dependencies, verify TypeScript & production build, and inspect `git diff`:
   ```bash
   npm install
   npx tsc --noEmit
   npx tsc -p api/tsconfig.json --noEmit
   npm run build
   git status
   git diff
   ```

6. Commit and push to trigger Vercel deployment:
   ```bash
   git add package.json vercel.json api/tsconfig.json scripts/build-vercel-api.mjs \
     server/aiBackend.ts api/_lib/statusBackend.ts server/aiVault.ts \
     api/_lib/vercelCore.mjs api/admin/ai.ts server.ts \
     src/services/postAiService.ts src/components/GeminiManagerModal.tsx \
     src/components/PostAiWorkspaceModal.tsx
   git commit -m "Fix Vercel serverless cold-start crash and Gemini health state reporting"
   git push origin main
   ```

7. Ensure required Vercel Environment Variables are configured in Vercel Project Settings (do not commit secrets to Git):
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `AI_VAULT_SECRET`
   - (Optional fallback keys: `GEMINI_API_KEY` or `GEMINI_API_KEY_1`..`GEMINI_API_KEY_8`)

8. Verify live endpoints after Vercel finishes building:
   - `curl -i https://king-app-full.vercel.app/api/ai/status` (expected `HTTP 200` JSON)
   - `curl -i https://king-app-full.vercel.app/api/admin/ai/state` (expected `HTTP 401` JSON without Bearer token)
