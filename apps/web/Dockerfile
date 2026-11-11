# The Stillhouse — web (static SPA) production image: nginx serves the built site and proxies /api.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@stillhouse/web --include-workspace-root=false
COPY apps/web ./apps/web
RUN npm run build --workspace=@stillhouse/web

FROM nginx:1.29-alpine AS runtime
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || exit 1
