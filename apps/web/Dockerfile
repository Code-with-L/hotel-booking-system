# The Stillhouse — web (static SPA) production image: nginx serves the built site and proxies /api.
FROM node:22-alpine AS build
RUN npm install -g npm@11
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace=@stillhouse/web --include-workspace-root=false
COPY apps/web ./apps/web
RUN npm run build --workspace=@stillhouse/web

FROM nginx:1.29-alpine AS runtime
ARG NGINX_CONF=nginx.conf
# Selects the container destination for the vhost. Render (nginx.render.conf) must be passed
# with NGINX_CONF_DEST=/etc/nginx/templates/default.conf.template so the stock nginx image
# envsubst's API_INTERNAL_HOST at container start. The default preserves legacy behavior exactly.
ARG NGINX_CONF_DEST=/etc/nginx/conf.d/default.conf
# Patch OS packages at build time (fixable CRITICAL/HIGH CVEs in alpine base packages)
RUN apk update && apk upgrade --no-cache
COPY apps/web/${NGINX_CONF} ${NGINX_CONF_DEST}
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080 10000
# Probe the legacy vhost (8080) first, then the Render vhost (10000). One image serves both.
HEALTHCHECK --interval=30s --timeout=5s --retries=3 CMD wget -qO- http://127.0.0.1:8080/ >/dev/null 2>&1 || wget -qO- http://127.0.0.1:10000/healthz >/dev/null 2>&1 || exit 1
