# Phase 3: Data Model and Storage

## Purpose

This document maps the current persistence layer: PostgreSQL tables, Redis keys, bucket/local asset storage, and the repository modules that own each data set.

## Source-of-Truth Files

- `migrations/postgres/*.sql`
- `infra/postgres.js`
- `infra/redis.js`
- `infra/queues.js`
- `infra/conversationBuffer.js`
- `infra/conversationLock.js`
- `infra/dedupe.js`
- `infra/sessionStore.js`
- `infra/storage/bucketStorage.js`
- `services/repositories/*.js`
- `index.js`
- `scripts/run-postgres-migrations.js`
- `scripts/verify-pg-safety.js`
- `scripts/verify-no-mongo.js`

## Current Behavior

Source: migration files and repository implementations listed above.

### Storage Layers

| Layer | What it stores | Main owners |
| --- | --- | --- |
| PostgreSQL | All canonical application data | Repository modules under `services/repositories/` plus some direct SQL in `index.js` and `utils/auth.js` |
| Redis | Sessions, BullMQ queues, conversation buffers, distributed conversation locks, event dedupe, admin event bus pub/sub | `infra/redis.js`, `infra/queues.js`, `infra/conversationBuffer.js`, `infra/conversationLock.js`, `infra/dedupe.js`, `infra/eventBus.js`, `infra/sessionStore.js` |
| S3-compatible bucket | Instruction assets, follow-up assets, broadcast assets | `infra/storage/bucketStorage.js`, asset helpers in `index.js` |
| Local asset cache | Static serving fallback and warmed follow-up copies | `ASSETS_DIR`, `FOLLOWUP_ASSETS_DIR`, asset helpers in `index.js` |

### PostgreSQL Domain Map

Source: `migrations/postgres/001_initial_schema.sql` through `018_broadcast_audience_indexes.sql`.

| Domain | Tables |
| --- | --- |
| Bots and secrets | `bots`, `bot_secrets` |
| Contacts and message history | `contacts`, `threads`, `messages`, `message_media` |
| Orders | `orders`, `order_items` |
| Global settings and API keys | `settings`, `api_keys`, `usage_logs` |
| Instructions and assets | `instructions`, `instruction_versions`, `instruction_assets`, `image_collections`, `image_collection_items` |
| Follow-up | `follow_up_tasks`, `follow_up_status`, `follow_up_page_settings` |
| Notifications and outbound delivery | `notification_channels`, `notification_logs`, `outbound_messages`, `short_links` |
| Webhook bookkeeping | `webhook_events`, `webhook_event_idempotency` |
| Support/admin state | `active_user_status`, `user_tags`, `user_purchase_status`, `chat_feedback`, `user_notes`, `admin_passcodes`, `user_unread_counts`, `user_flow_history`, `broadcast_history` |
| Conversation analytics | `conversation_threads` |
| Instruction AI state | `instruction_chat_changelog`, `instruction_chat_sessions`, `instruction_chat_audit` |
| Categories | `categories`, `category_tables` |
| LINE groups | `line_bot_groups` |
| Facebook comment automation | `facebook_comment_policies`, `facebook_page_posts`, `facebook_comment_events` |
| Migration coordination | `schema_migrations`, `migration_checkpoints` |

### Partitioned Tables

Source: `migrations/postgres/001_initial_schema.sql`.

Three high-volume tables are partition-aware:

- `messages`
- `usage_logs`
- `webhook_events`

The initial migration creates a default partition for each and also creates monthly partitions dynamically in SQL. Agents touching insert/update/query behavior for these tables should treat partitioning as part of the schema contract.

### Repository Ownership Map

Source: repository files under `services/repositories/`.

| Repository | Primary tables / records |
| --- | --- |
| `botRepository.js` | `bots`, `bot_secrets` |
| `chatRepository.js` | `contacts`, `threads`, `messages`, `message_media` |
| `orderRepository.js` + `postgresOrderSync.js` | `orders`, `order_items` |
| `profileRepository.js` | `contacts` profile fields |
| `settingsRepository.js` | `settings` |
| `notificationRepository.js` | `notification_channels`, `notification_logs` |
| `followUpRepository.js` | `follow_up_tasks`, `follow_up_status` |
| `followUpPageSettingsRepository.js` | `follow_up_page_settings` |
| `userStateRepository.js` | `active_user_status`, `user_tags`, `user_purchase_status` |
| `feedbackRepository.js` | `chat_feedback` |
| `lineGroupRepository.js` | `line_bot_groups` |
| `conversationThreadRepository.js` | `conversation_threads` |
| `instructionChatStateRepository.js` | `instruction_chat_changelog`, `instruction_chat_sessions`, `instruction_chat_audit` |
| `categoryRepository.js` | `categories`, `category_tables` |
| `facebookCommentPolicyRepository.js` | `facebook_comment_policies` |
| `facebookCommentAutomationRepository.js` | `facebook_page_posts`, `facebook_comment_events` |
| `webhookEventRepository.js` | `webhook_event_idempotency`, `webhook_events` |
| `outboundMessageRepository.js` | `outbound_messages` |

### Redis Key Map

Source: `infra/conversationBuffer.js`, `infra/conversationLock.js`, `infra/dedupe.js`, `infra/eventBus.js`, `infra/sessionStore.js`.

