FROM node:22-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
# Install full dependency tree (includes dev deps needed for build tools like Tailwind/PostCSS)
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps

FROM node:22-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app
# Only NEXT_PUBLIC_ vars need real values at build time (inlined into client JS).
# Server-only secrets use placeholders during build and are injected at runtime via env_file.
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ARG NEXT_PUBLIC_VAPID_PUBLIC_KEY
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
ENV NEXT_PUBLIC_VAPID_PUBLIC_KEY=${NEXT_PUBLIC_VAPID_PUBLIC_KEY}
# Placeholder values so next build doesn't fail when server code references these
ENV DATABASE_URL=postgres://build:build@localhost:5432/build
ENV SESSION_SECRET=build-placeholder-secret-not-used-at-runtime-32chars
ENV SERVICES_SECRET_KEY=build-placeholder
ENV VAPID_PUBLIC_KEY=build-placeholder
ENV VAPID_PRIVATE_KEY=build-placeholder
ENV VAPID_EMAIL=build@placeholder.local
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure public directory exists even if repo has no assets yet
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/root/.npm --mount=type=cache,target=/app/.next/cache npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3010
ENV HOSTNAME=0.0.0.0
ENV NEXT_TELEMETRY_DISABLED=1
# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nextjs -u 1001
# standalone output
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=build --chown=nextjs:nodejs /app/public ./public
USER nextjs
EXPOSE 3010
CMD ["node", "server.js"]
