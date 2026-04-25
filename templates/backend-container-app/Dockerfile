# ─── Stage 1: build ──────────────────────────────────────────────────────────
FROM node:24-slim AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

# Copy manifests first (layer-cache friendly)
COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile

# Copy source and build
COPY tsconfig.json tsconfig.base.json ./
COPY src/ ./src/

RUN pnpm build

# ─── Stage 2: prune dev deps ─────────────────────────────────────────────────
FROM node:24-slim AS deps

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@latest --activate

COPY package.json pnpm-lock.yaml ./

RUN pnpm install --frozen-lockfile --prod

# ─── Stage 3: runtime ────────────────────────────────────────────────────────
FROM node:24-slim AS runtime

# Non-root user
RUN groupadd --gid 1001 appgroup && \
    useradd --uid 1001 --gid appgroup --shell /bin/sh --create-home appuser

WORKDIR /app

# Copy production node_modules and compiled output
COPY --from=deps   --chown=appuser:appgroup /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appgroup /app/dist ./dist
COPY --chown=appuser:appgroup package.json ./

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/health', r => process.exit(r.statusCode === 200 ? 0 : 1)).on('error', () => process.exit(1))"

CMD ["node", "dist/server.js"]
