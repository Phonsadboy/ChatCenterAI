# Phase 5C: Orders, Follow-Up, Broadcast, and Notifications

## Purpose

This document explains the commercial workflow domain: order extraction and storage, follow-up scheduling, broadcast delivery, notification channels/logs, scheduled order summaries, Facebook conversion tracking, and SlipOK integration.

## Source-of-Truth Files

- `index.js`
- `services/notificationService.js`
- `services/slipOkService.js`
- `services/repositories/orderRepository.js`
- `services/repositories/postgresOrderSync.js`
- `services/repositories/followUpRepository.js`
- `services/repositories/followUpPageSettingsRepository.js`
- `services/repositories/notificationRepository.js`
- `services/repositories/outboundMessageRepository.js`
- `services/repositories/lineGroupRepository.js`
- `workers/batch.js`
- `migrations/postgres/001_initial_schema.sql`
- `migrations/postgres/003_followup_read_indexes.sql`
- `migrations/postgres/006_followup_page_settings.sql`
- `migrations/postgres/007_notification_indexes.sql`
- `migrations/postgres/012_support_state_tables.sql`
- `migrations/postgres/018_broadcast_audience_indexes.sql`
- `views/admin-orders.ejs`
- `views/admin-followup.ejs`
- `views/admin-broadcast.ejs`
- `public/js/admin-orders-v2.js`
- `public/js/followup-dashboard.js`
- `public/js/admin-broadcast.js`
- `public/js/notification-channels.js`

## Current Behavior

Source: routes and helpers in `index.js`, service/repository files listed above.

### Order Extraction

Order extraction today is LLM-driven:

- `analyzeOrderFromChat()` builds a page-specific order extraction prompt and calls an OpenAI-compatible chat completion model.
- Page-level overrides come from `follow_up_page_settings`.
- Existing product names are loaded to encourage stable product naming.
- Extraction returns normalized order data only if validation passes.
- `saveOrderToDatabase()` persists orders through `orderRepository`.

Order creation can happen through:

- AI-driven chat extraction
- Admin order endpoints
- Instruction AI order tools

### Follow-Up Scheduling

Source: `index.js`, `workers/batch.js`, `followUpRepository.js`.

Follow-up behavior:

- Task interval constant is `FOLLOW_UP_TASK_INTERVAL_MS = 30 * 1000`.
- `workers/batch.js` enqueues the follow-up tick scheduler and calls `processDueFollowUpTasks()`.
- Each task tracks rounds, next round index, next scheduled time, completion state, and cancel reasons.
- Sending follow-up messages is platform-specific, but sent assistant messages are also written to chat history and emitted to admin realtime listeners.
- Follow-up can be canceled because of hard stop, auto-disable, manual disable, existing order, or send failure.

### Broadcast Delivery

Source: `BroadcastQueue` and broadcast routes in `index.js`.

Broadcast behavior:

- Audience is built from chat activity, follow-up tag state, order existence filters, and date filters.
- Uploaded broadcast images are stored in the asset bucket and exposed under `/broadcast/assets/:filename`.
- `BroadcastQueue` groups targets by `platform:botId`, processes batches in parallel per channel, tracks progress, and writes snapshots to `broadcast_history`.
- Job state is also kept in memory in `activeBroadcasts`, which means currently-running broadcasts are tied to the lifetime of the admin runtime process.

### Notifications

Source: `services/notificationService.js`, notification routes and scheduler in `index.js`, `notificationRepository.js`.

Notification features include:

- Instant new-order notifications to configured LINE group channels
- Scheduled summary notifications at configured times
- Test-send support for notification channels
- Postgres logging in `notification_logs`
- URL shortening through `short_links` when notification payloads need shorter links

Notification channel support is currently focused on `line_group` channels and is enriched with `line_bot_groups` metadata.

### Facebook Conversion Tracking

Source: `index.js`.

When a Facebook order reaches the right status, the code can attempt a Conversions API `Purchase` event using the bot's configured dataset id and access token, then store the send result back on the order record.

### SlipOK

Source: `index.js`, `services/slipOkService.js`.

SlipOK is currently wired only for LINE group image messages when a notification channel is configured with SlipOK settings. It fetches the image from LINE, forwards it to the SlipOK API, and replies back into the LINE group with the result summary.

## Dependencies

Source: the files listed above.

This domain depends on:

- `orderRepository` for order CRUD and reporting
- `followUpRepository` and `followUpPageSettingsRepository` for follow-up state and per-page settings
- `notificationRepository` and `notificationService` for channel config and sends
- `lineGroupRepository` for sender-group validation
- `outboundMessageRepository` for outbound delivery state snapshots
- Bucket storage and `PUBLIC_BASE_URL` for broadcast and asset URLs
- OpenAI-compatible API keys for order extraction
- Meta and LINE platform credentials from bot records

## Data Flow

Source: `index.js`, `workers/batch.js`, service/repository files.

### Order Flow

1. Chat message flow reaches order-analysis logic.
2. `analyzeOrderFromChat()` prepares prompt + conversation summary + page settings.
3. Normalized order data is validated.
4. `saveOrderToDatabase()` persists the order.
5. `triggerOrderNotification()` attempts instant channel delivery.
6. Follow-up analysis and admin realtime events may also be triggered.

### Follow-Up Flow

1. Batch worker tick calls `processDueFollowUpTasks()`.
2. Due tasks are loaded from `followUpRepository`.
3. `handleFollowUpTask()` checks global/page hard stops, user follow-up status, and latest order presence.
4. `sendFollowUpMessage()` sends platform-specific content.
5. Task state is updated and `followUpScheduleUpdated` is emitted.
6. Sent assistant content is written into chat history.

### Broadcast Flow

1. Admin preview route computes audience counts.
2. Start route normalizes messages, uploads any pending images, and computes targets.
3. `BroadcastQueue` runs per-channel batch loops.
4. Progress snapshots are emitted as `broadcastProgress` and persisted to `broadcast_history`.
5. Job state remains queryable while the process keeps it in `activeBroadcasts`.

### Notification Summary Flow

1. Batch worker tick calls `evaluateNotificationSummarySchedules()`.
2. Active channels with `deliveryMode = scheduled` are loaded.
3. Due summary window is calculated from channel `summaryTimes` and `summaryTimezone`.
4. `notificationService.sendOrderSummary()` sends the summary.
5. `notificationRepository.setChannelSummaryState()` updates last summary markers.

## Hotspots

Source: `index.js`, `notificationService.js`, repository code, worker code.

- Broadcast execution is process-local even though progress is persisted. Runtime restarts can interrupt live execution.
- Order extraction logic, validation, admin order editing, and AI order tools all touch the same data model from different paths.
- Follow-up is tightly coupled to order state, chat history, page settings, and admin realtime events.
- Notification behavior is partly route-driven, partly service-driven, and partly interval-driven.
- The LINE-group-only focus of notifications and SlipOK is an implementation fact, not a generic abstraction.

## Safe-Change Rules

Source: files listed above.

- Preserve order id and user id semantics because follow-up, notifications, and admin views all depend on them.
- Do not change follow-up cancel-reason semantics without checking admin follow-up UI expectations.
- Do not move broadcast execution to a worker without redesigning `activeBroadcasts`, progress reads, and cancellation semantics together.
- When changing scheduled notifications, review both channel config normalization and the summary time window helpers.

## Known Gaps

Source: `index.js`, worker code, UI code.

- Broadcast is not yet a durable worker-owned job.
- Follow-up and order rules are spread across many helper functions instead of one bounded service layer.
- Notification channel support is specialized and not abstracted for non-LINE transports.

## Risk Notes

Source: `index.js`, `workers/batch.js`, `services/notificationService.js`, repository modules.

- This domain mixes realtime chat side effects and scheduled worker behavior, so changes can fail only in worker runtimes even when admin routes still look correct.
- Broadcast durability is incomplete because progress is persisted but execution lives in process memory.
- Order extraction, follow-up suppression, and notification triggering all depend on shared identifiers and timing windows, which makes regressions hard to spot without integration coverage.

## Checkpoint Summary

Source: `index.js`, `workers/batch.js`, `services/notificationService.js`, `services/slipOkService.js`.

- Order extraction, follow-up scheduling, broadcast execution, notification delivery, and SlipOK touchpoints are now mapped as one operational flow.
- Background ownership between batch workers and admin runtime code is explicit.
- A future agent can identify which changes are safe inside admin UI only and which require worker/runtime validation.

## Next Actions

- Move broadcast execution to a durable queue/worker model if operational reliability matters.
- Consolidate order validation rules into one shared contract used by AI extraction, admin APIs, and AI order tools.
- Add integration tests for follow-up cancellation-on-order and scheduled summary edge cases.
