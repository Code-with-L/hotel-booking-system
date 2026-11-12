# Backup & Restore — The Stillhouse

**Restore drill performed 2026-11-11 (evidence):**

```
docker exec stillhouse-db pg_dump -U stillhouse -d stillhouse --format=custom -f /data/restore_check.dump
docker exec stillhouse-db psql -U stillhouse -d postgres -c "DROP DATABASE IF EXISTS stillhouse_restore_check;" -c "CREATE DATABASE stillhouse_restore_check;"
docker exec stillhouse-db pg_restore -U stillhouse -d stillhouse_restore_check --clean --if-exists /data/restore_check.dump
docker exec stillhouse-db psql -U stillhouse -d stillhouse_restore_check -c "SELECT count(*) FROM room; SELECT count(*) FROM rate_card; SELECT count(*) FROM reservation; SELECT count(*) FROM room_allocation; SELECT count(*) FROM audit_log;"
→ rooms=28 rate_cards=12 reservations=38 allocations=37 audit_rows=7   -- matches pre-dump dev DB
```
Scratch DB then dropped. Spill avoided (dump deleted from the volume).

**Why `pg_dump` custom format:** selective restore, compression, `pg_restore --list` inspection, parallel jobs if ever needed.

## Production cadence

| Frequency | Action |
|---|---|
| Daily | Automated snapshot/PITR (managed provider — verify it's enabled and actually running; many providers require opt-in) |
| Weekly | `pg_dump` to object storage (belt-and-braces; ~50–200 MB here) |
| Monthly | `pg_restore` into a scratch DB; verify table counts + one real booking lookup; log the drill date in `docs/BACKUP_RESTORE.md` (this file) |
| Quarterly | Full-dress: restore to staging, boot the API against it, walk the guest journey |

Retention: ≥ 30 days daily + 12 monthly (finance/audit). Verify restore BEFORE you need it — an untested backup is not a backup.

## Restore procedure (production)

1. Stop the API (connections drain).
2. `pg_restore --clean --if-exists -d $DATABASE_URL backup.dump` (or provider "restore from snapshot").
3. Start API → `GET /api/v1/ready` must report `db: up`.
4. Smoke: `curl -i "$BASE/api/v1/availability?checkIn=…"` + repeat a real booking check in the last 48h.
5. If migrations drifted (new migration applied then restore of older dump): run `npx prisma migrate deploy` once after restore, then re-verify.
6. Write a one-paragraph incident note (what broke, what you restored, what data was at risk) — auditors appreciate this more than heroics.

## Drill log

| Date | Action | Result | By |
|---|---|---|---|
| 2026-11-11 | pg_dump → pg_restore → counts verified | ✔ pass | M2-F |
| (next) | | | |
