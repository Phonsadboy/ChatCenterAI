# Phase 2: Runtime, Environment, and Deployment

## Purpose

This document explains how the application boots, what each runtime mode owns, which environment variables matter, and how deployment manifests map onto the real runtime split.

## Source-of-Truth Files

- `runtime/entrypoint.js`
- `runtime/admin-app.js`
- `runtime/public-ingest.js`
- `runtime/worker-realtime.js`
- `runtime/worker-batch.js`
- `runtime/migration-runner.js`
- `runtime/bootstrap-runtime.js`
- `runtime/health-server.js`
- `infra/runtimeConfig.js`
- `infra/runtimeRouteGuard.js`
- `infra/postgres.js`
- `infra/redis.js`
- `infra/queues.js`
- `infra/sessionStore.js`
- `env.example`
- `Dockerfile`
- `docker-compose.yml`
- `railway.json`
- `railway.web.json`
- `railway.public-ingest.json`
- `railway.worker-realtime.json`
- `railway.worker-batch.json`
- `nixpacks.toml`
- `Procfile`
- `index.js`

## Current Behavior

Source: `runtime/*.js`, `infra/runtimeConfig.js`, `index.js`.

### Runtime Mode Matrix

| Runtime mode | Entrypoint | HTTP surface | Main responsibility | Infra requirements |
| --- | --- | --- | --- | --- |
| `admin-app` | `runtime/admin-app.js` | Full admin app; runtime guard blocks `/webhook/*` | Admin pages, admin APIs, Socket.IO, optional legacy background jobs | PostgreSQL required for real deployments; Redis required for session store and any queue-backed features |
| `public-ingest` | `runtime/public-ingest.js` | Public-only paths allowed by route guard | Public webhook and asset ingress surface | PostgreSQL plus Redis queue and dedupe are effectively required |
| `worker-realtime` | `runtime/worker-realtime.js` | Health server only | BullMQ conversation flush worker | Redis queue backend required; PostgreSQL required by downstream processing |
| `worker-batch` | `runtime/worker-batch.js` | Health server only | Follow-up tick worker and notification summary scheduler worker | Redis queue backend plus PostgreSQL |
| `migration-runner` | `runtime/migration-runner.js` | Health server only | SQL migrations and deploy-time migration checkpoints | PostgreSQL required; Redis optional but closed on shutdown if configured |
| `legacy` | Alias in `runtime/entrypoint.js` | Same server as `admin-app` | Compatibility alias only | Same constraints as `admin-app` |

### Boot Sequence

Source: `runtime/entrypoint.js`, `runtime/bootstrap-runtime.js`, `runtime/admin-app.js`, `runtime/public-ingest.js`, `index.js`.

1. `runtime/entrypoint.js` normalizes `CCAI_RUNTIME_MODE` and requires the matching runtime module.
2. HTTP runtimes call `ensureRuntimeReady()` from `runtime/bootstrap-runtime.js`.
3. `ensureRuntimeReady()` optionally runs SQL migrations with advisory locking via `infra/postgres.js`.
4. `ensureRuntimeReady()` can also schedule deploy-time migration checkpoint work in the background when `CCAI_MIGRATION_AUTO_RUN_ASYNC=true`.
5. HTTP runtimes then call `startServer()` in `index.js`.
6. `startServer()` asserts distributed realtime requirements for the selected mode, attaches the admin realtime bridge for admin/legacy modes, and runs `initializeApplicationDataRuntime()`.
7. `initializeApplicationDataRuntime()` still loads Google Doc / Google Sheets legacy content unless explicitly disabled through options.

### Route Guard Behavior

Source: `infra/runtimeRouteGuard.js`, `index.js`.

Route exposure is enforced at runtime:

- `public-ingest` only allows `/health`, `/webhook/*`, `/assets/*`, `/broadcast/assets/*`, `/favicon.ico`, `/robots.txt`, and `/s/*`.
- `admin-app` blocks `/webhook/*`.
- Worker runtimes do not mount the Express app; they expose health via `runtime/health-server.js`.

### Background Job Ownership

Source: `workers/realtime.js`, `workers/batch.js`, `index.js`, `infra/runtimeConfig.js`.

Ownership today:

