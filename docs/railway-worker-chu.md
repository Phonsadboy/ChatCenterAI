# Railway Worker Chu

- Project: Chu (`e11c8a10-e170-4d3d-9dfb-736f2651b67f`)
- Environment: production
- Target branch: `codex/postgres-cutover-v1`
- Command: `NODE_PATH=/tmp/chatcenterai-migration-tools/node_modules node scripts/railway-postgres-cutover.js --project e11c8a10-e170-4d3d-9dfb-736f2651b67f --delete-mongodb --chat-history-window latest-month`
- Railway CLI isolation: all Railway commands used `HOME=/tmp/railway-home-chu` with copied token config.

## Final Status

SUCCESS. Web is running from `Phonsadboy/ChatCenterAI` branch `codex/postgres-cutover-v1`, region `asia-southeast1-eqsg3a`, latest deployment `SUCCESS`, active successful deployments `1`.

Health check: `https://web-production-c5a80.up.railway.app/health` returned HTTP 200 with `status=OK`, `database=connected`, `databaseBackend=postgres`, `startupReady=true`.

Final services in Chu production:

- `web` (`7df3a6cc-25f2-4240-80dd-993996f4f7a4`): `SUCCESS`, Singapore, branch `codex/postgres-cutover-v1`
- `Postgres` (`d7b6d959-69ac-4671-ab52-bdbbeea6ef19`): `SUCCESS`, Singapore
- `Redis` (`5b6a7fa7-0583-452f-b5ab-fc913222c08f`): `SUCCESS`, Singapore

Bucket present after explicit Chu link: `chu-assets` (`b725c55c-a9fd-49d9-ba6d-4599c06c16fd`).

## Counts

- Regular Mongo collections verified: source total `1311`, duplicate source docs `0`, missing `0`.
- `chat_history`: `latest-month` scope `2025-11-01T00:00:00.000Z` to `2025-12-01T00:00:00.000Z`, source eligible `584`, target `584`, preserved without user `0`, missing `0`.
- Assets: `instructionAssets` source `222`, target `222`, missing `0`, size mismatches `0`; `followupAssets` source/target `0`; `broadcastAssets` source/target `0`.
- Native performance verify: `orders=0`, `openai_usage_logs=21`, `user_profiles=1`, `follow_up_tasks=0`, `chat_conversation_heads=ok`.
- Post-deploy verification returned `ok=true`; all regular/chat/assets missing counts were `0`. `settings` had target `27` vs source `26` during post-deploy verify with target extras allowed, missing `0`.

## Mongo Deletion Result

Mongo cleanup ran only after final delta verify, native verify, branch switch, web health, and post-deploy verify passed.

- Deleted web variables: `MONGODB_URI`, `MONGO_BOOTSTRAP_MAX_RETRY_DELAY_MS`, `MONGO_BOOTSTRAP_RETRY_DELAY_MS`, `MONGO_CONNECT_TIMEOUT_MS`, `MONGO_MIN_POOL_SIZE`, `MONGO_SERVER_SELECTION_TIMEOUT_MS`, `MONGO_SOCKET_TIMEOUT_MS`, `MONGO_URI`.
- Deleted MongoDB service.
- Deleted Mongo volume: `mongodb-volume`.
- Final volume list for Chu production contains only `postgres-volume` and `redis-volume`.

## Precautions And Notes

- No manual Mongo deletion was performed before verification/health/branch checks passed.
- Freeze used `railway down`; during stopped check the web latest deployment showed `FAILED stopped activeSuccess=0`, then final delta migration continued as expected.
- `railway deployment redeploy` was skipped because the latest web deployment was already building/deploying after scale-up; the build completed successfully and health passed.
- A final bucket check was rerun after explicitly linking the isolated Railway config to Chu before trusting the result.