| Key / channel | Purpose |
| --- | --- |
| `ccai:conversation:<queueKey>:messages` | Buffered inbound messages awaiting flush |
| `ccai:conversation:<queueKey>:context` | Serialized queue context for buffered messages |
| `ccai:conversation:<queueKey>:user` | Queue owner id |
| `ccai:conversation:<queueKey>:scheduled` | Flush scheduling dedupe key |
| `ccai:conversation-lock:<lockId>` | Distributed lock per conversation identity |
| `ccai:processed-event:<eventId>` | Idempotency marker for webhook/message events |
| `ccai:admin-events` | Redis pub/sub channel used to bridge admin Socket.IO events across runtimes |
| `ccai:sess:*` | Express session data when Redis session store is enabled |

### Bucket and Local Asset Storage

Source: `infra/storage/bucketStorage.js`, asset helpers and routes in `index.js`.

Current storage behavior:

- Instruction assets can be served from bucket or local copies through `/assets/instructions/:fileName`.
- Follow-up assets can be served from bucket or local copies through `/assets/followup/:fileName`.
- Broadcast uploads are stored under the `broadcast` storage prefix and served through `/broadcast/assets/:filename`.
- Follow-up assets may be warmed into local cache on startup when bucket storage is configured.

## Dependencies

Source: `infra/postgres.js`, `infra/runtimeConfig.js`, `infra/redis.js`, `infra/storage/bucketStorage.js`.

- PostgreSQL connection setup is centralized in `infra/postgres.js`.
- Redis connection setup is centralized in `infra/redis.js`.
- BullMQ uses dedicated Redis connections created through `infra/queues.js`.
- Bucket storage depends on `STORAGE_*` env vars and is wrapped by `infra/storage/bucketStorage.js`.

## Data Flow

Source: repositories and infra helpers listed above.

### Write Path Pattern

Most data writes follow one of three patterns:

1. Route/service calls a repository method that writes to a Postgres table directly.
2. Route/service calls helper logic in `index.js`, which then calls repositories and sometimes direct SQL.
3. Platform event is normalized first, then persisted through a repository or direct SQL helper.

### Identifier Pattern

Source: migrations and repository implementations.

The application uses dual identifiers heavily:

- Internal rows often use UUID primary keys.
- Most repository/public surfaces still use legacy string ids such as `legacy_bot_id`, `legacy_contact_id`, `legacy_order_id`, `legacy_message_id`, and `thread_id`.

Agents should assume legacy string ids are still part of the external contract.

### Postgres-as-Document Pattern

Source: multiple repositories, especially `botRepository.js`, `orderRepository.js`, `notificationRepository.js`, `followUpRepository.js`, `conversationThreadRepository.js`.

Many records are partly relational and partly document-shaped:

- Key fields are promoted into typed columns for filtering/indexing.
- Full or partial payloads are also stored in JSONB columns such as `config`, `order_data`, `settings`, `payload`, `status`, `instruction_refs`, and `instruction_meta`.

This means schema changes often require both SQL migration changes and JSON payload normalization changes.

## Hotspots

Source: `migrations/postgres/*.sql`, repository implementations, `scripts/verify-pg-safety.js`.

- Several repositories still expose Mongo-like filter semantics even though the backing store is Postgres.
- JSONB duplication can make it unclear whether a field is authoritative in the typed column or inside payload JSON.
- `follow_up_status` semantics changed during Mongo cutover; `011_mongo_cutover_guardrails.sql` adds the new uniqueness/indexing model.
- Direct SQL still exists outside repositories for some admin/support tables, so repository ownership is not exclusive.

## Safe-Change Rules

Source: migration files, repository implementations, `infra/postgres.js`.

- Add schema changes through new migration files only.
- Preserve legacy id fields even if UUID relations already exist.
- Before changing a repository filter contract, inspect whether callers rely on Mongo-style operators such as `$in`, `$gte`, `$lte`, `$regex`, and `$exists`.
- Keep Redis key semantics stable unless all related producers and consumers are updated together.

## Known Gaps

Source: repository code and migration history.

- There is no single generated schema reference in the repo; migrations are the schema source.
- Some write paths still bypass repository modules.
- JSONB payload contracts are implicit and not centrally typed.

## Risk Notes

Source: `migrations/postgres/*.sql`, `services/repositories/*.js`, `infra/*.js`.

- Dual identifiers are a recurring hazard. UUID primary keys exist, but legacy string ids remain part of public and repository contracts.
- JSONB-heavy storage can hide field-authority conflicts between typed columns and embedded payloads.
- Redis keys are part of the data contract, not just cache internals, because workers and HTTP runtimes coordinate through them.

## Checkpoint Summary

Source: `migrations/postgres/*.sql`, `infra/*.js`, `services/repositories/*.js`.

- PostgreSQL, Redis, bucket storage, and session storage are mapped to their owning modules.
- Repository-to-table ownership is documented for the main data domains.
- The current persistence contract is now explicit enough for an agent to change storage behavior without guessing where the source of truth lives.

## Next Actions

- Create generated schema snapshots or typed table contracts if future work increases database change frequency.
- Reduce direct SQL in `index.js` by moving remaining support-state logic behind repositories.
- Decide which JSONB payloads are temporary compatibility layers and which are long-term contracts.
