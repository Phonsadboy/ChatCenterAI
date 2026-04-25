# Railway Main Branch Cutover Log

Target branch: `codex/postgres-cutover-v1`
Repo: `Phonsadboy/ChatCenterAI`
Environment: `production`

## Inventory

Remaining active `main` targets to migrate after this run: none.

Initial active `main` targets handled in the final parallel batch:

| Project | Project ID | Web service | MongoDB service | Railway domain | Mongo volume |
| --- | --- | --- | --- | --- | --- |
| Yingie N Oh | `2b0e422f-2aba-478d-853e-4db2ea9b4c22` | `2f63ab30-be9d-4115-8567-75943da1bb2f` | `aeea97a6-cbfc-4aa9-8ebe-7c4f8a04fb30` | `web-production-d339.up.railway.app` | 538 MB |
| Chu | `e11c8a10-e170-4d3d-9dfb-736f2651b67f` | `7df3a6cc-25f2-4240-80dd-993996f4f7a4` | `a1eb16ba-1107-465b-aee4-122854196d68` | `web-production-c5a80.up.railway.app` | 934 MB |
| teenoi | `203150c8-ffe8-47ce-b797-d20f9e602429` | `14f9bfe1-2bef-4d62-8133-c9ee8bf2028b` | `c473472d-fb75-4ced-9f09-49410d403e7b` | `web-production-9d355.up.railway.app` | 861 MB |

Completed:

| Project | Project ID | Web service | Old MongoDB service | Railway domain | Result |
| --- | --- | --- | --- | --- | --- |
| ไม่มีชื่อไลน์ | `43bc71dd-bdc3-44b2-81c0-c18273ccaea1` | `8d7a8572-8672-41d6-910e-87c29c870c3e` | `635a1260-1d55-4102-9582-961ee321436c` | `web-production-ebe1.up.railway.app` | Postgres cutover complete, Mongo deleted |
| farid | `b0872c5a-5abb-40f7-a594-456a687ffc08` | `16e659b4-64f1-4214-bd8d-894321fc4112` | `9724a8ee-c2b9-44be-8d1c-64c3a696a493` | `web-production-85d64.up.railway.app` | Postgres cutover complete, Mongo deleted |
| Tukta_1267 | `9386964a-41e9-4498-90b5-c44f72642dd3` | `9fe4e814-5a62-4476-a5c0-e3bb4aaaf8c5` | `621e6efa-e4c0-4c03-ac29-a4e3365ad5f4` | `web-production-4f5bb.up.railway.app` | Postgres cutover complete, Mongo deleted |
| kc | `4be7cfd9-78b8-4c13-90b3-a1faccbbd2c6` | `ac4317cb-c42a-4c7d-8731-295977737b7c` | `3ec2cf92-e772-4fba-a615-e9f42bafb09b` | `web-production-7d58e.up.railway.app` | Postgres cutover complete, Mongo deleted |
| som | `8794705f-7846-4f0c-aa73-93ebb406caae` | `791ecf3c-f0f9-4016-8f55-8a780d4867df` | `0b3275ea-bc38-4d1b-9830-8665b6c0bc96` | `web-production-6fff10.up.railway.app` | Postgres cutover complete, Mongo deleted |
| Yingie N Oh | `2b0e422f-2aba-478d-853e-4db2ea9b4c22` | `2f63ab30-be9d-4115-8567-75943da1bb2f` | `aeea97a6-cbfc-4aa9-8ebe-7c4f8a04fb30` | `web-production-d339.up.railway.app` | Postgres cutover complete, Mongo deleted |
| Chu | `e11c8a10-e170-4d3d-9dfb-736f2651b67f` | `7df3a6cc-25f2-4240-80dd-993996f4f7a4` | `a1eb16ba-1107-465b-aee4-122854196d68` | `web-production-c5a80.up.railway.app` | Postgres cutover complete, Mongo deleted |
| teenoi | `203150c8-ffe8-47ce-b797-d20f9e602429` | `14f9bfe1-2bef-4d62-8133-c9ee8bf2028b` | `c473472d-fb75-4ced-9f09-49410d403e7b` | `web-production-9d355.up.railway.app` | Postgres cutover complete, Mongo deleted |

