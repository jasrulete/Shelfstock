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
# NEXT_PUBLIC_* values are inlined into the browser bundle at BUILD time,
# so they must arrive as build args (runtime env vars are too late).
# The API URL is what the user's browser calls, hence localhost - not the
# compose service name.
ARG NEXT_PUBLIC_API_URL=http://localhost:4000
ARG NEXT_PUBLIC_EXCHANGE_RATE_API=https://api.frankfurter.app/latest?from=USD
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_EXCHANGE_RATE_API=$NEXT_PUBLIC_EXCHANGE_RATE_API \
    NEXT_TELEMETRY_DISABLED=1
RUN npm run build

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
