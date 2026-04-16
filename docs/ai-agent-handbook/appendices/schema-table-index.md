# Appendix: Schema Table Index

## Purpose

This appendix indexes the PostgreSQL schema by migration and by table so future agents can identify where a table or index came from before editing repository code or writing a new migration.

## Source-of-Truth Files

- `migrations/postgres/*.sql`
- `infra/postgres.js`
- `runtime/bootstrap-runtime.js`
- `scripts/run-postgres-migrations.js`
- `scripts/verify-pg-safety.js`
- `utils/auth.js`

## Current Behavior

Source: `migrations/postgres/001_initial_schema.sql` through `018_broadcast_audience_indexes.sql`, plus `infra/postgres.js`.

The schema currently evolves through 18 SQL migration files in `migrations/postgres/`. `infra/postgres.js` also maintains the runtime `schema_migrations` table that tracks which migration files have been applied.

### Migration Timeline

| Migration | Tables added or changed | Indexes / notes |
| --- | --- | --- |
| `001_initial_schema.sql` | Adds `bots`, `bot_secrets`, `contacts`, `threads`, `messages`, `messages_default`, `message_media`, `orders`, `order_items`, `settings`, `instructions`, `instruction_versions`, `instruction_assets`, `image_collections`, `image_collection_items`, `follow_up_tasks`, `follow_up_status`, `notification_channels`, `notification_logs`, `api_keys`, `usage_logs`, `usage_logs_default`, `webhook_events`, `webhook_events_default`, `webhook_event_idempotency`, `outbound_messages`, `short_links`, `migration_checkpoints` | Adds `idx_threads_contact`, `idx_messages_thread_time`, `idx_orders_platform_time`, `idx_usage_logs_bot_time`, `idx_webhook_events_platform_time`, `idx_webhook_events_idempotency_key`; establishes partition-aware `messages`, `usage_logs`, and `webhook_events` tables with default partitions |
| `002_chat_read_indexes.sql` | No new tables | Adds `idx_messages_contact_time`, `idx_contacts_legacy_contact_id` |
| `003_followup_read_indexes.sql` | No new tables | Adds `idx_follow_up_status_contact_updated`, `idx_follow_up_tasks_contact_updated`, `idx_follow_up_tasks_next_scheduled`, `idx_follow_up_tasks_date_key` |
| `004_chat_support_state_tables.sql` | Adds `active_user_status`, `user_tags`, `user_purchase_status`, `chat_feedback` | Adds `idx_active_user_status_updated`, `idx_user_purchase_status_updated`, `idx_chat_feedback_contact_updated`, `idx_chat_feedback_platform_updated` |
| `005_contact_profile_indexes.sql` | No new tables | Adds `idx_contacts_legacy_contact_updated` |
| `006_followup_page_settings.sql` | Adds `follow_up_page_settings` | Adds `idx_follow_up_page_settings_platform_updated` |
| `007_notification_indexes.sql` | No new tables | Adds `idx_notification_channels_type_active`, `idx_notification_channels_sender_bot`, `idx_notification_channels_group_id`, `idx_notification_logs_created_at`, `idx_notification_logs_status_created_at` |
| `008_messages_thread_time_index.sql` | No new tables | Re-adds or tightens `idx_messages_thread_time` |
| `009_user_notes.sql` | Adds `user_notes` | Adds `idx_user_notes_updated_at` |
| `010_chat_user_summary_perf.sql` | No new tables | Adds `idx_threads_updated_at_desc` |
| `011_mongo_cutover_guardrails.sql` | Adds `line_bot_groups`; alters `short_links` and `follow_up_status` | Adds `idx_short_links_target_url`, `idx_line_bot_groups_bot_status_event`, `idx_follow_up_status_scope`; introduces cutover guardrails |
| `012_support_state_tables.sql` | Adds `admin_passcodes`, `user_unread_counts`, `user_flow_history`, `broadcast_history` | Adds `idx_admin_passcodes_active`, `idx_admin_passcodes_created_at`, `idx_broadcast_history_updated_at` |
| `013_categories_tables.sql` | Adds `categories`, `category_tables` | Adds `idx_categories_active_name`, `idx_categories_bot_created_at`, `idx_categories_active_created_at`, `idx_category_tables_bot_updated_at` |
| `014_facebook_comment_policies.sql` | Adds `facebook_comment_policies` | Adds `idx_facebook_comment_policies_bot_status`, `idx_facebook_comment_policies_page_scope` |
| `015_facebook_posts_and_events.sql` | Adds `facebook_page_posts`, `facebook_comment_events` | Adds `idx_facebook_page_posts_bot_created`, `idx_facebook_page_posts_page_comment`, `idx_facebook_comment_events_post_created`, `idx_facebook_comment_events_bot_action` |
| `016_conversation_threads.sql` | Adds `conversation_threads` | Adds `idx_conversation_threads_instruction_refs`, `idx_conversation_threads_instruction_meta`, `idx_conversation_threads_tags`, `idx_conversation_threads_products`, `idx_conversation_threads_sender_bot_platform`, `idx_conversation_threads_outcome_updated` |
| `017_instruction_chat_state.sql` | Adds `instruction_chat_changelog`, `instruction_chat_sessions`, `instruction_chat_audit` | Adds `idx_instruction_chat_changelog_session_timestamp`, `idx_instruction_chat_changelog_instruction_timestamp`, `idx_instruction_chat_sessions_instruction_updated`, `idx_instruction_chat_audit_instruction_timestamp`, `idx_instruction_chat_audit_session_timestamp` |
| `018_broadcast_audience_indexes.sql` | No new tables | Adds `idx_orders_platform_user`, `idx_orders_user`, `idx_orders_bot_user` |

