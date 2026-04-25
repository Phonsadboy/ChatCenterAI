# Railway Worker: Tukta_1267

- Project: Tukta_1267 (`9386964a-41e9-4498-90b5-c44f72642dd3`)
- Environment: `production`
- Repository: `Phonsadboy/ChatCenterAI`
- Target branch: `codex/postgres-cutover-v1`
- Completed: `2026-04-25 04:26:15 +07`
- Isolated Railway HOME used: `/tmp/railway-home-tukta`
- Cutover log: `/tmp/railway-tukta-cutover-20260425-041018.log`

## Final Status

- Status: completed successfully.
- Script completed with `mongoDeleted=true`.
- Web service status after cutover: `SUCCESS`.
- Web deployment branch after cutover: `codex/postgres-cutover-v1`.
- Remaining services after Mongo deletion: `Postgres`, `web`, `Redis`.
- Health check: `https://web-production-4f5bb.up.railway.app/health` returned `status=OK`, `database=connected`, `databaseBackend=postgres`, `startupReady=true`.
- Chat history window used: `latest-month`.
- Chat scope verified: `2026-04-01T00:00:00.000Z` to `2026-05-01T00:00:00.000Z`.

## Verified Counts

- Overall migration verification: `ok=true`.
- Failed groups: `regular=[]`, `chat=null`, `assets=[]`.
- Missing records: `0` for regular collections, chat history, and assets.
- `active_user_status`: source `25454`, unique/target `25453`, duplicate source docs `2`.
- `conversation_threads`: source/target `19637`.
- `follow_up_status`: source `25452`, unique/target `25451`, duplicate source docs `2`.
- `follow_up_tasks`: source/target `551`.
- `notification_logs`: source/target `5332`.
- `openai_usage_logs`: source/target `108700`.
- `orders`: source/target `13327`.
- `short_links`: source/target `11500`.
- `user_profiles`: source/target `16044`.
- `user_unread_counts`: source/target `25535`.
- `chat_history`: source eligible/target `102829`, preserved without user `0`.
- Assets: `instructionAssets=28`, `followupAssets=4`, `broadcastAssets=0`.
- Native Postgres verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.

## Mongo Deletion Result

- MongoDB web variables removed:
  - `MONGODB_URI`
  - `MONGO_BOOTSTRAP_MAX_RETRY_DELAY_MS`
  - `MONGO_BOOTSTRAP_RETRY_DELAY_MS`
  - `MONGO_CONNECT_TIMEOUT_MS`
  - `MONGO_MIN_POOL_SIZE`
  - `MONGO_SERVER_SELECTION_TIMEOUT_MS`
  - `MONGO_SOCKET_TIMEOUT_MS`
  - `MONGO_URI`
- MongoDB service deletion logged successfully.
- MongoDB volume deletion logged successfully: `mongodb-volume`.
- Post-run Railway status confirmed no `MongoDB` service remains.
- Post-run web variable check found no keys matching `^MONGO(DB)?_`.
- Post-run volume check found no Mongo-related volume or `/data/db` mount.

## Precautions And Notes

- Used isolated Railway config only: `/tmp/railway-home-tukta`.
- Did not edit `docs/railway-main-cutover-log.md` or migration scripts.
- MongoDB migration limits were set before migration: `cpu=6`, `memoryBytes=12000000000`.
- Database services were placed in Singapore region `asia-southeast1-eqsg3a`.
- Freeze used `railway down`; stopped check logged `NO_DEPLOYMENT activeSuccess=0` before final delta verification.
- Branch update was applied through the deployment trigger and verified as `codex/postgres-cutover-v1`.
- One redeploy command was skipped because the latest deployment was already building/deploying/removed. The subsequent scale-up deployment reached `SUCCESS`, branch verification passed, and health/post-deploy verification passed.
