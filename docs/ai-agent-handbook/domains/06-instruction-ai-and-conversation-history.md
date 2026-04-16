# Phase 5B: Instruction AI and Conversation History

## Purpose

This document explains the instruction-management stack: instruction storage, instruction AI tooling, versioning, RAG/search support, instruction chat state, and conversation-thread analytics tied to instructions.

## Source-of-Truth Files

- `index.js`
- `services/instructionChatService.js`
- `services/instructionRAGService.js`
- `services/instructionDataService.js`
- `services/conversationThreadService.js`
- `services/repositories/instructionChatStateRepository.js`
- `services/repositories/conversationThreadRepository.js`
- `services/repositories/settingsRepository.js`
- `services/repositories/followUpPageSettingsRepository.js`
- `migrations/postgres/001_initial_schema.sql`
- `migrations/postgres/016_conversation_threads.sql`
- `migrations/postgres/017_instruction_chat_state.sql`
- `views/admin-dashboard-v2.ejs`
- `views/admin-instruction-chat.ejs`
- `views/admin-instruction-conversations.ejs`
- `public/js/admin-dashboard-v2.js`
- `public/js/instruction-chat.js`
- `public/js/instruction-conversations.js`

## Current Behavior

Source: instruction-related routes and helpers in `index.js`, plus service/repository files listed above.

### Two Instruction Eras Coexist

Observed state:

- Legacy instruction library routes still exist under `/admin/instructions*` and `/api/instructions*`.
- Postgres-backed Instruction V2 routes exist under `/api/instructions-v2*` and the V2/V3 editors.
- Instruction AI chat and conversation history are designed around the Postgres-backed instruction model and its version/state tables.

Agents should not assume the legacy instruction surfaces are fully retired just because V2 exists.

### Instruction V2 Surface

Source: `index.js`, `views/admin-dashboard-v2.ejs`, `public/js/admin-dashboard-v2.js`.

Instruction V2 supports:

- listing, creating, updating, deleting, and duplicating instructions
- managing data items inside an instruction
- table/text item editing through two editor variants
- sheet import preview and execute flows
- preview/export flows
- starter asset upload support

The dashboard page is the main admin entrypoint for this surface.

### Instruction AI Chat Surface

Source: `index.js`, `services/instructionChatService.js`, `services/instructionRAGService.js`, `services/repositories/instructionChatStateRepository.js`.

Instruction AI uses the OpenAI Responses API loop with runtime-safe tool filtering:

- `/api/instruction-ai` runs the main request/response tool loop.
- `/api/instruction-ai/stream` provides SSE streaming and resumable request state.
- `/api/instruction-ai/sessions*` stores or retrieves session state.
- `/api/instruction-ai/changelog/:sessionId` and `/api/instruction-ai/undo/:changeId` expose reversible change history.
- `/api/instruction-ai/versions/:instructionId*` reads or writes instruction versions.

Important implementation details:

- Tool definitions come from `InstructionChatService`, but runtime use is restricted by `getRuntimeInstructionToolDefinitions()` in `index.js`.
- Automatic version snapshots are created after mutating tool calls if the session has unsaved changes.
- Session, audit, and changelog state are persisted in Postgres tables created by migration `017_instruction_chat_state.sql`.

### RAG/Search Support

Source: `services/instructionRAGService.js`.

Current RAG behavior:

- Keyword search is always available after indexing instruction data items.
- Embedding search is optional and uses `text-embedding-3-large` with 256 dimensions.
- Embeddings are built asynchronously in the background and are not guaranteed to be ready immediately.

### Conversation History / Thread Analytics

Source: `services/conversationThreadService.js`, `services/repositories/conversationThreadRepository.js`, `index.js`, migration `016_conversation_threads.sql`.

Conversation history features depend on `conversation_threads`:

- Thread ids are derived from sender id + bot id + platform.
- Threads aggregate instruction refs, instruction meta, basic message stats, order metadata, and tags.
- `/admin/instruction-conversations` renders the analytics UI.
- API routes expose thread lists, detail views, analytics summaries, filter options, and rebuild triggers.

