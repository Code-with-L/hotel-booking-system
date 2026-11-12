# Render Deployment — The Stillhouse (Render-native, staging first)

**Prepared:** 2026-11-12 · **Baseline:** `cee2a11` · **Phase:** 1B (configuration only — no provisioning authorized)
**Status:** Repo ready for Render staging. Activation procedure documented. **Nothing deployed.** All owner gates from `docs/COMMISSIONING.md` remain binding.

## What changed in the repo (exactly)

| File | Change | Why |
|---|---|---|
| `apps/web/nginx.render.conf` | new nginx vhost. `listen 10000` (Render's default expected port); same security headers, CSP, SPA routing and `/healthz` as `nginx.conf`; `/api/` proxies via envsubst'd `${API_INTERNAL_HOST}` | Deterministic Render deployment without touching the SPA or existing local/staging vhosts |
| `apps/web/Dockerfile` | `+ARG NGINX_CONF_DEST=/etc/nginx/conf.d/default.conf`; `COPY apps/web/${NGINX_CONF} ${NGINX_CONF_DEST}`; `EXPOSE 8080 10000` (informational) | Render build passes `NGINX_CONF_DEST=/etc/nginx/templates/default.conf.template`; stock nginx image envsubst's `API_INTERNAL_HOST` at container start (official templates mechanism). Default build args = unchanged behavior |

**Backwards compatibility:** default `docker build -f apps/web/Dockerfile .` output identical to before (src → dest conf.d, EXPOSE informational). `nginx.staging.conf` untouched; local rehearsal path untouched.

## Activation procedure (manual, owner-supervised)

1. **Repository is already Render-ready** — build args to use:
   - Web service → Language: Docker, Dockerfile Path: `apps/web/Dockerfile`
   - Build args: `NGINX_CONF=nginx.render.conf`, `NGINX_CONF_DEST=/etc/nginx/templates/default.conf.template`
   - Environment variables (see `docs/PHASE_1A_STAGING_PROVISIONING.md` §6): **must** include `API_INTERNAL_HOST=<full upstream origin of the API service's private address>`, e.g. `http://stillhouse-api-ijjcq:4000` (the exact internal address the API service shows at *Connect → Internal*, prefixed with `http://`), plus `NGINX_ENVSUBST_FILTER=API_INTERNAL_HOST` (so only that variable is substituted — runtime nginx `$host`, `$uri`, `$remote_addr` stay literal).
   - Escape: if the tab shows bare `stillhouse-api-abc:4000` with no scheme, set `API_INTERNAL_HOST=http://stillhouse-api-abc:4000`.
2. `stillhouse-api` private service: Language: Docker, Dockerfile Path: `apps/api/Dockerfile`, health check path `/api/v1/ready`, region Frankfurt, same project/workspace as web + db.
3. `stillhouse-db` Render PostgreSQL 16, Frankfurt, private networking only; create non-DDL `app` role per `docs/PHASE_1A_STAGING_PROVISIONING.md` §4.
4. Set the env matrix from the provisioning doc; **`API_INTERNAL_HOST` is set only on the web service**.
5. `stillhouse-web` custom domain `staging.thestillhouse.co.ke`; TLS managed by Render; HSTS already in vhost.
6. Post-deploy smoke over HTTPS: `curl /api/v1/health`, `/healthz`, `/`; then `tests/staging-acceptance.mjs` (16/16) against the public URL.
7. Daraja callback reaches the API through the web service at `https://staging.thestillhouse.co.ke/api/v1/webhooks/mpesa` — the API itself stays unreachable from the public internet.

## Verified in this workspace (2026-11-12)

- Image build with Render args → success; `dist/` unchanged (2,187 modules; no source change).
- Container started with `API_INTERNAL_HOST=http://host.docker.internal:4000` + `NGINX_ENVSUBST_FILTER=API_INTERNAL_HOST`:
  - `/healthz` → 200; `/` → 200 (SPA shell served); `/api/v1/health` → dev API's own JSON through the nginx proxy (same-origin routing works end-to-end).
  - Rendered `default.conf` confirms only `API_INTERNAL_HOST` substituted (`proxy_pass http://host.docker.internal:4000;`), `listen 10000 default_server;`, security headers intact, `$host`, `$remote_addr` etc. untouched.
- Cleanup: test container removed; repo unchanged except the three files above.

## Rollback

Render: redeploy previous Web Service deploy (Render → Deploys → Rollback). DB: additive-only migrations ⇒ no rollback; restore from Render PITR scratch instance if needed (`docs/PHASE_1A_STAGING_PROVISIONING.md` §10, `docs/BACKUP_RESTORE.md`).

## Not done / not authorized here

No Render account, services, DNS, domain, secrets, pem file, or credential entry. M-Pesa remains **sandbox**. Production: `thestillhouse.co.ke` stays untouched. Nothing committed.
