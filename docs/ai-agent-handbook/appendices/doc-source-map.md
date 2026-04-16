# Appendix: Documentation Source Map

## Purpose

This appendix maps each handbook document to the repo files it depends on most heavily so future agents can update the right handbook page when they change code, migrations, deployment, or UI surfaces.

## Source-of-Truth Files

- `docs/ai-agent-handbook/*.md`
- `docs/ai-agent-handbook/domains/*.md`
- `docs/ai-agent-handbook/appendices/*.md`
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

Source: handbook files and repo files listed above.

### Handbook-to-Source Mapping

| Handbook doc | Primary source files | Why they matter most |
| --- | --- | --- |
| `README.md` | `index.js`, `runtime/*.js`, `infra/*.js`, `services/repositories/*.js`, `migrations/postgres/*.sql`, `views/*.ejs`, `public/js/*.js`, `env.example`, `Dockerfile`, `railway*.json` | Defines the trust hierarchy, reading order, and documentation contract |
| `01-system-map.md` | `index.js`, `runtime/*.js`, `infra/*.js`, `services/*.js`, `services/repositories/*.js`, `workers/*.js`, `views/*.ejs`, `public/js/*.js` | Maps repo topology, subsystem ownership, and reading order by task |
| `02-runtime-env-deploy.md` | `runtime/*.js`, `infra/runtimeConfig.js`, `infra/runtimeRouteGuard.js`, `infra/postgres.js`, `infra/redis.js`, `infra/sessionStore.js`, `env.example`, `Dockerfile`, `docker-compose.yml`, `railway*.json`, `nixpacks.toml`, `Procfile` | Captures boot sequence, runtime modes, env requirements, and deployment topology |
| `03-data-model-storage.md` | `migrations/postgres/*.sql`, `infra/postgres.js`, `infra/redis.js`, `infra/queues.js`, `infra/conversationBuffer.js`, `infra/conversationLock.js`, `infra/dedupe.js`, `infra/sessionStore.js`, `infra/storage/bucketStorage.js`, `services/repositories/*.js` | Captures Postgres, Redis, bucket storage, and repository ownership |
| `04-api-ui-surface.md` | `index.js`, `views/*.ejs`, `views/partials/*.ejs`, `public/js/*.js`, `public/css/*.css`, `infra/adminRealtime.js`, `infra/eventBus.js`, `infra/runtimeRouteGuard.js` | Maps public/admin routes, page ownership, assets, and Socket.IO contract |
| `domains/05-chat-and-webhooks.md` | `index.js`, `workers/realtime.js`, `infra/conversationBuffer.js`, `infra/conversationLock.js`, `infra/dedupe.js`, `infra/adminRealtime.js`, `infra/eventBus.js`, `services/repositories/chatRepository.js`, `services/repositories/webhookEventRepository.js`, `services/repositories/outboundMessageRepository.js`, `services/repositories/lineGroupRepository.js` | Covers inbound messaging, queueing, dedupe, locks, persistence, and admin realtime |
| `domains/06-instruction-ai-and-conversation-history.md` | `index.js`, `services/instructionChatService.js`, `services/instructionRAGService.js`, `services/conversationThreadService.js`, `services/repositories/instructionChatStateRepository.js`, `services/repositories/conversationThreadRepository.js`, `migrations/postgres/016_conversation_threads.sql`, `migrations/postgres/017_instruction_chat_state.sql`, instruction admin views and scripts | Covers instruction AI, versioning, RAG, session/changelog state, and thread analytics |
| `domains/07-orders-followup-broadcast-notifications.md` | `index.js`, `workers/batch.js`, `services/notificationService.js`, `services/slipOkService.js`, `services/repositories/orderRepository.js`, `services/repositories/followUpRepository.js`, `services/repositories/followUpPageSettingsRepository.js`, `services/repositories/notificationRepository.js`, `services/repositories/outboundMessageRepository.js`, `migrations/postgres/003_followup_read_indexes.sql`, `006_followup_page_settings.sql`, `007_notification_indexes.sql`, `018_broadcast_audience_indexes.sql` | Covers order extraction, follow-up tasks, broadcast lifecycle, notifications, and SlipOK |
| `domains/08-bots-assets-categories.md` | `index.js`, `services/repositories/botRepository.js`, `services/repositories/postgresBotSync.js`, `services/repositories/categoryRepository.js`, `services/repositories/lineGroupRepository.js`, `services/repositories/facebookCommentPolicyRepository.js`, `services/repositories/facebookCommentAutomationRepository.js`, `infra/storage/bucketStorage.js`, `migrations/postgres/013_categories_tables.sql`, `014_facebook_comment_policies.sql`, `015_facebook_posts_and_events.sql`, settings/category views and scripts | Covers bot CRUD, assets, image collections, categories, LINE groups, and Facebook comment automation state |
| `09-ops-risk-and-backlog.md` | `index.js`, `config.js`, `utils/telemetry.js`, `runtime/*.js`, `infra/*.js`, `workers/*.js`, `migrations/postgres/*.sql`, `scripts/verify-no-mongo.js`, `scripts/verify-pg-safety.js`, deployment manifests | Aggregates security debt, cutover state, operational hazards, and prioritized backlog |
| `appendices/route-inventory.md` | `index.js`, `views/*.ejs`, `public/js/*.js`, `public/css/*.css`, `infra/runtimeRouteGuard.js` | Enumerates the HTTP surface and active template-to-asset mappings |
| `appendices/schema-table-index.md` | `migrations/postgres/*.sql`, `infra/postgres.js`, `runtime/bootstrap-runtime.js`, `scripts/run-postgres-migrations.js`, `utils/auth.js` | Maps migration history and table ownership |
| `appendices/doc-source-map.md` | All handbook docs plus the repo files they reference | Explains documentation coverage and maintenance boundaries |

