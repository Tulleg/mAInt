# -------------------------------------------------------------
# 1. Base Image
# -------------------------------------------------------------
FROM node:22-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat

# -------------------------------------------------------------
# 2. Dependencies
# -------------------------------------------------------------
FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

# -------------------------------------------------------------
# 3. Builder
# -------------------------------------------------------------
FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js telemetry disable
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Fallback build-time env vars (ensures pages prerender with fallback mock data)
ENV DATABASE_URL="postgresql://postgres:postgrespassword@localhost:5432/maintai"
ENV REDIS_URL="redis://localhost:6379"

RUN npm run build

# -------------------------------------------------------------
# 4. Production Runner
# -------------------------------------------------------------
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy static assets & Next.js standalone server
COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

# Copy migration files & runtime migration dependencies
COPY --from=builder /app/src/db/migrations ./src/db/migrations
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/node_modules/drizzle-orm ./node_modules/drizzle-orm

# Copy entrypoint script
COPY --from=builder /app/docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x ./docker-entrypoint.sh

USER nextjs

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "server.js"]