Skipped because current web service is not active on Railway:

| Project | Project ID | Latest status |
| --- | --- | --- |
| BB | `20f86475-d914-4c36-b51b-23c141e07b26` | `FAILED`, stopped |
| Mr.Thong59 | `6049f9c2-b6bd-49a6-837f-b8e682a2362c` | `FAILED`, stopped |
| Jo GAG | `7b9187c7-1b7e-486a-baf2-c5ae23b845c1` | `FAILED`, stopped, project marked deleted at `2026-04-26T17:45:23.547Z` |

## Run Notes

## Final Post-Check

- Read-only Railway inventory query after all migrations found `active_main_remaining=0` for non-deleted `Phonsadboy/ChatCenterAI` projects.
- The same inventory query found the expected non-migrated exceptions: `thaya` is active on `codex/test`, `review` was already on `codex/postgres-cutover-v1`, and inactive `main` projects `BB`/`Mr.Thong59` stayed skipped. `Jo GAG` also matched the repo on `main`, but the project is marked deleted and its web deployment is stopped/failed.
- CLI post-check covered all 8 migrated projects: `ไม่มีชื่อไลน์`, `farid`, `Tukta_1267`, `som`, `kc`, `Yingie N Oh`, `Chu`, and `teenoi`.
- Every migrated project now has web on `codex/postgres-cutover-v1`, `/health` returning HTTP 200 with `databaseBackend=postgres`, no MongoDB service, no web variables matching `MONGO_`/`MONGODB_`, no Mongo volume, and all remaining services `SUCCESS` in `asia-southeast1-eqsg3a`.
- Post-check latency probe from Bangkok on `2026-04-25` found intermittent `12s` TTFB across multiple Railway domains, including `som`, `Yingie N Oh`, and `teenoi`, while the same KC app was fast from inside Railway. This points to a shared Railway/Fastly Bangkok edge path issue rather than a per-project migration/data problem.

## Working Rules Learned Before Parallel Runs

- Before migration, set MongoDB to the short-lived migration maximum: `deploy.limitOverride.containers.cpu=6` and `deploy.limitOverride.containers.memoryBytes=12000000000`. This must happen before opening the long Mongo cursor; do not restart Mongo in the middle of a copy unless the run is being abandoned.
- All Railway services in each project should run in Singapore: `asia-southeast1-eqsg3a`. This includes `web`, `MongoDB`, `Postgres`, and `Redis`.
- For projects after the first validation run, migrate `chat_history` only for the latest calendar month present in MongoDB. Other collections still migrate fully.
- Do not run `railway link` concurrently from multiple agents with the same `$HOME`; it can corrupt `~/.railway/config.json`. Parallel workers must use isolated Railway config directories or avoid global linking.
- Freeze web with `railway down --service <web> --yes`, not `railway scale --region 0`; then require public `/health` to be unavailable before final delta verification.
- Switch branch by updating the Railway deployment trigger branch, not by editing `source.branch`.
- For newly added Postgres/Redis, set Singapore immediately after the service object appears. Do not wait for the default-region database to finish initializing before moving it; moving an initialized Postgres volume between regions repeatedly caused invalid checkpoint/WAL startup failures.
- Use GraphQL `serviceInstanceLimitsUpdate` for Mongo migration CPU/memory. `railway environment edit deploy.limitOverride...` can report success while the effective limit stays low in status metadata.
- When scaling web back up, explicitly set Singapore to `1` and all other regions to `0`; using the detected old deployment region can reintroduce `us-west2`.
- Deletion order stays strict: migrate, freeze web, run delta and verification, switch branch, health-check Postgres backend, verify again, then remove Mongo env/service/volume.

### ไม่มีชื่อไลน์