### Table Index

| Table | Introduced by | Main owner(s) |
| --- | --- | --- |
| `active_user_status` | `004_chat_support_state_tables.sql` | `services/repositories/userStateRepository.js` |
| `admin_passcodes` | `012_support_state_tables.sql` | `utils/auth.js` plus passcode routes in `index.js` |
| `api_keys` | `001_initial_schema.sql` | OpenAI key routes in `index.js` and settings-related helpers |
| `bot_secrets` | `001_initial_schema.sql` | `services/repositories/postgresBotSync.js`, `services/repositories/botRepository.js` |
| `bots` | `001_initial_schema.sql` | `services/repositories/postgresBotSync.js`, `services/repositories/botRepository.js` |
| `broadcast_history` | `012_support_state_tables.sql` | `BroadcastQueue` in `index.js` |
| `categories` | `013_categories_tables.sql` | `services/repositories/categoryRepository.js` |
| `category_tables` | `013_categories_tables.sql` | `services/repositories/categoryRepository.js` |
| `chat_feedback` | `004_chat_support_state_tables.sql` | `services/repositories/feedbackRepository.js` |
| `contacts` | `001_initial_schema.sql` | `services/repositories/chatRepository.js`, `services/repositories/profileRepository.js` |
| `conversation_threads` | `016_conversation_threads.sql` | `services/conversationThreadService.js`, `services/repositories/conversationThreadRepository.js` |
| `facebook_comment_events` | `015_facebook_posts_and_events.sql` | `services/repositories/facebookCommentAutomationRepository.js` |
| `facebook_comment_policies` | `014_facebook_comment_policies.sql` | `services/repositories/facebookCommentPolicyRepository.js` |
| `facebook_page_posts` | `015_facebook_posts_and_events.sql` | `services/repositories/facebookCommentAutomationRepository.js` |
| `follow_up_page_settings` | `006_followup_page_settings.sql` | `services/repositories/followUpPageSettingsRepository.js` |
| `follow_up_status` | `001_initial_schema.sql`, altered in `011_mongo_cutover_guardrails.sql` | `services/repositories/followUpRepository.js` |
| `follow_up_tasks` | `001_initial_schema.sql` | `services/repositories/followUpRepository.js` |
| `image_collection_items` | `001_initial_schema.sql` | Image-collection helpers in `index.js` |
| `image_collections` | `001_initial_schema.sql` | Image-collection helpers in `index.js` |
| `instruction_assets` | `001_initial_schema.sql` | Instruction asset helpers in `index.js` |
| `instruction_chat_audit` | `017_instruction_chat_state.sql` | `services/repositories/instructionChatStateRepository.js` |
| `instruction_chat_changelog` | `017_instruction_chat_state.sql` | `services/repositories/instructionChatStateRepository.js` |
| `instruction_chat_sessions` | `017_instruction_chat_state.sql` | `services/repositories/instructionChatStateRepository.js` |
| `instruction_versions` | `001_initial_schema.sql` | Instruction version helpers in `index.js` and `InstructionChatService` |
| `instructions` | `001_initial_schema.sql` | Instruction V2 storage helpers in `index.js` |
| `line_bot_groups` | `011_mongo_cutover_guardrails.sql` | `services/repositories/lineGroupRepository.js` |
| `message_media` | `001_initial_schema.sql` | `services/repositories/chatRepository.js` |
| `messages` | `001_initial_schema.sql` | `services/repositories/chatRepository.js` |
| `messages_default` | `001_initial_schema.sql` | Partition default table for `messages` |
| `migration_checkpoints` | `001_initial_schema.sql` | `runtime/bootstrap-runtime.js`, deploy checkpoint logic |
| `notification_channels` | `001_initial_schema.sql` | `services/repositories/notificationRepository.js` |
| `notification_logs` | `001_initial_schema.sql` | `services/repositories/notificationRepository.js`, `services/notificationService.js` |
| `order_items` | `001_initial_schema.sql` | `services/repositories/orderRepository.js`, `services/repositories/postgresOrderSync.js` |
| `orders` | `001_initial_schema.sql` | `services/repositories/orderRepository.js`, `services/repositories/postgresOrderSync.js` |
| `outbound_messages` | `001_initial_schema.sql` | `services/repositories/outboundMessageRepository.js` |
| `settings` | `001_initial_schema.sql` | `services/repositories/settingsRepository.js` |
| `short_links` | `001_initial_schema.sql`, altered in `011_mongo_cutover_guardrails.sql` | Short-link helpers in `index.js`, `services/notificationService.js` |
| `threads` | `001_initial_schema.sql` | `services/repositories/chatRepository.js` |
| `usage_logs` | `001_initial_schema.sql` | Usage logging and API usage routes in `index.js` |
| `usage_logs_default` | `001_initial_schema.sql` | Partition default table for `usage_logs` |
| `user_flow_history` | `012_support_state_tables.sql` | Chat/support-state logic in `index.js` |
| `user_notes` | `009_user_notes.sql` | User notes routes in `index.js` |
| `user_purchase_status` | `004_chat_support_state_tables.sql` | `services/repositories/userStateRepository.js` |
| `user_tags` | `004_chat_support_state_tables.sql` | `services/repositories/userStateRepository.js` |
| `user_unread_counts` | `012_support_state_tables.sql` | Admin chat unread-count logic in `index.js` |
| `webhook_event_idempotency` | `001_initial_schema.sql` | `services/repositories/webhookEventRepository.js` |
| `webhook_events` | `001_initial_schema.sql` | `services/repositories/webhookEventRepository.js` |
| `webhook_events_default` | `001_initial_schema.sql` | Partition default table for `webhook_events` |

