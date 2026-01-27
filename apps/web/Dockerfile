FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json* ./
# Install full dependency tree (includes dev deps needed for build tools like Tailwind/PostCSS)
RUN --mount=type=cache,target=/root/.npm npm install --legacy-peer-deps

FROM node:20-alpine AS build
RUN apk add --no-cache libc6-compat
WORKDIR /app
ARG DATABASE_URL
ARG SESSION_SECRET
ARG SERVICES_SECRET_KEY
ARG VAPID_PUBLIC_KEY
ARG VAPID_PRIVATE_KEY
ARG VAPID_EMAIL
ARG NEXT_PUBLIC_TURNSTILE_SITE_KEY
ENV DATABASE_URL=${DATABASE_URL}
ENV SESSION_SECRET=${SESSION_SECRET}
ENV SERVICES_SECRET_KEY=${SERVICES_SECRET_KEY}
ENV VAPID_PUBLIC_KEY=${VAPID_PUBLIC_KEY}
ENV VAPID_PRIVATE_KEY=${VAPID_PRIVATE_KEY}
ENV VAPID_EMAIL=${VAPID_EMAIL}
ENV NEXT_PUBLIC_TURNSTILE_SITE_KEY=${NEXT_PUBLIC_TURNSTILE_SITE_KEY}
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure public directory exists even if repo has no assets yet
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
RUN --mount=type=cache,target=/root/.npm --mount=type=cache,target=/app/.next/cache npm run build

FROM node:20-alpine AS run
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