- Status: completed on `2026-04-25` Bangkok time.
- Final state:
  - web branch: `codex/postgres-cutover-v1`
  - web health: `databaseBackend=postgres`
  - MongoDB service `635a1260-1d55-4102-9582-961ee321436c`: deleted
  - MongoDB volume `e208a2e1-b8c9-42f1-b77e-05e2239a38d3`: deleted
  - web Mongo variables: deleted
- Final verified counts:
  - `chat_history` latest-month scope: Mongo source `375420`, Postgres target `375420` before deploy, missing `0`.
  - Post-deploy verify allowed target extras from live Postgres writes: `chat_history` target `375426`, `openai_usage_logs` target `93968`, `settings` target `24`, missing `0`.
  - Native performance verify passed: `orders=4909`, `openai_usage_logs=93968`, `user_profiles=58860`, `follow_up_tasks=26671`, `chat_conversation_heads=ok`.
  - Asset verify passed: `instructionAssets=110`, `followupAssets=22`, `broadcastAssets=0`.
- Precautions found:
  - first active target has the largest MongoDB volume in this batch, so run initial migration before final web freeze.
  - Railway created Postgres/Redis in `us-west2` by default; enforce Singapore immediately after service creation and before relying on the database.
  - MongoDB already had maximum migration limits (`cpu=6`, `memoryBytes=12000000000`).
  - Full `chat_history` exceeded 1,063,000 copied rows before the run was intentionally stopped; future projects should use latest-month scope to avoid multi-hour copies.
  - Moving the partially seeded Postgres service from `us-west2` to Singapore left the staging database with a WAL/checkpoint startup error. Because MongoDB was still intact and no cutover had happened, the safe recovery was to delete the staging Postgres/Redis services and recreate them cleanly in Singapore.
  - Waiting only 15 seconds after `railway scale web=0` was not enough. MongoDB still received a small number of writes during final verification, so verification correctly failed and MongoDB was not deleted. The cutover script now waits for Railway to report the web deployment stopped and repeats final migrate/verify until the source is stable.
  - Railway status can briefly say the web deployment is stopped while the public `/health` endpoint still responds. Treat the health endpoint as the source of truth before final verification.
  - Scaling the web back to one replica can already create a deployment; a manual `railway deployment redeploy` may fail with "currently building, deploying, or was removed". The script now treats that as non-fatal and waits for the service instead.
  - `railway scale --region 0` is unsafe for freezing web: it can clear `multiRegionConfig` while `numReplicas` falls back to `1`, causing Railway to deploy `main` again and accept writes. Use `railway down --service <web> --yes` for freeze and confirm `/health` returns 404 before final verify.
  - `source.branch` service config is not the real GitHub deploy branch for these services. The active branch is stored on the Railway deployment trigger. Update `deploymentTrigger.branch` via GraphQL before deploying the cutover branch.
  - If a stopped web has no latest deployment, branch checks must read the deployment trigger first. After scaling back up, re-check the actual latest deployment branch before health and Mongo deletion.
  - Deleting web Mongo variables can create target extras after deploy because the app is live on Postgres. Post-deploy verification should use `MIGRATION_ALLOW_TARGET_EXTRAS=true`, but missing source IDs must remain `0`.

### farid

- Status: completed on `2026-04-25` Bangkok time.
- Final state: web `SUCCESS` on `codex/postgres-cutover-v1`, `/health` reports `databaseBackend=postgres`, remaining services are `web`, `Postgres`, and `Redis`, and MongoDB service/volume/web variables are gone.
- Final verified counts: `chat_history` latest-month `43913`, `orders=27226`, `order_extraction_buffers=122124`, `openai_usage_logs=37286`, `follow_up_tasks=32084`, assets `instructionAssets=296`, `followupAssets=96`, `broadcastAssets=0`, missing `0`.
- Native verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.
- Precautions found:
  - One worker run was terminated during freeze and required restoring web before rerun; long migrations should run in a durable terminal/session.
  - Strict final verification found target extras in `openai_usage_logs` with missing `0`; the worker pruned 9 Postgres target docs that no longer existed in Mongo source, then strict verification passed.
  - After updating the deployment trigger, a manual scale-up was needed to force Railway to build the target branch deployment.