### Change-to-Doc Maintenance Rules

| If you change... | Update these handbook docs |
| --- | --- |
| Runtime mode behavior, route guards, boot flags, deploy manifests | `README.md`, `02-runtime-env-deploy.md`, `09-ops-risk-and-backlog.md` |
| Postgres schema, migration strategy, repository table ownership | `03-data-model-storage.md`, `appendices/schema-table-index.md`, `09-ops-risk-and-backlog.md` |
| Public/admin routes or page render targets | `04-api-ui-surface.md`, `appendices/route-inventory.md` |
| Chat/webhook/queue/dedupe/lock behavior | `domains/05-chat-and-webhooks.md`, `04-api-ui-surface.md`, `09-ops-risk-and-backlog.md` if the change is operationally risky |
| Instruction AI, thread analytics, versioning, RAG | `domains/06-instruction-ai-and-conversation-history.md`, `04-api-ui-surface.md`, `09-ops-risk-and-backlog.md` if the change affects risk posture |
| Orders, follow-up, broadcast, notifications, SlipOK | `domains/07-orders-followup-broadcast-notifications.md`, `04-api-ui-surface.md`, `09-ops-risk-and-backlog.md` |
| Bot CRUD, assets, image collections, categories, Facebook comment policies | `domains/08-bots-assets-categories.md`, `04-api-ui-surface.md`, `appendices/route-inventory.md` if routes change |
| Secret handling, telemetry, cutover cleanup, operational backlog | `09-ops-risk-and-backlog.md`, `README.md` if source-of-truth hierarchy changes |

## Dependencies

Source: all handbook docs and the repo files mapped above.

- Every handbook page depends on repo state staying aligned with the files listed in its source map.
- `index.js` is the single biggest shared dependency because it affects most docs directly.
- Migration files, runtime config, and templates are the next most common inputs.

## Data Flow

Source: the mapping tables above.

1. Code, migrations, templates, and deployment files change.
2. The corresponding handbook page becomes stale unless it is updated in the same change set.
3. Appendices provide inventories that help detect drift.
4. `09-ops-risk-and-backlog.md` absorbs cross-cutting risk changes when a local edit changes overall operational posture.

## Hotspots

Source: `index.js`, `migrations/postgres/*.sql`, `runtime/*.js`, `views/*.ejs`.

- `index.js` affects nearly every handbook page.
- Route changes ripple into both the main surface doc and the route appendix.
- Migration changes ripple into both the storage doc and the schema appendix.
- Deployment changes ripple into the runtime doc and the ops backlog.

## Safe-Change Rules

Source: the mapping tables above.

- When changing a source file listed in a doc's primary source set, check whether the matching handbook file also needs an update.
- Prefer updating the specific phase/domain doc plus any appendix it feeds, instead of only editing the ops backlog.
- If a file change affects more than one domain, update the shared docs first and then the domain deep-dives.

## Known Gaps

Source: current handbook maintenance model.

- This source map is manual and can drift if new docs or source files are added without updating it.
- The repo has no automated enforcement that source changes must update the handbook.
- Some changes span multiple domains and still require judgment about which docs need edits.

## Risk Notes

Source: the mapping tables above and the code layout they describe.

- Documentation drift is most likely when a change touches `index.js`, migration files, or deployment manifests because those files feed multiple handbook docs at once.
- Agents may under-update the handbook if they only patch one local doc instead of following the source map.
- Appendices can become stale quietly because they summarize broad surfaces rather than one feature.

## Checkpoint Summary

Source: all handbook docs and the mapping tables above.

- Every handbook page now has an explicit source map back to the repo.
- The source map also defines which docs need updates for common categories of code change.
- A future agent can maintain the handbook incrementally instead of re-scanning the entire codebase on every edit.

## Next Actions

- Add a handbook-maintenance checklist to the PR template or contribution guide.
- Add lightweight CI or lint checks that flag route or migration changes without corresponding handbook updates.
- Revisit this source map whenever new phase docs or appendices are added.
