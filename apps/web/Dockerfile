FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
COPY apps/web/package.json ./apps/web/package.json
COPY apps/bot/package.json ./apps/bot/package.json
# Install full dependency tree (includes dev deps needed for build tools like Tailwind/PostCSS)
RUN --mount=type=cache,target=/root/.npm npm ci --legacy-peer-deps

FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Only NEXT_PUBLIC_ vars need real values at build time (inlined into client JS).
# Server-only secrets use placeholders during build and are injected at runtime via env_file.
ARG BUILD_PUBLIC_TURNSTILE
ARG BUILD_PUBLIC_VAPID
ARG BUILD_PUBLIC_TELEGRAM_USERNAME
COPY --from=deps /app ./
COPY . .
# Ensure public directory exists even if repo has no assets yet
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/root/.npm --mount=type=cache,target=/app/.next/cache \
    NEXT_PUBLIC_TURNSTILE_SITE_KEY="$BUILD_PUBLIC_TURNSTILE" \
    NEXT_PUBLIC_VAPID_PUBLIC_KEY="$BUILD_PUBLIC_VAPID" \
    NEXT_PUBLIC_TELEGRAM_BOT_USERNAME="$BUILD_PUBLIC_TELEGRAM_USERNAME" \
    DATABASE_URL="postgres://build:build@localhost:5432/build" \
    SESSION_SECRET="build-placeholder-secret-not-used-at-runtime-32chars" \
    SERVICES_SECRET_KEY="build-placeholder" \
    VAPID_PUBLIC_KEY="build-placeholder" \
    VAPID_PRIVATE_KEY="build-placeholder" \
    VAPID_EMAIL="build@placeholder.local" \
    npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# Version metadata baked at build time; override via --build-arg in CI
ARG APP_VERSION=local
ARG BUILD_SOURCE=local
ENV APP_VERSION=${APP_VERSION}
ENV BUILD_SOURCE=${BUILD_SOURCE}
# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001
# standalone output
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3010
CMD ["node", "apps/web/server.js"]