### Tukta_1267

- Status: completed on `2026-04-25` Bangkok time.
- Final state: web `SUCCESS` on `codex/postgres-cutover-v1`, `/health` reports `databaseBackend=postgres`, remaining services are `web`, `Postgres`, and `Redis`, and MongoDB service/volume/web variables are gone.
- Final verified counts: `chat_history` latest-month `102829`, `orders=13327`, `openai_usage_logs=108700`, `notification_logs=5332`, `follow_up_tasks=551`, assets `instructionAssets=28`, `followupAssets=4`, `broadcastAssets=0`, missing `0`.
- Native verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.
- Precautions found:
  - Freeze with `railway down` produced `NO_DEPLOYMENT activeSuccess=0`; that is acceptable when public health is unavailable.
  - Redeploy can be skipped while Railway is already building the scale-up deployment; wait for service success and verify branch/health instead.

### som

- Status: completed on `2026-04-25` Bangkok time.
- Final state: web `SUCCESS` on `codex/postgres-cutover-v1`, `/health` reports `databaseBackend=postgres`, remaining services are `web`, `Postgres`, and `Redis`, and MongoDB service/volume/web variables are gone.
- Final verified counts: `chat_history` latest-month scope `2026-02`, source/target `149`, `orders=134`, `order_extraction_buffers=325`, `openai_usage_logs=646`, `follow_up_tasks=328`, assets `instructionAssets=12`, `followupAssets=10`, `broadcastAssets=0`, missing `0`.
- Native verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.
- Precautions found:
  - `railway environment edit` did not actually raise Mongo memory from 2 GB; GraphQL `serviceInstanceLimitsUpdate` did.
  - Moving an already initialized Postgres service to Singapore corrupted the staging Postgres volume. Because web still used Mongo and no cutover happened, deleting staging Postgres/Redis/volumes and recreating cleanly was safe.
  - The latest deployment could keep reporting `main` after `railway down`; scale-up after trigger update is what creates the new branch deployment.

### kc

- Status: completed on `2026-04-25` Bangkok time.
- Final state: web `SUCCESS` on `codex/postgres-cutover-v1`, `/health` reports `databaseBackend=postgres`, remaining services are `web`, `Postgres`, and `Redis`, and MongoDB service/volume/web variables are gone.
- Final verified counts: `chat_history` latest-month `11850`, `orders=5162`, `order_extraction_buffers=26692`, `openai_usage_logs=13418`, `follow_up_tasks=7691`, assets `instructionAssets=140`, `followupAssets=12`, `broadcastAssets=0`, missing `0`.
- Native verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.
- Precautions found:
  - Repeated `read ECONNRESET` happened when initial migration started against Mongo. The failed attempts were before freeze and before Mongo deletion, so reruns were safe.
  - Postgres volumes created in the default region and then moved to Singapore repeatedly hit invalid checkpoint/WAL failures. The script was changed to set Singapore immediately after the service appears, before waiting for initial startup.
  - A running script version selected old deployment region `us-west2` when scaling web back up; manual override set Singapore-only. The script now uses Singapore for web scale-up and clears other regions.
  - Post-cutover latency incident on `2026-04-25`: public requests from Bangkok to `web-production-7d58e.up.railway.app` intermittently showed `12-15s` TTFB on `/health`, `/admin/*`, and even a 404 probe while the same routes inside the web container were fast (`/health` 2-60ms, dashboard 14-45ms, chat/settings 6-13ms, 404 2-8ms).
  - Web was scaled down from 2 replicas to 1 replica in `asia-southeast1-eqsg3a` because this app runs in-process schedulers/workers. The `12s` public spike still appeared after scale-down, so the current evidence points to the Railway/Fastly Bangkok edge path, not page render, Postgres, Redis, or replica load balancing.
  - Public requests made from inside the Railway container back to the Railway domain routed through Singapore/QPG Fastly edges and stayed fast (`9-164ms`), while slow requests from Bangkok consistently reported `x-railway-cdn-edge: fastly/cache-bkk...`. Example slow request IDs captured for Railway support: `D50jRisIT8aSOtZZoB_USg`, `AE_XswoBQdOzJkayAQeqjw`, `0cySMaqGSqW4BKbHAXC71g`, `RqX_QpYpSPiWmg06DcO5xA`, `kmMi8be4TVWGjVSkAQeqjw`.
  - The stale DB OpenAI key `Claw` was deactivated after repeated `invalid_api_key` errors; the Railway env `OPENAI_API_KEY` passed `/v1/models`. This was unrelated to page TTFB but reduced runtime errors.
  - Railway CLI project linking is affected by the working directory, not only `HOME`. Use a separate temp working directory and run `railway link --project ... --environment ...` before per-project commands. During the KC latency check one scale command hit the cwd-linked `review` project first; it ended in the intended safe shape (`SUCCESS`, 1 replica in Singapore, health 200).

