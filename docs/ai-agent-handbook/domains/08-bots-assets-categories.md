# Phase 5D: Bots, Assets, and Categories

## Purpose

This document explains platform bot configuration, secret storage, asset pipelines, image collections, categories, LINE group discovery, and Facebook post/comment policy persistence.

## Source-of-Truth Files

- `index.js`
- `services/repositories/botRepository.js`
- `services/repositories/postgresBotSync.js`
- `services/repositories/categoryRepository.js`
- `services/repositories/lineGroupRepository.js`
- `services/repositories/followUpPageSettingsRepository.js`
- `services/repositories/facebookCommentPolicyRepository.js`
- `services/repositories/facebookCommentAutomationRepository.js`
- `infra/storage/bucketStorage.js`
- `migrations/postgres/001_initial_schema.sql`
- `migrations/postgres/011_mongo_cutover_guardrails.sql`
- `migrations/postgres/013_categories_tables.sql`
- `migrations/postgres/014_facebook_comment_policies.sql`
- `migrations/postgres/015_facebook_posts_and_events.sql`
- `views/admin-settings.ejs`
- `views/admin-settings-v2.ejs`
- `views/admin-categories.ejs`
- `views/admin-category-data.ejs`
- `views/admin-facebook-posts.ejs`
- `views/admin-facebook-comment.ejs`
- `public/js/admin-settings.js`
- `public/js/admin-settings-v2.js`
- `public/js/bot-management.js`
- `public/js/image-collections-management.js`
- `public/js/admin-facebook-posts.js`

## Current Behavior

Source: routes in `index.js`, repository files, asset helpers in `index.js`.

### Bot Storage

Bots for LINE, Facebook, Instagram, and WhatsApp all share the `bots` table:

- `bots` stores shared fields, config JSON, AI settings, selected instructions, and selected image collections.
- `bot_secrets` stores extracted token/secret-style fields.
- `postgresBotSync.js` is the sync helper that writes a normalized bot record into these tables.
- `botRepository.js` reads back a merged bot document that combines config and secrets for runtime use.

Practical meaning:

- Bot CRUD routes are platform-specific at the API level.
- Bot storage is platform-agnostic at the table level.

### Asset Surface

Source: asset routes and helper functions in `index.js`, `infra/storage/bucketStorage.js`.

There are three asset families with different handling:

- Instruction assets
- Follow-up assets
- Broadcast assets

Asset behavior is hybrid:

- Metadata may live in Postgres-backed records.
- Binary payloads may live in bucket storage.
- Local copies may also exist for static serving and warm-cache purposes.

### Image Collections

Source: image collection routes and helpers in `index.js`, `migrations/postgres/001_initial_schema.sql`.

Image collections are Postgres-backed and linked to instruction assets. Bots can store selected collection ids, and message rendering helpers can resolve image tokens against selected collections at runtime.

### Categories

Source: `categoryRepository.js`, category routes in `index.js`, migration `013_categories_tables.sql`.

Categories are stored as:

- `categories` for category metadata and column definitions
- `category_tables` for row payloads

The admin surface supports:

- category CRUD
- row CRUD
- Excel import/export

### LINE Groups

Source: `lineGroupRepository.js`, `captureLineGroupEvent()` in `index.js`, migration `011_mongo_cutover_guardrails.sql`.

LINE groups are not manually registered first. They are discovered from webhook traffic:

- group/room events cause an upsert into `line_bot_groups`
- optional enrichment pulls group summary and member counts from LINE APIs
- notification channel setup depends on these discovered records

### Facebook Comment Automation State

Source: `facebookCommentPolicyRepository.js`, `facebookCommentAutomationRepository.js`, comment/post routes in `index.js`.

Facebook comment automation stores:

- page-default comment policy in `facebook_comment_policies`
- observed posts and per-post reply profiles in `facebook_page_posts`
- processed comment events in `facebook_comment_events`

The repo and route split is important:

- Repositories store policy/post/event state.
- `index.js` still owns the actual webhook handling, post sync, and reply behavior.
- `views/admin-facebook-comment.ejs` exists in the repo, but no active `res.render("admin-facebook-comment")` route was found in static `index.js` scans.

## Dependencies

Source: the files listed above.

This domain depends on:

- Postgres-backed bot and asset metadata
- Bucket storage for binary payloads
- Platform credentials stored in bot records
- Admin settings pages and related frontend modules
- Meta Graph APIs for Facebook/Instagram/WhatsApp-specific bot actions
- LINE APIs for group discovery and bot message delivery

## Data Flow

Source: routes and helpers in `index.js`, repository files.

### Bot CRUD Flow

1. Admin UI calls a platform-specific bot API route.
2. Route normalizes payload, platform-specific identifiers, and credentials.
3. `botRepository` persists the merged bot record into `bots` and `bot_secrets`.
4. Downstream runtime code reads merged bot data through repository lookup methods.

### Asset Flow

1. Admin uploads or edits an asset.
2. Asset helper code writes metadata and uploads binary data to bucket storage when configured.
3. Public asset routes read from bucket first and may fall back to local copies.
4. Rendering helpers resolve public URLs for instruction/follow-up/broadcast consumers.

### Category Flow

1. Admin category routes mutate category metadata or row data.
2. `categoryRepository` writes to `categories` and `category_tables`.
3. Export/import helpers translate between row payloads and Excel-compatible layouts.

### Facebook Post/Comment Flow

1. Facebook webhook or manual fetch discovers posts and comments.
2. Post/comment repositories persist page post and comment event state.
3. Page-default or post-specific reply policy is loaded.
4. Webhook handler decides whether to reply publicly, send private reply, or pull the event into chat.

## Hotspots

Source: `index.js`, repository files, asset helpers.

- Bot config is spread across top-level columns, config JSON, and secret JSON.
- Asset handling is split between direct helper functions in `index.js` and bucket wrapper code in `infra/storage/bucketStorage.js`.
- Image collection behavior is partly database-backed and partly resolved dynamically through token parsing at message render time.
- Facebook comment automation is not fully encapsulated; webhook behavior, policy reads, post sync, and comment event storage are split across multiple layers.

## Safe-Change Rules

Source: repository code and route handlers.

- Preserve `legacy_bot_id` semantics because webhooks and admin APIs use these identifiers widely.
- Do not move tokens/secrets between env and DB storage without checking every platform lookup path.
- Keep asset URL resolution stable unless all frontend and notification consumers are updated.
- Treat category column ids and row ids as stable identifiers once saved.

## Known Gaps

Source: the files listed above.

- Asset and image-collection behavior is not isolated into a single cohesive service layer.
- Facebook comment automation still depends heavily on `index.js`.
- Some settings/category pages use inline scripts instead of dedicated frontend modules.

## Risk Notes

Source: `index.js`, repository files, `infra/storage/bucketStorage.js`.

- Bot configuration is easy to break because runtime reads a merged document built from top-level columns, config JSON, and secret JSON.
- Asset behavior spans bucket storage, local files, route handlers, and token-resolution helpers rather than one service boundary.
- Category tables and Facebook comment policy payloads are JSON-heavy, so schema expectations can drift without obvious compile-time failures.

## Checkpoint Summary

Source: bot, category, asset, and Facebook-comment source files listed above.

- Platform bot storage, asset families, image collections, categories, LINE group discovery, and Facebook comment policy state are mapped to their owning repositories and routes.
- The split between persistent state and runtime behavior is explicit, especially for Facebook comment automation.
- Dormant UI artifacts, such as `admin-facebook-comment.ejs`, are documented as dormant instead of assumed active.

## Next Actions

- Extract platform-agnostic bot storage contracts so future agents can change one platform without breaking another.
- Move asset lifecycle code out of `index.js` into dedicated services.
- Add clear typed contracts for Facebook comment reply profile payloads.