### Runtime-Managed Schema Objects

Source: `infra/postgres.js`, `utils/auth.js`.

- `schema_migrations` is maintained by `infra/postgres.js` and tracks applied SQL migration files.
- `utils/auth.js` still contains `CREATE TABLE IF NOT EXISTS admin_passcodes` as a runtime guard even though `012_support_state_tables.sql` already defines the table.

## Dependencies

Source: `infra/postgres.js`, `runtime/bootstrap-runtime.js`, migration files.

- PostgreSQL advisory locking and migration execution in `infra/postgres.js`
- Runtime boot hooks that call migration readiness helpers
- Repository modules that depend on the tables listed above

## Data Flow

Source: migration files, `infra/postgres.js`, repository modules.

1. Runtime boot checks whether PostgreSQL is enabled and whether migrations should run.
2. `infra/postgres.js` creates or validates `schema_migrations`, then applies new SQL files under lock.
3. Repository modules assume the table and index contracts created by those migrations.
4. Some runtime helpers, such as `utils/auth.js`, still contain defensive `CREATE TABLE IF NOT EXISTS` logic for specific support tables.

## Hotspots

Source: `migrations/postgres/*.sql`, `infra/postgres.js`, repository modules.

- Partitioned tables are easy to break if new write paths ignore their partition assumptions.
- Some tables combine typed columns and JSONB payloads, which makes ownership and field authority harder to reason about.
- Runtime helper DDL can hide schema drift if agents assume migrations are the only place tables are created.

## Safe-Change Rules

Source: migration files, `infra/postgres.js`.

- Never edit old migration files to change behavior in place. Add a new migration instead.
- Preserve partitioning semantics for `messages`, `usage_logs`, and `webhook_events`.
- Check repository callers before renaming columns or changing uniqueness/index rules tied to legacy ids.
- Keep runtime DDL guards aligned with migration truth or remove them only after validating all deploy paths.

## Known Gaps

Source: the files listed above.

- There is no generated ERD or schema catalog in the repo outside migration SQL.
- JSONB payload contracts remain implicit in code rather than centrally typed.
- Table ownership is mostly conventional and not enforced by the runtime.

## Risk Notes

Source: `migrations/postgres/*.sql`, `infra/postgres.js`, repository modules.

- Schema drift can hide behind compatibility layers because repositories often normalize documents back into legacy-shaped payloads.
- Support-state tables are especially prone to mixed ownership between repositories and direct SQL in `index.js`.
- Runtime-created guard tables can let production limp forward while hiding the fact that migration discipline is incomplete.

## Checkpoint Summary

Source: `migrations/postgres/*.sql`, `infra/postgres.js`, `utils/auth.js`.

- Every SQL migration file is indexed with its table and index effects.
- The main application tables are mapped to their owning repositories or runtime helpers.
- A future agent can now find the origin and owner of a table before changing its queries or semantics.

## Next Actions

- Generate an ERD or machine-readable schema snapshot if schema change frequency increases.
- Add CI checks that fail when repositories reference missing tables or columns.
- Remove or document remaining runtime DDL guards once migration ownership is fully normalized.
