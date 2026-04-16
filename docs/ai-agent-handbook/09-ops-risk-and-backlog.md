# Phase 6: Operations, Risks, and Backlog

## Purpose

This document records the current operational risks, cutover state, test gaps, and the prioritized backlog that future agents should use instead of re-scanning the whole repo.

## Source-of-Truth Files

- `index.js`
- `config.js`
- `utils/telemetry.js`
- `runtime/*.js`
- `infra/*.js`
- `workers/*.js`
- `migrations/postgres/*.sql`
- `scripts/verify-no-mongo.js`
- `scripts/verify-pg-safety.js`
- `DOCKER.md`
- `docker-compose.yml`
- `env.example`
- `docs/ai-agent-handbook/*.md`

## Current Behavior

Source: the files listed above.

### Migration / Cutover State

Observed state:

- PostgreSQL is the primary application store for current runtime behavior.
- Legacy document-store runtime is described as removed from normal deployment in `env.example`.
- `scripts/verify-no-mongo.js` exists specifically to catch Mongo leftovers.
- `scripts/verify-pg-safety.js` exists specifically to catch one known dangerous Postgres conflict pattern.
- Despite the cutover, `index.js` still contains legacy naming and still loads Google Doc / Google Sheets content during HTTP startup by default.

### Operational Shape

Observed state:

- Production-intended deployment is multi-runtime.
- Admin pages and some background logic still assume a shared monolithic code kernel.
- Broadcast execution is process-local.
- Queue correctness depends on Redis configuration matching runtime mode expectations.

### Test Posture

Source: repo structure and `package.json`.

The repo currently has no committed automated test suite for the major runtime flows. Existing validation is mostly:

- runtime startup behavior
- migration scripts
- manual UI verification docs
- static guardrail scripts

## Dependencies

Source: code and docs above.

Operationally sensitive dependencies:

- PostgreSQL availability and migration correctness
- Redis availability for sessions, queueing, locks, dedupe, and admin event bridging
- Bucket storage availability for assets
- OpenAI-compatible provider credentials
- Platform credentials in bot records
- Correct public base URL and webhook-forwarding config

## Data Flow

Source: `runtime/*.js`, `workers/*.js`, `index.js`.

Operationally important flows:

1. Boot: runtime mode -> migration readiness -> shared server or worker start.
2. Realtime ingest: webhook runtime -> Redis queue -> realtime worker -> AI reply -> Postgres write.
3. Batch automation: batch worker -> due follow-up tasks and notification summaries.
4. Admin control plane: admin-app -> pages/APIs -> Postgres/Redis -> Socket.IO bridge.
5. Broadcast: admin-app process memory + `broadcast_history` snapshots.

## Hotspots

Source: `index.js`, `config.js`, `utils/telemetry.js`, deployment manifests.

### Security and Secret Risks

Do not copy literal values out of code, but note the risk classes:

- Hardcoded Google credential material exists in `index.js` and `config.js`.
- Hardcoded telemetry fallback token/chat defaults exist in `utils/telemetry.js`.
- Default admin session secret fallback exists in `index.js`.
- Secret-bearing fields are also merged into runtime bot documents through `botRepository.js` and `postgresBotSync.js`.

### Architecture Risks

- `index.js` is too large and too central; almost every meaningful feature route or orchestration change touches it.
- Worker runtimes still depend on functions exported from `index.js`, which weakens runtime isolation.
- Background job ownership is mixed between dedicated workers and optional legacy intervals.
- Broadcast is not durable because execution lives in memory.

### Documentation / Drift Risks

- `DOCKER.md` still reads like a simpler single-service deployment guide.
- Existing docs in `docs/` are useful but not authoritative.
- Route and payload contracts are mostly implicit.

### Testing Risks

- No automated end-to-end coverage for webhook -> queue -> AI -> outbound message paths.
- No contract tests for admin Socket.IO payloads.
- No automated guard against breaking the runtime split.

## Safe-Change Rules

Source: all files above.

- Do not rotate or remove a secret path in code without confirming the runtime now reads it from env or DB everywhere it is used.
- Do not merge worker logic back into admin-app as a shortcut; that increases operational coupling.
- Do not assume a successful change in `npm run dev` proves `public-ingest` or worker behavior.
- Do not delete legacy compatibility code until route usage and deployment mode are both confirmed.

## Known Gaps

Source: current audit results.

- The repo lacks a generated source-of-truth contract for routes, schemas, and event payloads.
- There is no secure-secret cleanup yet; this handbook only documents the issue.
- Some older docs and runtime defaults still encode pre-split assumptions.

## Risk Notes

Source: `index.js`, `config.js`, `utils/telemetry.js`, `runtime/*.js`, `workers/*.js`.

- Secret handling debt is active, not historical. `config.js` still carries hardcoded Google credential material and a verification-token fallback, `index.js` still carries an admin session secret fallback, and `utils/telemetry.js` still carries Telegram credential fallbacks.
- Operational resilience is uneven. Workers are split out, but the admin runtime still owns critical in-memory broadcast execution.
- Migration/cutover debt is partially hidden by compatibility layers, because PostgreSQL is primary while legacy naming and Google content bootstrap still remain in the code path.

## Checkpoint Summary

Source: all files listed in `Source-of-Truth Files`.

- The highest-risk operational issues, secret classes, cutover state, and missing test layers are now documented in one place.
- The backlog is prioritized so a future agent can choose the next structural improvement without re-auditing the whole repo.
- This file is the handoff point for architecture-hardening work after feature-specific docs have been read.

## Next Actions

### P0

- Remove hardcoded secret-bearing defaults from `index.js`, `config.js`, and `utils/telemetry.js`, replacing them with env-only or secret-store-backed behavior.
- Add a deployment/readiness smoke check that verifies each runtime mode has the infra it requires before deployment.
- Move broadcast execution from in-memory admin runtime state to a durable queue/worker path.

### P1

- Extract platform webhook handlers and AI reply orchestration out of `index.js` into explicit modules with typed interfaces.
- Consolidate order, follow-up, and notification rule logic into clearer bounded services.
- Normalize deployment docs so local single-process usage is clearly separated from multi-runtime production.

### P2

- Add generated route inventory and schema validation steps to CI.
- Add typed contracts for admin Socket.IO events, queue payloads, and instruction AI SSE payloads.
- Reduce legacy instruction/document bootstrap that is still loaded during HTTP startup.
