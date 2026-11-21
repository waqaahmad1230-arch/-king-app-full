# Production container for KING APP (Vite frontend dist + Node.js Express server.ts)
FROM node:22-alpine AS base

WORKDIR /app

# Install all dependencies (including Vite/Tailwind build tooling) cleanly from lockfile
COPY package.json bun.lock* package-lock.json* ./
RUN npm install --no-audit --no-fund

# Copy application source
COPY index.html tsconfig.json vite.config.ts firebase-applet-config.json metadata.json ./
COPY public ./public
COPY src ./src
COPY server ./server
COPY api ./api
COPY server.ts ./

# Build production frontend bundle into /app/dist
ENV NODE_ENV=production
RUN npm run build

# Remove build-only devDependencies so container stays minimal (vite is lazily imported only in dev)
RUN npm prune --omit=dev

# Ensure persistent vault mount point exists with safe ownership
RUN mkdir -p /mnt/ai-vault && chown -R node:node /app /mnt/ai-vault

USER node

ENV PORT=8080
ENV AI_VAULT_DIR=/mnt/ai-vault
EXPOSE 8080

CMD ["node", "server.ts"]