### Yingie N Oh

- Status: completed on `2026-04-25` Bangkok time. Worker details: `docs/railway-worker-yingie.md`.
- Final state: web `SUCCESS` on `codex/postgres-cutover-v1`, `/health` reports `databaseBackend=postgres`, remaining services are `web`, `Postgres`, and `Redis`, and MongoDB service/volume/web variables are gone.
- Final verified counts: `chat_history` latest-month scope `2026-02`, source/target `200`, `active_user_status=88`, `follow_up_tasks=100`, `openai_usage_logs=49`, `order_extraction_buffers=131`, `orders=17`, assets `instructionAssets=6`, `followupAssets=2`, `broadcastAssets=0`, missing `0`.
- Native verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.
- Precautions found:
  - The scale-up deployment made `railway deployment redeploy` non-fatal because Railway was already building/deploying.
  - Post-deploy verification allowed live target extras in `settings`, but missing source IDs remained `0`.
  - The worker used isolated Railway config and re-linked it for post-check only.

### Chu

- Status: completed on `2026-04-25` Bangkok time. Worker details: `docs/railway-worker-chu.md`.
- Final state: web `SUCCESS` on `codex/postgres-cutover-v1`, `/health` reports `databaseBackend=postgres`, remaining services are `web`, `Postgres`, and `Redis`, and MongoDB service/volume/web variables are gone.
- Final verified counts: regular source total `1311`, `chat_history` latest-month scope `2025-11`, source/target `584`, assets `instructionAssets=222`, `followupAssets=0`, `broadcastAssets=0`, missing `0`.
- Native verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.
- Precautions found:
  - Freeze with `railway down` showed the stopped web latest deployment as `FAILED stopped activeSuccess=0`; this was expected after shutdown and final delta could proceed.
  - The first bucket check needed an explicit isolated Railway link to Chu before trusting the result.
  - Post-deploy verification allowed a live `settings` target extra, with missing remaining `0`.

### teenoi

- Status: completed on `2026-04-25` Bangkok time. Worker details: `docs/railway-worker-teenoi.md`.
- Final state: web `SUCCESS` on `codex/postgres-cutover-v1`, `/health` reports `databaseBackend=postgres`, remaining services are `web`, `Postgres`, and `Redis`, and MongoDB service/volume/web variables are gone.
- Final verified counts: regular source total `22995`, `chat_history` latest-month scope `2026-04`, source/target `107`, `active_user_status=2917`, `follow_up_status=2899`, `openai_usage_logs=3486`, `order_extraction_buffers=9287`, `orders=998`, assets total `192`, missing `0`.
- Native verification passed for `orders`, `openai_usage_logs`, `user_profiles`, `follow_up_tasks`, and `chat_conversation_heads`.
- Precautions found:
  - Health checks timed out briefly during warm-up and passed afterward; do not treat first timeout as failure if Railway status is still settling.
  - Post-deploy verification allowed one live `settings` target extra, with missing remaining `0`.
  - The final service/volume/env checks confirmed Mongo cleanup after deletion.