- Realtime conversation flush belongs to `worker-realtime`.
- Follow-up periodic processing and notification summary evaluation belong to `worker-batch`.
- `admin-app` can still start legacy interval-based background jobs if `CCAI_ENABLE_LEGACY_BACKGROUND_JOBS=true`.
- Broadcast execution is not owned by `worker-batch`; it still runs inside the admin runtime through the in-memory `BroadcastQueue` class in `index.js`.

## Dependencies

Source: `env.example`, `infra/runtimeConfig.js`, `index.js`, `infra/postgres.js`, `utils/telemetry.js`.

### Core Runtime Variables

| Variable class | Keys | Notes |
| --- | --- | --- |
| Runtime selection | `CCAI_RUNTIME_MODE`, `PORT`, `NODE_ENV` | `PORT` also drives the worker health server |
| PostgreSQL | `DATABASE_URL`, `POSTGRES_URL`, `PG_URL`, `PG_CONNECTION_STRING`, `CCAI_POSTGRES_ENABLED`, `CCAI_RUN_POSTGRES_MIGRATIONS_ON_BOOT`, `CCAI_PG_*`, `PGSSLMODE` | Required for nearly all meaningful runtime behavior |
| Redis/BullMQ | `REDIS_URL`, `REDIS_PUBLIC_URL`, `REDIS_PRIVATE_URL`, `RAILWAY_REDIS_URL`, `CCAI_USE_REDIS_INFRA`, `CCAI_QUEUE_BACKEND_REDIS`, `CCAI_DEDUPE_STORE_REDIS`, `CCAI_SESSION_STORE_REDIS`, queue tuning vars | Public-ingest and worker-realtime require distributed queue/dedupe behavior |
| Sessions | `ADMIN_SESSION_SECRET`, `ADMIN_SESSION_TTL_SECONDS`, `ADMIN_SESSION_COOKIE_NAME`, `CCAI_ALLOW_MEMORY_SESSION_STORE` | Memory session store is only allowed for tests or explicit override |
| Public URL / webhook routing | `PUBLIC_BASE_URL`, `CCAI_INGEST_PUBLIC_BASE_URL`, `RAILWAY_SERVICE_PUBLIC_INGEST_URL`, `CCAI_ADMIN_FORWARD_WEBHOOKS_TO_INGEST`, `CCAI_WEBHOOK_FORWARD_TIMEOUT_MS` | Important when admin domain fronts webhook paths |
| Asset storage | `ASSETS_DIR`, `FOLLOWUP_ASSETS_DIR`, `ASSETS_BASE_URL`, `FOLLOWUP_PUBLIC_BASE_URL`, `FOLLOWUP_ASSETS_BASE_URL`, `STORAGE_*`, asset HTTP retry vars | Bucket plus local cache hybrid behavior |
| LLM and providers | `OPENAI_API_KEY`, `OPENROUTER_BASE_URL`, `OPENROUTER_HTTP_REFERER`, `OPENROUTER_X_TITLE`, `INSTRUCTION_MAX_TOOL_ITERATIONS` | Additional API keys may live in the database |
| Platform defaults | `LINE_CHANNEL_ACCESS_TOKEN`, `LINE_CHANNEL_SECRET`, `META_GRAPH_API_VERSION` | Per-bot tokens are typically stored in Postgres bot records |
| Admin/auth | `ADMIN_MASTER_PASSCODE` | Enables passcode-based admin authentication |
| Deploy/migrations | `CCAI_MIGRATION_*`, `RAILWAY_DEPLOYMENT_ID`, `RAILWAY_GIT_COMMIT_SHA`, `RAILWAY_GIT_COMMIT_ID` | Used by deploy checkpoint logic |
| Telemetry | `TELEMETRY_ENABLED`, `TELEMETRY_TELEGRAM_BOT_TOKEN`, `TELEMETRY_TELEGRAM_CHAT_ID` | Optional but currently has unsafe defaults in code |

### Runtime-Specific Minimums

Source: `infra/runtimeConfig.js`, `runtime/*.js`, `index.js`.

| Runtime | Minimum practical config |
| --- | --- |
| `admin-app` | PostgreSQL, Redis session store, admin auth config, LLM config, bucket config if assets are used |
| `public-ingest` | PostgreSQL, Redis infra, Redis queue, Redis dedupe, public base URL |
| `worker-realtime` | PostgreSQL, Redis infra, Redis queue, worker concurrency config |
| `worker-batch` | PostgreSQL, Redis infra, Redis queue, follow-up/notification feature config |
| `migration-runner` | PostgreSQL plus migration flags |

