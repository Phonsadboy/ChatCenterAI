# Phase 5A: Chat and Webhooks

## Purpose

This document explains the end-to-end inbound messaging pipeline: webhook ingress, dedupe, queue buffering, conversation locking, AI reply orchestration, chat persistence, admin realtime updates, and platform-specific branching for LINE, Facebook, Instagram, and WhatsApp.

## Source-of-Truth Files

- `index.js`
- `workers/realtime.js`
- `infra/conversationBuffer.js`
- `infra/conversationLock.js`
- `infra/dedupe.js`
- `infra/adminRealtime.js`
- `infra/eventBus.js`
- `infra/queueNames.js`
- `infra/queues.js`
- `services/repositories/chatRepository.js`
- `services/repositories/profileRepository.js`
- `services/repositories/userStateRepository.js`
- `services/repositories/webhookEventRepository.js`
- `services/repositories/outboundMessageRepository.js`
- `services/repositories/lineGroupRepository.js`
- `utils/chatImageUtils.js`
- `migrations/postgres/001_initial_schema.sql`
- `migrations/postgres/004_chat_support_state_tables.sql`
- `migrations/postgres/005_contact_profile_indexes.sql`
- `migrations/postgres/011_mongo_cutover_guardrails.sql`
- `migrations/postgres/012_support_state_tables.sql`

## Current Behavior

Source: platform webhook routes and message helpers in `index.js`, plus infra helpers and repositories listed above.

### Webhook Entry Points

Active inbound routes:

- `POST /webhook/line/:botId`
- `GET /webhook/facebook/:botId`
- `POST /webhook/facebook/:botId`
- `GET /webhook/instagram/:botId`
- `POST /webhook/instagram/:botId`
- `GET /webhook/whatsapp/:botId`
- `POST /webhook/whatsapp/:botId`

Each platform route does some version of the same work:

- Resolve bot context from `botRepository`.
- Record inbound HTTP payloads through `webhookEventRepository` where applicable.
- Apply event-level dedupe through `claimProcessedEvent()` or idempotency tables.
- Normalize event content into queueable or directly processable message structures.
- Persist or enrich supporting context such as contact profiles or LINE group metadata.

### Queueing Model

Source: `index.js`, `infra/conversationBuffer.js`, `infra/conversationLock.js`, `workers/realtime.js`.

The system has two queue behaviors:

- Distributed Redis/BullMQ queueing for `public-ingest` and `worker-realtime`.
- Optional in-process queueing inside `index.js` for runtimes that are allowed to fall back.

Important helpers:

- `addToQueue()` chooses buffer strategy.
- `appendConversationBuffer()` writes Redis-backed queue buffers.
- `processFlushedMessages()` is the shared orchestration function after flush.
- `runWithConversationLock()` serializes work per conversation identity.
- `workers/realtime.js` drains buffer keys and calls `processFlushedMessages()`.

### Dedupe and Idempotency

Source: `infra/dedupe.js`, `services/repositories/webhookEventRepository.js`, platform webhook handlers in `index.js`.

There are two overlapping dedupe layers:

- Redis or local-memory event markers through `claimProcessedEvent()`.
- Postgres-backed HTTP request idempotency through `webhook_event_idempotency` and `webhook_events`.

Practical meaning:

- Platform message dedupe is not one mechanism; agents must inspect both the platform handler and repository layer before changing dedupe behavior.

### Chat Persistence

Source: `services/repositories/chatRepository.js`, `index.js`.

Chat persistence is Postgres-backed:

- Contacts live in `contacts`.
- Conversation containers live in `threads`.
- Message history lives in partitioned `messages`.
- Optional media metadata lives in `message_media`.

`chatRepository.js` is the primary persistence adapter for:

- inbound/outbound message writes
- history reads
- distinct user discovery
- admin chat user list summaries

### Admin Realtime Contract

Source: `infra/adminRealtime.js`, `infra/eventBus.js`, `index.js`, `public/js/chat-redesign.js`, `public/js/followup-dashboard.js`.

Admin realtime uses Socket.IO room `admin` and a Redis pub/sub bridge.

Key emitted event names:

- `newMessage`
- `chatCleared`
- `userTagsUpdated`
- `userPurchaseStatusUpdated`
- `orderUpdated`
- `orderDeleted`
- `orderExtracted`
- `followUpTagged`
- `followUpScheduleUpdated`
- `broadcastProgress`

### Platform-Specific Notes

Source: platform handlers in `index.js`.

