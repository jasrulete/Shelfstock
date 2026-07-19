# ---- deps: install ALL dependencies (tsc lives in devDependencies) ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# ---- build: compile TypeScript to dist/ ----
FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- runtime: production deps + compiled JS only, run as non-root ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# create-admin.js is kept so admins can be bootstrapped via
# `docker compose exec api node scripts/create-admin.js <email>`
COPY scripts ./scripts
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
