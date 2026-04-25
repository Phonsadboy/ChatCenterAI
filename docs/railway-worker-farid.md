# Railway worker report: farid

- Project: `farid` (`b0872c5a-5abb-40f7-a594-456a687ffc08`)
- Environment: `production`
- Repo/branch: `Phonsadboy/ChatCenterAI` -> `codex/postgres-cutover-v1`
- Worker file only: `docs/railway-worker-farid.md`
- Command used with isolated Railway HOME: `NODE_PATH=/tmp/chatcenterai-migration-tools/node_modules node scripts/railway-postgres-cutover.js --project b0872c5a-5abb-40f7-a594-456a687ffc08 --delete-mongodb --chat-history-window latest-month`

## Final status

Success. Cutover completed and script exited `0`.

Final independent checks:

- Web health: `status=OK`, `database=connected`, `databaseBackend=postgres`, `startupReady=true`
- Web service: `SUCCESS`, branch `codex/postgres-cutover-v1`, region `asia-southeast1-eqsg3a=1`, domain `web-production-85d64.up.railway.app`
- Postgres: `SUCCESS`, region `asia-southeast1-eqsg3a=1`
- Redis: `SUCCESS`, region `asia-southeast1-eqsg3a=1`
- MongoDB service: absent after deletion
- Web Mongo env vars: none matching `^MONGO(DB)?_`
- Mongo volumes: none remaining

## Verified counts

Final strict pre-deploy migration verification passed with `ok=true`, `missingCount=0` for all regular collections, chat, and assets.

Important verified counts:

- `chat_history`: scope `latest-month`, `2026-04-01T00:00:00.000Z` to `2026-05-01T00:00:00.000Z`, source/target `43913`, missing `0`
- `orders`: `27226`
- `order_extraction_buffers`: `122124`
- `openai_usage_logs`: source/target `37286`, missing `0`
- `follow_up_status`: `33874`
- `follow_up_tasks`: `32084`
- `conversation_threads`: `10250`
- `active_user_status`: source `32097`, unique target `32090`, duplicate source docs `14`, missing `0`
- `user_profiles`: source `6268`, unique target `6264`, duplicate source docs `5`, missing `0`
- `user_unread_counts`: source `35524`, unique target `35521`, duplicate source docs `6`, missing `0`
- Assets: `instructionAssets=296`, `followupAssets=96`, `broadcastAssets=0`, missing `0`, size mismatches `0`

Native read verification:

- `orders`: `27226`
- `openai_usage_logs`: `37286`
- `user_profiles`: `6265` after web came up
- `follow_up_tasks`: `32084`
- `chat_conversation_heads`: ok

Post-deploy verification passed with target extras allowed and `missingCount=0`. Expected live-write extras appeared after web came up, for example `chat_history` target `43921` vs source `43913`, `conversation_threads` target `10251` vs source `10250`, and `openai_usage_logs` target `37286` vs source `37285`.

## Mongo deletion result

Script deleted these web variables before service deletion:

- `MONGODB_URI`
- `MONGO_BOOTSTRAP_MAX_RETRY_DELAY_MS`
- `MONGO_BOOTSTRAP_RETRY_DELAY_MS`
- `MONGO_CONNECT_TIMEOUT_MS`
- `MONGO_MIN_POOL_SIZE`
- `MONGO_SERVER_SELECTION_TIMEOUT_MS`
- `MONGO_SOCKET_TIMEOUT_MS`
- `MONGO_URI`

Script deleted MongoDB service `9724a8ee-c2b9-44be-8d1c-64c3a696a493` and volume `mongodb-volume`.

## Precautions and issues

- Used isolated Railway config for all `railway` and `node` commands: `HOME=/tmp/railway-home-farid`.
- Did not edit `docs/railway-main-cutover-log.md` or scripts.
- First interactive run logged at `/tmp/railway-cutover-farid-20260425-041001.log` was terminated with exit `143` during frozen final delta. Web was checked and restored because it was still stopped; `/health` returned Mongo OK before rerun.
- Reran in detached `screen` with log `/tmp/railway-cutover-farid-screen-20260425-042740.log` to avoid session termination.
- Strict final verification initially failed only on `openai_usage_logs` target extras: source `37286`, target `37295`, missing `0`. Pruned 9 Postgres target documents that no longer existed in Mongo source, then retry 3 passed strict verification.
- After trigger branch update, script waited with `deployment=main` and `trigger=codex/postgres-cutover-v1`; web was manually scaled up in Singapore to let Railway build the target branch deployment. Script then continued normally.