## Data Flow

Source: `runtime/bootstrap-runtime.js`, `infra/postgres.js`, `index.js`, `workers/*.js`.

### SQL Migration Flow

1. `ensureRuntimeReady()` checks `runtimeConfig.features.postgresEnabled`.
2. If boot-time migrations are enabled, `runSqlMigrationsWithLock()` acquires a Postgres advisory lock and applies files from `migrations/postgres/`.
3. Deploy checkpoint logic writes to `migration_checkpoints`.
4. `migration-runner` can run the same SQL bootstrapping and then a reduced migration pipeline summary.

### Realtime Queue Safety Flow

1. `startServer()` calls `assertDistributedRealtimeInfrastructureReady()`.
2. `public-ingest` and `worker-realtime` require Redis queue backend.
3. `public-ingest` additionally requires Redis dedupe store.
4. `admin-app` can still use Redis-backed queueing if configured, but is not allowed to require in-memory fallback when running in ingest or realtime worker modes.

### Session and Admin Flow

1. Express session middleware uses `createSessionStore()`.
2. Redis session storage is expected outside tests unless `CCAI_ALLOW_MEMORY_SESSION_STORE=true`.
3. Admin login/passcode behavior is implemented in `index.js` and `utils/auth.js`.

## Hotspots

Source: `Dockerfile`, `docker-compose.yml`, `DOCKER.md`, `railway*.json`, `index.js`.

- The runtime split is newer than some deployment docs. `DOCKER.md` still describes a simpler single-container model.
- `Dockerfile` starts `npm run start:admin`, not the full multi-service topology.
- `docker-compose.yml` does define multiple services, but it still enables some legacy background behavior on `worker-batch`.
- `PUBLIC_BASE_URL` and webhook forwarding settings are operationally sensitive. Misconfiguring them can break Facebook callback delivery or public asset URLs.
- `initializeApplicationDataRuntime()` still loads Google Doc/Sheet content by default for HTTP runtimes, which increases boot-time coupling to legacy content sources.

## Safe-Change Rules

Source: `runtime/*.js`, `infra/runtimeRouteGuard.js`, `infra/sessionStore.js`, `index.js`.

- Do not expose admin routes from `public-ingest` or webhook routes from `admin-app` without explicitly changing runtime route guard rules.
- Do not assume the single-container Docker path reflects production. Check Railway and compose manifests first.
- When changing queue or dedupe behavior, re-check `assertDistributedRealtimeInfrastructureReady()` and the runtime mode semantics.
- Do not remove legacy background jobs until you confirm all affected deployments use `worker-batch`.

## Known Gaps

Source: `DOCKER.md`, `docker-compose.yml`, `index.js`, `env.example`.

- Some deployment docs still lag behind the multi-runtime architecture.
- The env surface is broad and not fully normalized; many features can read both env and Postgres-backed settings.
- Legacy content bootstrap is still part of server startup even though document-store runtime removal is otherwise emphasized.

## Risk Notes

Source: `runtime/*.js`, `infra/runtimeConfig.js`, `infra/runtimeRouteGuard.js`, `index.js`.

- A runtime can appear healthy at process level while still being misconfigured for its real job, especially when Redis queue or dedupe requirements are missing.
- `admin-app` and `public-ingest` both boot through `startServer()`, so shared-server changes can affect both surfaces at once.
- Boot-time legacy Google Doc / Sheets loading increases operational coupling and can fail unrelated runtime starts.

## Checkpoint Summary

Source: `runtime/*.js`, `infra/runtimeConfig.js`, `env.example`, `railway*.json`, `Dockerfile`, `docker-compose.yml`.

- Runtime modes, route-guard exposure rules, and worker ownership are documented.
- The env/deploy matrix now distinguishes HTTP runtimes, worker runtimes, and migration-runner behavior.
- A future agent can tell which infra dependencies are mandatory for each runtime before changing deployment or startup code.

## Next Actions

- Normalize deployment docs so they clearly distinguish single-runtime local dev from multi-runtime production.
- Reduce boot-time dependence on Google Doc/Sheet loading for runtimes that do not need it.
- Create a deployment matrix test or smoke-check script that validates runtime mode + route guard + required infra expectations.
