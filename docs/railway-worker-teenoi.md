# Railway worker note: teenoi

Timestamp: 2026-04-25 05:11:25 +07

## Scope

- Project: teenoi (`203150c8-ffe8-47ce-b797-d20f9e602429`)
- Environment: production (`1c99038f-4e55-4f19-9880-032bcd91e91e`)
- Repo/branch: `Phonsadboy/ChatCenterAI`, `codex/postgres-cutover-v1`
- Command: `NODE_PATH=/tmp/chatcenterai-migration-tools/node_modules node scripts/railway-postgres-cutover.js --project 203150c8-ffe8-47ce-b797-d20f9e602429 --delete-mongodb --chat-history-window latest-month`
- Railway config isolation: used `HOME=/tmp/railway-home-teenoi` for all Railway commands.

## Final status

- Cutover completed successfully: `complete project=teenoi mongoDeleted=true`.
- Web service is `SUCCESS`, not stopped, on branch `codex/postgres-cutover-v1`, region `asia-southeast1-eqsg3a`.
- Health check passed: `/health` returned `status=OK`, `database=connected`, `databaseBackend=postgres`, `startupReady=true`.
- Postgres service is `SUCCESS` in `asia-southeast1-eqsg3a`.
- Redis service is `SUCCESS` in `asia-southeast1-eqsg3a`.
- Bucket exists: `teenoi-assets` (`8a409fa1-fefc-499b-9762-6276d33a0085`).

## Migration counts

- Regular collections verified: 45.
- Regular totals: source 22,995, target 22,996, missing 0.
- Duplicate source docs: 0 total.
- Duplicate target docs: 0 total.
- Chat history window: `latest-month`, `2026-04-01T00:00:00.000Z` to `2026-05-01T00:00:00.000Z`.
- Chat history: source 107, target 107, missing 0, preserved without user 0.
- Assets: source 192, target 192, missing 0, size mismatches 0.

Important collection counts:

| Collection | Source | Target | Missing |
| --- | ---: | ---: | ---: |
| active_user_status | 2,917 | 2,917 | 0 |
| follow_up_status | 2,899 | 2,899 | 0 |
| openai_usage_logs | 3,486 | 3,486 | 0 |
| order_extraction_buffers | 9,287 | 9,287 | 0 |
| orders | 998 | 998 | 0 |
| user_unread_counts | 3,002 | 3,002 | 0 |
| conversation_threads | 86 | 86 | 0 |
| instruction_assets | 96 | 96 | 0 |
| settings | 26 | 27 | 0 |

Native Postgres verification passed:

- orders: 998
- openai_usage_logs: 3,486
- user_profiles: 38
- follow_up_tasks: 33
- chat_conversation_heads: ok

## MongoDB cleanup

- MongoDB service deletion: completed.
- MongoDB volume deletion: completed (`mongodb-volume` removed).
- Final service list contains only `web`, `Postgres`, and `Redis`.
- Final volume list contains only `redis-volume` and `postgres-volume`.
- Final web variable check found no keys matching `MONGO_` or `MONGODB_`.

## Precautions and notes

- Did not edit `docs/railway-main-cutover-log.md` or any script files.
- Web freeze occurred after initial migration via `railway down`; final delta verification passed on attempt 1.
- During scale-up, `deployment redeploy` was skipped because Railway reported the latest deployment was already building/deploying. The deployment then reached `SUCCESS`.
- Health check timed out during initial warm-up, then passed with `health 200 postgres`.
- Post-deploy verification used target extras allowance; `settings` had one extra target row after app startup, but missing remained 0 and verification was ok.
- No migration failure lines were found in the captured cutover log.
