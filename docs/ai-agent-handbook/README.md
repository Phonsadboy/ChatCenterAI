# AI Agent Handbook

## Purpose

This handbook documents the current `ChatCenterAI-6` codebase for future AI agents and engineers. The goal is not to describe an ideal architecture. The goal is to describe the code that actually runs today, the storage it touches, the runtime split that exists in deployment, and the hotspots that can easily break production if an agent edits them without context.

## Source-of-Truth Files

Primary sources for this handbook:

- `index.js`
- `package.json`
- `runtime/*.js`
- `infra/*.js`
- `infra/storage/bucketStorage.js`
- `services/*.js`
- `services/repositories/*.js`
- `migrations/postgres/*.sql`
- `views/*.ejs`
- `public/js/*.js`
- `public/css/*.css`
- `env.example`
- `Dockerfile`
- `docker-compose.yml`
- `railway*.json`
- `nixpacks.toml`
- `scripts/*.js`

Secondary sources only:

- Existing prose docs in `docs/`
- Existing prose docs in `docs-oreder/`
- Archive material in `docs/archive/legacy-mongo/`

When this handbook conflicts with secondary docs, trust code and migrations first.

## Current Behavior

Source: `runtime/entrypoint.js`, `runtime/admin-app.js`, `runtime/public-ingest.js`, `runtime/worker-realtime.js`, `runtime/worker-batch.js`, `runtime/migration-runner.js`, `index.js`.

The deployment model is already split into multiple runtimes, but most business logic is still concentrated in the monolithic `index.js` file. That split matters:

- Runtime selection is controlled by `CCAI_RUNTIME_MODE`.
- `admin-app` and `public-ingest` both boot the same `startServer()` function from `index.js`.
- `worker-realtime` and `worker-batch` run separate worker entrypoints, but both still depend on orchestration code exported from `index.js`.
- `migration-runner` owns SQL bootstrap and deploy-time migration checkpoint logic.
- The old document-store runtime is described as removed in `env.example` and guarded by `scripts/verify-no-mongo.js`, but `index.js` still contains legacy naming and Google Doc / Google Sheets refresh code.

### Reading Order

Use this order unless you are debugging a specific incident:

| Order | Document | Use it for |
| --- | --- | --- |
| 1 | `01-system-map.md` | First-pass orientation and subsystem map |
| 2 | `02-runtime-env-deploy.md` | Boot sequence, runtime modes, env, deployment shape |
| 3 | `03-data-model-storage.md` | PostgreSQL, Redis, bucket storage, repository ownership |
| 4 | `04-api-ui-surface.md` | Route families, admin pages, Socket.IO, asset surfaces |
| 5 | `domains/05-chat-and-webhooks.md` | Inbound messaging, queueing, AI replies, admin realtime |
| 6 | `domains/06-instruction-ai-and-conversation-history.md` | Instruction editing, Responses API loop, thread analytics |
| 7 | `domains/07-orders-followup-broadcast-notifications.md` | Order extraction, follow-up, broadcast, notifications |
| 8 | `domains/08-bots-assets-categories.md` | Bot CRUD, assets, collections, categories, Facebook comment automation |
| 9 | `09-ops-risk-and-backlog.md` | Risks, cutover state, prioritized next actions |
| 10 | `appendices/*.md` | Route inventory, schema index, source map |

### Handbook Layout

| Path | Role |
| --- | --- |
| `README.md` | Contract, reading order, source hierarchy |
| `01-system-map.md` | Repo-wide architecture map |
| `02-runtime-env-deploy.md` | Runtime wiring and environment requirements |
| `03-data-model-storage.md` | Persistence, caches, storage ownership |
| `04-api-ui-surface.md` | Public/admin HTTP surface and frontend map |
| `domains/05-chat-and-webhooks.md` | Messaging pipeline deep dive |
| `domains/06-instruction-ai-and-conversation-history.md` | Instruction AI and thread analytics deep dive |
| `domains/07-orders-followup-broadcast-notifications.md` | Order/follow-up/broadcast/notification deep dive |
| `domains/08-bots-assets-categories.md` | Bots, assets, categories, comment automation deep dive |
| `09-ops-risk-and-backlog.md` | Operational risk register and action backlog |
| `appendices/route-inventory.md` | Route family inventory derived from `index.js` |
| `appendices/schema-table-index.md` | Migration-by-migration table/index inventory |
| `appendices/doc-source-map.md` | Which repo sources feed which handbook docs |

### Documentation Contract

Every phase, domain, and appendix document in this handbook follows the same section order:

1. Purpose
2. Source-of-Truth Files
3. Current Behavior
4. Dependencies
5. Data Flow
6. Hotspots
7. Safe-Change Rules
8. Known Gaps
9. Risk Notes
10. Checkpoint Summary
11. Next Actions

Additional contract rules:

- Non-trivial claims must point back to exact repo sources at the section or subsection level.
- Code, migrations, runtime config, and deployment manifests outrank older prose docs.
- Secret classes and exposure risks may be documented, but literal secret values must never be copied into handbook content.
- If a template, script, or route appears dormant, say that explicitly instead of assuming it is live.

## Dependencies

Source: `package.json`, `runtime/*.js`, `infra/*.js`, `index.js`.

This codebase depends on:

- Node.js 18+
- Express + EJS for the admin server
- Socket.IO for admin realtime updates
- PostgreSQL for all current primary application data
- Redis for sessions, BullMQ queues, admin event bus, dedupe, and distributed locks
- OpenAI SDK and optional OpenRouter-compatible configuration
- LINE Bot SDK
- Meta Graph API usage for Facebook, Instagram, and WhatsApp
- AWS S3-compatible bucket access for asset storage
- Google APIs for legacy Google Doc / Google Sheets bootstrap paths
- `sharp`, `multer`, `xlsx`, and `moment-timezone` for media, uploads, export, and scheduling

## Data Flow

Source: `index.js`, `runtime/*.js`, `workers/*.js`, `infra/*.js`, `services/repositories/*.js`.

Broadly, the system works in four loops:

1. Runtime boot: entrypoint selects a runtime mode, runtime bootstrap ensures PostgreSQL migrations are ready, and the runtime either starts the shared HTTP server or dedicated workers.
2. Inbound messaging: webhook routes accept platform events, dedupe them, write message history, queue conversation work, and eventually call the AI reply pipeline.
3. Admin control plane: EJS admin pages call JSON endpoints in `index.js`, which read and write through Postgres-backed repositories and emit Socket.IO admin events.
4. Background automation: realtime workers flush conversation buffers; batch workers drive follow-up scheduling and notification summary checks; broadcast jobs run inside the admin runtime and persist progress snapshots to `broadcast_history`.

## Hotspots

Source: `index.js`, `config.js`, `utils/telemetry.js`, `Dockerfile`, `DOCKER.md`, `env.example`.

Highest-risk areas for future agents:

- `index.js` is the concentration point for routes, orchestration, webhook logic, AI prompting, follow-up, broadcast, order extraction, and frontend render wiring.
- Secret handling is inconsistent. Some secrets come from env or the database, but hardcoded secret-bearing constants still exist in `index.js`, `config.js`, and `utils/telemetry.js`.
- Deployment is multi-runtime, but older docs and some code paths still describe a single-server mental model.
- Queue behavior is mode-dependent. `public-ingest` and `worker-realtime` require distributed Redis/BullMQ behavior, while `admin-app` can still fall back to in-memory queue behavior if configured incorrectly.
- Legacy instruction/document bootstrap is still present even though the document-store runtime is described as removed.

## Safe-Change Rules

Source: `runtime/*.js`, `infra/runtimeConfig.js`, `infra/runtimeRouteGuard.js`, `index.js`, `migrations/postgres/*.sql`.

- Treat `index.js` as a shared kernel. A change in one domain can affect unrelated runtimes because multiple runtimes import the same module.
- Do not change route exposure rules without checking `infra/runtimeRouteGuard.js` and the actual runtime that serves the route.
- Do not change table semantics by editing repository code only. Confirm the backing migration contract first.
- Preserve legacy string identifiers such as `legacy_bot_id`, `legacy_contact_id`, `legacy_order_id`, and string route identifiers even when UUID-backed rows exist underneath.
- Do not trust old prose docs over code, migrations, or runtime config.

## Known Gaps

Source: `scripts/verify-no-mongo.js`, `index.js`, `DOCKER.md`, `views/*.ejs`, `public/js/*.js`.

- The repo has no full automated test suite for runtime behavior.
- Existing documentation is incomplete and in places outdated relative to the multi-runtime deployment model.
- Some route families still mix legacy and v2 behavior instead of cleanly separating them.
- Broadcast execution is not yet moved into a durable worker service; it still lives in memory inside the admin runtime.

## Risk Notes

Source: `index.js`, `runtime/*.js`, `migrations/postgres/*.sql`, `docs/`.

- This handbook is evidence-backed but still static. It will drift if routes, migrations, or runtime flags change and the docs are not updated in the same change set.
- `index.js` remains the biggest drift amplifier because one file still owns routes, orchestration, platform handling, and worker exports.
- Existing prose docs outside this handbook can still mislead an agent if it does not follow the source hierarchy documented above.

## Checkpoint Summary

Source: the handbook files listed in `### Handbook Layout`.

- The repo now has a split handbook rather than a single narrative document.
- A new agent can use the reading order in this file to move from system orientation to deep-dive domains and then to the operations backlog.
- The contract above defines the minimum documentation shape every follow-up update must preserve.

## Next Actions

- Read `01-system-map.md` before editing any runtime code.
- Read the relevant domain deep-dive before editing webhook, AI, order, follow-up, or bot code.
- Check `09-ops-risk-and-backlog.md` before making structural changes, because several high-risk issues are already known and should not be rediscovered from scratch.
