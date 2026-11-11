# The Stillhouse — API production image
# Multi-stage: install production deps only, then run as non-root.
FROM node:22-alpine AS deps
RUN npm install -g npm@11
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps apps
COPY packages packages
COPY prisma prisma
RUN npm ci --omit=dev -w @stillhouse/api -w @stillhouse/shared --include-workspace-root=false

FROM node:22-alpine AS runtime
# Drop the bundled npm/corepack/npx from the production image — the app runs via `node` directly.
# Eliminates the npm-internal CVE class and reduces image surface.
RUN rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack \
           /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack
ENV NODE_ENV=production \
    PORT=4000
WORKDIR /app
RUN addgroup -S app && adduser -S app -G app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
COPY prisma ./prisma
USER app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4000/api/v1/ready || exit 1
CMD ["node", "apps/api/src/server.js"]
