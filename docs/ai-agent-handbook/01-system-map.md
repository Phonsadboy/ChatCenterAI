# Phase 1: System Map

## Purpose

This document maps the repo at a subsystem level so a new agent can decide where to start reading for any task without guessing.

## Source-of-Truth Files

- `package.json`
- `index.js`
- `runtime/*.js`
- `infra/*.js`
- `services/*.js`
- `services/repositories/*.js`
- `workers/*.js`
- `migrations/postgres/*.sql`
- `views/*.ejs`
- `public/js/*.js`
- `public/css/*.css`

## Current Behavior

Source: directory structure under the paths above, plus `runtime/entrypoint.js` and `index.js`.

### Repo Topology

| Path | Responsibility |
| --- | --- |
| `index.js` | Main application kernel: Express app, HTTP server, Socket.IO, runtime orchestration exports, route handlers, webhook handlers, AI pipelines, background-job helpers |
| `runtime/` | Mode-specific entrypoints and bootstrap helpers |
| `infra/` | Shared infrastructure for Postgres, Redis, BullMQ, route guards, event bus, conversation buffer/lock, session store, bucket storage |
| `services/` | Higher-level services such as instruction RAG/search, instruction chat tooling, conversation thread aggregation, notifications, SlipOK |
| `services/repositories/` | Postgres-backed repositories and sync helpers; most implement Mongo-like interfaces on top of Postgres |
| `workers/` | BullMQ worker entrypoints for realtime queue flush and batch schedulers |
| `migrations/postgres/` | Schema and index history; the authoritative database contract |
| `views/` | EJS admin pages and partials |
| `public/js/` | Page-specific frontend logic |
| `public/css/` | Shared theme plus page-specific admin styles |
| `scripts/` | Migration runners and guardrail scripts |
| `docs/` | Existing human-oriented docs; useful context, not primary truth |
| `docs-oreder/` | Legacy order-related docs |

### Architecture Split: Runtime vs Logic

Source: `runtime/admin-app.js`, `runtime/public-ingest.js`, `runtime/worker-realtime.js`, `runtime/worker-batch.js`, `runtime/migration-runner.js`, `index.js`.

Observed architecture:

- Deployment is runtime-split.
- Business logic is not yet module-split.
- `index.js` still owns the majority of the application surface and exports functions used by workers.

Practical consequence:

- Read runtime files to understand who boots what.
- Read `index.js` to understand what the system actually does.

### Major Subsystems

Source: `index.js`, `services/*.js`, `services/repositories/*.js`, `views/*.ejs`.

| Subsystem | Main entrypoints | Primary storage | Main UI/API surface |
| --- | --- | --- | --- |
| Runtime bootstrap | `runtime/entrypoint.js`, `runtime/bootstrap-runtime.js`, `runtime/health-server.js` | PostgreSQL migration tables, Redis | `/health` on HTTP runtimes; standalone health server for workers |
| Messaging/webhooks | Platform webhook routes in `index.js`, `workers/realtime.js` | `webhook_events`, `contacts`, `threads`, `messages`, Redis buffer/lock/dedupe keys | `/webhook/*`, admin chat pages |
| Chat/admin realtime | `index.js`, `infra/adminRealtime.js`, `infra/eventBus.js` | `messages`, `user_unread_counts`, `user_tags`, `active_user_status`, Socket.IO room `admin` | `/admin/chat`, `/admin/chat/*` |
| Instructions V2 and assets | `index.js`, `services/instructionChatService.js`, `services/instructionDataService.js` | `instructions`, `instruction_versions`, `instruction_assets`, `image_collections`, bucket/local assets | `/admin/dashboard`, `/api/instructions-v2*`, `/admin/instructions*` |
| Instruction AI and conversation history | `services/instructionChatService.js`, `services/instructionRAGService.js`, `services/conversationThreadService.js` | `instruction_chat_*`, `conversation_threads`, `messages`, `orders` | `/admin/instruction-ai`, `/admin/instruction-conversations`, `/api/instruction-ai*` |
| Orders | `index.js`, `services/repositories/orderRepository.js` | `orders`, `order_items`, `follow_up_page_settings` | `/admin/orders`, `/admin/orders/*`, AI order tools |
| Follow-up | `index.js`, `workers/batch.js`, `services/repositories/followUpRepository.js` | `follow_up_tasks`, `follow_up_status`, `follow_up_page_settings` | `/admin/followup`, `/admin/followup/*` |
| Broadcast | `index.js` `BroadcastQueue` class | `broadcast_history`, bucket storage for uploaded images | `/admin/broadcast`, `/admin/broadcast/*` |
| Notifications | `services/notificationService.js`, notification routes in `index.js` | `notification_channels`, `notification_logs`, `line_bot_groups`, `short_links` | `/admin/api/notification-*` |
| Bot management | Bot routes in `index.js`, `services/repositories/botRepository.js` | `bots`, `bot_secrets` | `/api/line-bots*`, `/api/facebook-bots*`, `/api/instagram-bots*`, `/api/whatsapp-bots*` |
| Categories | `services/repositories/categoryRepository.js` | `categories`, `category_tables` | `/admin/categories`, `/admin/api/categories*` |
| Facebook comment automation | `index.js`, dedicated repositories | `facebook_comment_policies`, `facebook_page_posts`, `facebook_comment_events` | `/admin/facebook-posts`, `/api/facebook-posts*`, `/api/facebook-bots/:id/comment-policy` |

### Reading Order by Task

Source: subsystem entrypoints listed above.

