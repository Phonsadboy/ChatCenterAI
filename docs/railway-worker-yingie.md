# Railway Worker: Yingie N Oh

- Project: Yingie N Oh (`2b0e422f-2aba-478d-853e-4db2ea9b4c22`)
- Environment: `production`
- Target branch: `codex/postgres-cutover-v1`
- Repo: `Phonsadboy/ChatCenterAI`
- Run time: `2026-04-25 05:06:37 +07`
- Railway config isolation: used `HOME=/tmp/railway-home-yingie`
- Command: `NODE_PATH=/tmp/chatcenterai-migration-tools/node_modules node scripts/railway-postgres-cutover.js --project 2b0e422f-2aba-478d-853e-4db2ea9b4c22 --delete-mongodb --chat-history-window latest-month`
- Temp run log: `/tmp/railway-yingie-cutover-20260425045955.log`

## Final Status

Completed successfully. The script exited `0`.

Post-check state:

- `web` (`2f63ab30-be9d-4115-8567-75943da1bb2f`): `SUCCESS`, active deployments `1`, branch `codex/postgres-cutover-v1`, repo `Phonsadboy/ChatCenterAI`, region `asia-southeast1-eqsg3a` replicas `1`.
- `Postgres` (`429837a5-f2f3-4bc5-8a3a-3fb605bc040b`): `SUCCESS`, active deployments `1`, region `asia-southeast1-eqsg3a` replicas `1`.
- `Redis` (`51bf23b6-f9fd-459b-bee1-ecd8551c78bc`): `SUCCESS`, active deployments `1`, region `asia-southeast1-eqsg3a` replicas `1`.
- Health check: `https://web-production-d339.up.railway.app/health` returned `status=OK`, `database=connected`, `databaseBackend=postgres`, `startupReady=true`.
- Bucket created/used: `yingie-n-oh-assets`.

## Migration Counts

- Final verification: `ok=true`.
- Regular collections: `43`.
- Regular source/sourceUnique: `611` / `611`.
- Regular target: `612` (`settings` had one target extra after post-deploy verify with target extras allowed).
- Regular missing: `0`.
- Duplicate source docs: `0`.
- Duplicate target rows: `0`.
- Failed regular collections: `0`.

Chat history:

- Window: `latest-month`.
- Scope: `2026-02-01T00:00:00.000Z` to `2026-03-01T00:00:00.000Z`.
- Source/sourceEligible/target: `200` / `200` / `200`.
- Missing: `0`.
- Preserved without user: `0`.

Assets:

- `instructionAssets`: source `6`, target `6`, missing `0`, size mismatches `0`.
- `followupAssets`: source `2`, target `2`, missing `0`, size mismatches `0`.
- `broadcastAssets`: source `0`, target `0`, missing `0`, size mismatches `0`.

Native performance verification:

- `orders`: `17`.
- `openai_usage_logs`: `49`.
- `user_profiles`: `2`.
- `follow_up_tasks`: `100`.
- `chat_conversation_heads`: ok.

## MongoDB Deletion Result

Deletion ran only after branch, health, post-deploy verification, and native performance verification passed.

- Deleted web Mongo variables: `MONGODB_URI`, `MONGO_BOOTSTRAP_MAX_RETRY_DELAY_MS`, `MONGO_BOOTSTRAP_RETRY_DELAY_MS`, `MONGO_CONNECT_TIMEOUT_MS`, `MONGO_MIN_POOL_SIZE`, `MONGO_SERVER_SELECTION_TIMEOUT_MS`, `MONGO_SOCKET_TIMEOUT_MS`, `MONGO_URI`.
- Deleted MongoDB service: yes.
- Deleted MongoDB volume: `mongodb-volume`.
- Script completion line: `mongoDeleted=true`.

Post-check confirmed:

- Mongo services remaining: `0`.
- Mongo web variables remaining: `0`.
- Mongo volumes remaining: `0`.

## Precautions / Errors

- No manual Mongo deletion was performed; deletion was handled by the cutover script after all required checks passed.
- `railway deployment redeploy` was skipped because the latest web deployment was already building/deploying. The subsequent web deployment reached `SUCCESS`, branch verification passed, and health returned postgres.
- The script re-linked the isolated Railway HOME to the review project in its `finally` block. I re-linked the same isolated HOME back to this project for post-checks only; the main Railway HOME was not linked.
- Did not edit `docs/railway-main-cutover-log.md` or any `scripts/` files.
