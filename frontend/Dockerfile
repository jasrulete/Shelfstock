# ---- deps: install ALL dependencies (next build needs dev deps) ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: next build with output "standalone" (see next.config.js) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time, so
# they must arrive as build args - runtime env vars are too late.
#
# There is deliberately no NEXT_PUBLIC_API_URL any more: the API is served from
# this same deployment, so the browser calls /api relatively. Baking an absolute
# backend host into the bundle is exactly what left the storefront pointing at a
# server that had gone away.
ARG NEXT_PUBLIC_EXCHANGE_RATE_API=https://api.frankfurter.app/latest?from=USD
ENV NEXT_PUBLIC_EXCHANGE_RATE_API=$NEXT_PUBLIC_EXCHANGE_RATE_API \
    NEXT_TELEMETRY_DISABLED=1
# No DATABASE_URL or JWT_SECRET here. The build imports the server modules to
# collect page data, but the pg Pool is now built on first use rather than on
# import (server/db/index.ts), so nothing needs a connection string until a
# request actually arrives.
RUN npm run build

# ---- migrate: one-shot migration runner, used by docker-compose ----
#
# The database is brought up to date by exactly one code path - `node-pg-migrate
# up` - in every environment. Postgres' docker-entrypoint-initdb.d would have
# been simpler, but it only runs on a brand-new volume and would apply the SQL
# without recording it in the migrations table, so the very next `migrate up`
# would try to replay everything against a database that already had it.
FROM node:22-alpine AS migrate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY migrations ./migrations
CMD ["npx", "node-pg-migrate", "up"]

# ---- runtime: standalone server only, run as non-root ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
USER node
EXPOSE 3000
CMD ["node", "server.js"]
