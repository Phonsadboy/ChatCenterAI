# Railway Cutover: adaptable-nature

- Workspace: `ศศินภัทร์ ปภัสร์กุลชารัตน์'s Projects`
- Project ID: `be7f82cc-92d6-4cc5-b1c7-b07c76d292eb`
- Environment: `production`
- Run date: `2026-04-27` Bangkok time
- Target branch: `codex/postgres-cutover-v1`
- Web service: `20329a27-f514-43f3-8998-6d7fec0278cb`
- Domain: `web-production-09f35.up.railway.app`

## Diff Check

- Current branch differs substantially from `main`, but the Postgres cutover path is compatible.
- Runtime now requires `DATABASE_URL`; the migration sets `DATABASE_URL`, `REDIS_URL`, Postgres modes, and bucket variables before deploying this branch.
- Existing `Postgres` and `Redis` services were already present and in `asia-southeast1-eqsg3a`, so the script reused them instead of adding duplicates.
- The new audio transcription code depends on the existing OpenAI key only when transcription is invoked; `OPENAI_API_KEY` was already present on web.

## Migration Result

- Web moved from `main` to `codex/postgres-cutover-v1`.
- `/health` returned HTTP 200 with `databaseBackend=postgres`.
- Web Mongo variables are gone when checked by web service ID.
- `Postgres`, `Redis`, and `web` are `SUCCESS` in `asia-southeast1-eqsg3a`.
- MongoDB service deletion failed with Railway `Not Authorized`; MongoDB deployment was stopped with `railway down`.
- MongoDB volume deletion also failed with `Unauthorized. Please run railway login again.` The leftover volume is `mongodb-volume` (`de8f23c5-f76d-491c-8acb-8e3688a7b953`, 610.582528 MB).

## Verified Counts

- Initial cutover used `chat_history` latest-month scope: `2026-04-01T00:00:00.000Z` to `2026-05-01T00:00:00.000Z`.
- Follow-up full-history run on `2026-04-27` migrated `chat_history` scope `all`.
- Full-history source: `chat_history=92003`, preserved without user `0`.
- Full-history verification allowed live Postgres target extras: `chat_history` target `92017`, missing `0`.
- Regular collection verification passed with missing `0`.
- Key counts after full-history run: `orders=1581`, `openai_usage_logs=10933`, `user_profiles=5494`, `follow_up_tasks=6847`, `follow_up_status=5494`, `conversation_threads=5494`, `short_links=1480`, `notification_logs=1484`.
- Asset verification passed: `instructionAssets=50`, `followupAssets=66`, `broadcastAssets=0`.
- Native rebuild and verification passed after the full-history run: `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.

## Smoke Check

- Public `/health`: HTTP 200, `databaseBackend=postgres`.
- Admin protected routes returned 401 without auth, as expected.
- Authenticated smoke covered dashboard, chat, orders, follow-up, broadcast, settings, instruction pages, bots/settings APIs, first chat user APIs, first order print label, and instruction detail/preview APIs.
- Smoke summary was `62/63` OK. The one reported failure was a smoke-script false positive: login response was `{"success":true,...}` but the script marked it failed because the final response URL was still `/admin/login`.

## Precautions Found

- This workspace caps MongoDB migration memory at 8 GB. The first 12 GB limit update failed before any data movement or web freeze; rerun used `MIGRATION_MONGO_MEMORY_BYTES=8000000000`.
- Use explicit service IDs when checking variables after a script run. Service name `web` can be ambiguous if the Railway CLI is linked elsewhere.
- `railway run` injects private Railway hostnames; local verification needs `DATABASE_PUBLIC_URL` as `DATABASE_URL`.
- The CLI/account can update variables, scale services, stop deployments, and update deployment triggers in this workspace, but cannot delete the MongoDB service or volume. A workspace owner/admin must finish that cleanup.
- Because MongoDB deployment had been stopped after cutover, the full-history run needed `railway scale --service MongoDB --asia-southeast1-eqsg3a 1` to temporarily start it. After migration and verification, MongoDB was stopped again with `railway down`; final status showed MongoDB `activeSuccess=0`.
