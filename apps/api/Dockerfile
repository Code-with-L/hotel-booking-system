# The Stillhouse — API production image
# Multi-stage: install production deps only, then run as non-root.
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps apps
COPY packages packages
COPY prisma prisma
RUN npm ci --omit=dev -w @stillhouse/api -w @stillhouse/shared --include-workspace-root=false

FROM node:22-alpine AS runtime
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