| Platform | Special behavior |
| --- | --- |
| LINE | Can capture group/room membership metadata through `captureLineGroupEvent()` and `lineGroupRepository`; can run SlipOK group-image validation for configured notification channels |
| Facebook | Handles comment automation and Messenger events in the same webhook route; echoes from page/admin activity are persisted with separate logic |
| Instagram | Reuses Meta-style attachment handling and uses account-specific sender ids |
| WhatsApp | Reuses Meta-style access token / phone-number-id delivery helpers |

## Dependencies

Source: `index.js`, infra modules, repository modules.

Main dependencies for this domain:

- `botRepository` for platform credentials and bot config
- `chatRepository` for persistence
- `profileRepository` for contact profile fetch/write
- `userStateRepository` for AI enablement, tags, purchase state
- `webhookEventRepository` for HTTP idempotency tracking
- `outboundMessageRepository` for outbound delivery status snapshots
- `lineGroupRepository` for LINE group metadata
- OpenAI/OpenRouter client selection helpers in `index.js`

## Data Flow

Source: `index.js`, `workers/realtime.js`, infra helpers.

### Inbound User Message Flow

1. Platform webhook route resolves bot context.
2. Route records inbound request and/or claims dedupe keys.
3. Event payload is normalized into text/image/audio/unsupported message parts.
4. `addToQueue()` buffers the message with queue context such as platform, bot id, selected instructions, image collections, and AI mode flags.
5. Realtime worker or in-process flush calls `processFlushedMessages()`.
6. `processFlushedMessages()` resolves platform context, selected instructions, conversation starter state, and AI enablement flags.
7. AI response or control logic sends outbound platform messages.
8. Assistant/user messages are saved through `chatRepository`.
9. `emitAdminEvent("newMessage", ...)` updates admin clients and unread counters.

### Admin Send Flow

Source: `/admin/chat/send` and related helpers in `index.js`.

1. Admin UI posts to `/admin/chat/send`.
2. Route validates platform/bot context and sends through platform-specific helper functions.
3. Outbound assistant/admin message is persisted in chat history.
4. Admin event is emitted to refresh other sessions.

### LINE Group Capture Flow

Source: `captureLineGroupEvent()` in `index.js`, `lineGroupRepository.js`.

1. LINE group or room event is detected.
2. Group metadata is upserted into `line_bot_groups`.
3. On join or first-seen events, the handler may call LINE summary/member-count APIs to enrich the record.

## Hotspots

Source: `index.js`, `workers/realtime.js`, `infra/conversationBuffer.js`, `infra/conversationLock.js`.

- Queue behavior depends on runtime mode and env flags; it is easy to break `public-ingest` by testing only inside `admin-app`.
- `processFlushedMessages()` is a large orchestration hub that mixes AI prompting, instruction resolution, platform branching, order/follow-up side effects, and admin notifications.
- Facebook echo handling is subtle because page-originated messages and automated replies share the same webhook path.
- Chat unread counts, purchase status, tags, and order side effects are not isolated from the message pipeline; a change to chat persistence can affect multiple admin views.

## Safe-Change Rules

Source: the files listed above.

- Preserve dedupe behavior unless both Redis/local idempotency and Postgres request tracking are reviewed together.
- Do not change queue payload shape without checking both producer routes and `workers/realtime.js`.
- Do not rename admin Socket.IO event names without updating every consumer page.
- Treat `processFlushedMessages()` changes as cross-domain changes. They can affect orders, follow-up tagging, admin chat, and instruction selection.

## Known Gaps

Source: `index.js`, `public/js/chat-redesign.js`, repository code.

- There is no single typed contract for queue message payloads.
- Platform-specific helper logic still lives mostly inside `index.js`.
- The domain has no automated integration test coverage for webhook-to-reply behavior across all platforms.

## Risk Notes

Source: `index.js`, `infra/conversationBuffer.js`, `infra/conversationLock.js`, `workers/realtime.js`.

- This domain is sensitive to race conditions because dedupe, buffering, locking, persistence, and outbound delivery all overlap.
- `processFlushedMessages()` is a cross-domain pivot point. A chat change can ripple into orders, follow-up, unread counts, and admin realtime.
- Public-ingest correctness depends on distributed Redis behavior, so local dev success in `admin-app` is not enough evidence for production safety.

## Checkpoint Summary

Source: webhook routes in `index.js`, realtime worker and infra helpers.

- Inbound messaging is documented from webhook entrypoint to outbound reply.
- The queue, dedupe, lock, persistence, and admin realtime layers are mapped together rather than as isolated modules.
- Platform-specific exceptions for LINE, Facebook, Instagram, and WhatsApp are captured for future edits.

## Next Actions

- Extract typed queue payload and admin event contracts if this domain is changed frequently.
- Move platform-specific handlers behind clearer service boundaries so `index.js` stops being the single source for all messaging behavior.
- Add end-to-end smoke coverage for one inbound event per supported platform.