| If the task is about... | Start here | Then read |
| --- | --- | --- |
| Runtime boot failure | `runtime/entrypoint.js` | `runtime/bootstrap-runtime.js`, `infra/runtimeConfig.js`, `index.js` |
| A broken webhook | Platform webhook route in `index.js` | `infra/dedupe.js`, `infra/conversationBuffer.js`, `workers/realtime.js`, `services/repositories/chatRepository.js` |
| Chat reply quality or AI behavior | `processFlushedMessages()` in `index.js` | `processMessageWithAI()`, `processFacebookMessageWithAI()`, instruction selection helpers |
| Admin chat bug | `/admin/chat` routes in `index.js` | `views/admin-chat.ejs`, `public/js/chat-redesign.js`, user state repositories |
| Instruction editing or AI tool behavior | `/api/instructions-v2*` and `/api/instruction-ai*` in `index.js` | `services/instructionChatService.js`, `services/instructionRAGService.js`, instruction repositories/state tables |
| Order extraction | `analyzeOrderFromChat()` in `index.js` | `saveOrderToDatabase()`, `services/repositories/orderRepository.js`, `services/notificationService.js` |
| Follow-up scheduling | `processDueFollowUpTasks()` in `index.js` | `workers/batch.js`, `services/repositories/followUpRepository.js`, follow-up page settings |
| Broadcast delivery | `BroadcastQueue` in `index.js` | `/admin/broadcast*`, bucket storage helpers, `broadcast_history` |
| Notification summary | `evaluateNotificationSummarySchedules()` in `index.js` | `services/notificationService.js`, `services/repositories/notificationRepository.js` |
| Bot config or page bindings | Platform bot routes in `index.js` | `services/repositories/botRepository.js`, `services/repositories/postgresBotSync.js` |

## Dependencies

Source: `package.json`, `index.js`, `services/*.js`.

High-level dependency edges:

- The runtime layer depends on Postgres bootstrap and, for some modes, Redis queue/dedupe guarantees.
- The repositories depend on Postgres and frequently wrap JSONB-heavy records.
- The service layer depends on repositories and helper functions from `index.js`.
- The frontend depends on EJS-rendered data and JSON endpoints implemented directly in `index.js`.
- The worker layer depends on exported functions from `index.js`, not a separate application service layer.

## Data Flow

Source: `runtime/*.js`, `workers/*.js`, `infra/*.js`, `index.js`.

### Boot Flow

1. `runtime/entrypoint.js` reads `CCAI_RUNTIME_MODE`.
2. The selected runtime file calls `ensureRuntimeReady()` when appropriate.
3. `admin-app` and `public-ingest` start the shared HTTP server through `startServer()` in `index.js`.
4. Worker runtimes start BullMQ workers or a health-only idle process.

### HTTP/Admin Flow

1. Express app is created in `index.js`.
2. `helmet`, `cors`, static asset handlers, and runtime route guards are attached.
3. EJS pages render admin shells.
4. Frontend scripts call JSON endpoints in `index.js`.
5. Mutations use repositories and may emit admin Socket.IO events.

### Webhook/Message Flow

1. Platform webhook route accepts inbound event.
2. Event is deduped and optionally recorded in Postgres.
3. Message content is normalized and queued.
4. Realtime worker or in-process queue flush calls `processFlushedMessages()`.
5. AI response or control flow sends platform messages and persists assistant history.
6. Admin clients receive realtime updates via `emitAdminEvent()`.

## Hotspots

Source: `index.js`, `services/repositories/*.js`, `runtime/*.js`.

- `index.js` is both controller layer and orchestration layer.
- Repository interfaces emulate Mongo-style filter semantics on top of Postgres; do not assume a standard ORM model.
- Runtime ownership is split, but helper functions in `index.js` still assume shared process state in several places.
- Background tasks exist in both dedicated workers and optional legacy intervals.

## Safe-Change Rules

Source: `runtime/*.js`, `index.js`, `workers/*.js`, `infra/*.js`.

- Before changing a subsystem, identify whether it is called from HTTP routes, worker exports, or both.
- Do not move logic out of `index.js` blindly without checking the worker imports at the bottom of the file.
- Preserve admin event names until all consumers in `public/js/` are updated.
- Preserve route paths and legacy string identifiers unless a migration plan exists.

## Known Gaps

Source: `index.js`, `docs/`, `DOCKER.md`.

- The repo still contains legacy naming that can mislead an agent into assuming Mongo or single-runtime behavior.
- Some existing docs assume older flows.
- There is no global architectural test that verifies runtime boundaries.

## Risk Notes

Source: `index.js`, `runtime/*.js`, `workers/*.js`.

- The biggest system-map risk is reading runtime files only and missing that most business logic still lives in `index.js`.
- Worker imports from `index.js` mean feature refactors can silently break non-HTTP runtimes.
- Repo topology looks modular at a folder level, but runtime ownership is still only partially separated.

## Checkpoint Summary

Source: `index.js`, `runtime/*.js`, `services/*.js`, `services/repositories/*.js`.

- The main subsystems, entrypoints, and storage owners are mapped.
- A new agent can now choose a starting file for runtime, webhook, admin UI, instruction, order, follow-up, broadcast, notification, bot, or category work.
- The main architectural split is explicit: deployment is multi-runtime, but the main logic kernel is still monolithic.

## Next Actions

- Read `02-runtime-env-deploy.md` before changing runtime wiring.
- Read `03-data-model-storage.md` before editing repositories or schema-dependent code.
- Read the relevant domain deep-dive before modifying queue, AI, order, or asset behavior.