## Dependencies

Source: service constructors and route helpers in `index.js`.

Instruction AI and conversation history depend on:

- Postgres-backed instruction storage and version records
- `InstructionChatService` as the tool execution layer
- `InstructionRAGService` for search/index support
- `InstructionChatStateRepository` for sessions/audit/changelog
- `ConversationThreadService` and `conversationThreadRepository` for analytics
- OpenAI key resolution from database or env fallback
- Frontend pages `admin-dashboard-v2`, `admin-instruction-chat`, and `admin-instruction-conversations`

## Data Flow

Source: `index.js`, `services/instructionChatService.js`, `services/conversationThreadService.js`.

### Instruction AI Request Flow

1. Admin page posts instruction id, message, model, history, and optional images.
2. Route validates that Postgres instruction V2 support is available.
3. Route resolves an API key and provider-compatible model.
4. Route loads the instruction and builds the system prompt from instruction data.
5. Route runs the Responses API tool loop with runtime-safe tool definitions.
6. Tool calls execute through `InstructionChatService`.
7. Mutating tool calls create changelog entries and may trigger auto-version save.
8. Session/audit state is persisted through `instructionChatStateRepository`.
9. Route returns final content, tool summaries, usage, and optional version snapshot metadata.

### Conversation Thread Flow

1. Thread service groups messages by sender/bot/platform.
2. It merges instruction refs and instruction meta found in message history.
3. It queries order history to enrich thread outcome/order data.
4. Results are stored in `conversation_threads`.
5. Analytics APIs query `conversationThreadRepository` for filters, summaries, and detail views.

## Hotspots

Source: `index.js`, `services/instructionChatService.js`, `services/instructionRAGService.js`, `services/repositories/instructionChatStateRepository.js`.

- Instruction AI orchestration is split between `index.js` and `InstructionChatService`; neither is the full source alone.
- Tool safety is controlled in two places: service tool definitions and runtime allowlisting.
- Undo logic is hand-authored per tool type; new mutating tools must add undo behavior explicitly if reversibility matters.
- Legacy instruction surfaces and V2 surfaces coexist, which makes route cleanup risky.
- RAG embeddings are best-effort and async; agents should not assume embedding search is always ready or always in use.

## Safe-Change Rules

Source: files listed above.

- Do not add or expose new mutating instruction tools without updating runtime allowlisting.
- Do not change instruction version semantics without checking both manual save and auto-save flows.
- Preserve `session_id`, `change_id`, and `instruction_id` string contracts used by frontend and audit logic.
- When changing conversation thread logic, verify downstream analytics filters and rebuild endpoints.

## Known Gaps

Source: `index.js`, service files, UI routes.

- The instruction stack still carries legacy route surfaces and legacy content bootstrap.
- There is no single typed schema for instruction data items, tool results, or SSE event payloads.
- Frontend and backend behavior are tightly coupled through ad hoc JSON payloads instead of a generated contract.

## Risk Notes

Source: `index.js`, `services/instructionChatService.js`, `services/instructionRAGService.js`, `services/repositories/instructionChatStateRepository.js`.

- Tool safety is split between runtime allowlisting and service tool definitions, so partial edits can expose tools unintentionally or disable them accidentally.
- Undo and auto-version behavior depend on explicit per-tool logic rather than a generic transaction model.
- RAG embeddings are asynchronous and optional, which means search behavior can vary between runtime states even when the same instruction is loaded.

## Checkpoint Summary

Source: instruction routes in `index.js`, instruction services, analytics repositories.

- Instruction V2, instruction AI, session/audit state, RAG behavior, and conversation-thread analytics are now documented as one connected domain.
- The main JSON, SSE, changelog, undo, session, and analytics routes are tied back to their backing services and tables.
- A future agent can now tell where versioning, tool execution, and thread analytics behavior actually live.

## Next Actions

- Consolidate instruction-era ownership so future agents know when legacy routes can be retired.
- Introduce typed contracts for instruction AI tool results and SSE events.
- Add regression coverage around auto-versioning and undo behavior before expanding tool surface further.
