# Appendix: Route Inventory

## Purpose

This appendix inventories the current HTTP surface from `index.js` and maps active EJS templates to their local JS/CSS assets so future agents can verify route ownership before editing handlers or pages.

## Source-of-Truth Files

- `index.js`
- `views/*.ejs`
- `views/partials/*.ejs`
- `public/js/*.js`
- `public/css/*.css`
- `infra/runtimeRouteGuard.js`

## Current Behavior

Source: static `app.METHOD(...)` extraction from `index.js`, plus template and asset scans under `views/` and `public/`.

Static extraction found 251 `app.METHOD()` matches in `index.js`. One match is a commented legacy `POST /webhook` placeholder, so this appendix treats the active surface as 250 routes.

### Route Family Summary

| Family | Scope | Notes |
| --- | --- | --- |
| Health and root | Public | Includes `/health`, `/`, `/favicon.ico` |
| Public assets and short links | Public | Includes instruction, follow-up, chat-image, broadcast-asset, and short-link routes |
| Webhooks | Public-ingest | LINE, Facebook, Instagram, WhatsApp |
| Auth and passcodes | Admin | Session and passcode management |
| Instructions legacy/V2 | Admin | Legacy library plus V2/V3 editors and APIs |
| Instruction AI and conversations | Admin | Instruction AI JSON/SSE/session/audit routes and thread analytics |
| Chat | Admin | Chat UI plus JSON action routes |
| Orders | Admin | Orders page plus CRUD/export actions |
| Follow-up | Admin | Dashboard, status, overview, page settings, assets |
| Broadcast | Admin | Preview, start, status, cancel |
| Settings and usage | Admin | Settings, API keys, usage, filter test |
| Bots and social surfaces | Admin | LINE, Facebook, Instagram, WhatsApp bot CRUD plus Facebook posts/comment policy |
| Notifications | Admin | Notification channels, tests, logs |
| Categories and image collections | Admin | Categories, category data, image collections |
| Customer and stats pages | Admin | Customer stats, API usage |
| Misc support APIs | Admin | User notes, all-bots list, LINE groups |

### Full Route Inventory

#### Health and Root

- `GET /favicon.ico`
- `GET /health`
- `GET /`

#### Public Assets and Short Links

- `GET /assets/instructions/:fileName`
- `GET /assets/followup/:fileName`
- `GET /assets/chat-images/:messageId/:imageIndex`
- `GET /broadcast/assets/:filename`
- `GET /s/:code`

#### Webhooks

- `POST /webhook/line/:botId`
- `GET /webhook/facebook/:botId`
- `POST /webhook/facebook/:botId`
- `GET /webhook/instagram/:botId`
- `POST /webhook/instagram/:botId`
- `GET /webhook/whatsapp/:botId`
- `POST /webhook/whatsapp/:botId`

#### Auth and Passcodes

- `GET /api/auth/session`
- `GET /admin/login`
- `POST /admin/login`
- `POST /admin/logout`
- `GET /api/admin-passcodes`
- `POST /api/admin-passcodes`
- `PATCH /api/admin-passcodes/:id/toggle`
- `DELETE /api/admin-passcodes/:id`

#### Legacy Instruction Library and Admin Shell

- `GET /admin`
- `GET /admin/instructions/library`
- `GET /admin/instructions/library/:date`
- `POST /admin/instructions/library-now`
- `PUT /admin/instructions/library/:date`
- `DELETE /admin/instructions/library/:date`
- `POST /admin/instructions/restore/:date`
- `POST /admin/instructions/upload-excel`
- `POST /admin/instructions/preview-excel`
- `GET /api/instructions/library`
- `POST /api/instructions/library/:date/convert-to-v2`
- `GET /api/instructions/library/:date/details`
- `GET /api/instructions`
- `GET /api/instructions/:instructionId/versions/:version`
- `GET /admin/dashboard`
- `GET /admin/api-usage`
- `POST /admin/ai-toggle`
- `POST /admin/instructions`
- `POST /admin/instructions/:id/delete`
- `GET /admin/instructions/:id/edit`
- `POST /admin/instructions/:id/edit`
- `GET /admin/instructions/export/json`
- `GET /admin/instructions/export/markdown`
- `GET /admin/instructions/export/excel`
- `GET /admin/instructions/preview`
- `POST /admin/instructions/reorder`
- `POST /admin/instructions/reorder/drag`
- `GET /admin/instructions/list`
- `GET /admin/instructions/assets`
- `POST /admin/instructions/assets`
- `PUT /admin/instructions/assets/:label`
- `DELETE /admin/instructions/assets/:label`
- `POST /admin/instructions/assets/bulk-delete`
- `POST /admin/instructions/assets/check-consistency`
- `DELETE /admin/instructions/:id`
- `GET /admin/instructions/:id/json`

#### Instructions V2 and V3

- `GET /api/instructions-v2`
- `GET /api/instructions-v2/:id`
- `POST /api/instructions-v2`
- `PUT /api/instructions-v2/:id`
- `DELETE /api/instructions-v2/:id`
- `POST /api/instructions-v2/:id/duplicate`
- `POST /api/instructions-v2/starter-assets`
- `POST /api/instructions-v2/:id/data-items`
- `PUT /api/instructions-v2/:id/data-items/reorder`
- `PUT /api/instructions-v2/:id/data-items/:itemId`
- `DELETE /api/instructions-v2/:id/data-items/:itemId`
- `POST /api/instructions-v2/:id/data-items/:itemId/duplicate`
- `GET /api/instructions-v2/:id/preview`
- `GET /api/instructions-v2/export`
- `POST /api/instructions-v2/import/preview-sheets`
- `POST /api/instructions-v2/import/execute-sheets`
- `POST /api/instructions-v2/export-sheets`
- `GET /admin/instructions-v2/:instructionId/data-items/new`
- `GET /admin/instructions-v2/:instructionId/data-items/:itemId/edit`
- `POST /admin/instructions-v2/:instructionId/data-items/new`
- `POST /admin/instructions-v2/:instructionId/data-items/:itemId/edit`
- `GET /admin/instructions-v3/:instructionId/data-items/:itemId/edit`
- `GET /admin/instructions-v3/:instructionId/data-items/new`
- `POST /admin/instructions-v3/:instructionId/data-items/new`
- `POST /admin/instructions-v3/:instructionId/data-items/:itemId/edit`
- `POST /admin/instructions-v3/export-xlsx`

#### Instruction AI and Conversation History

- `GET /admin/instruction-ai`
- `GET /admin/instruction-chat`
- `GET /admin/instruction-conversations`
- `GET /api/instruction-conversations/:instructionId`
- `GET /api/instruction-conversations/:instructionId/thread/:threadId`
- `GET /api/instruction-conversations/:instructionId/analytics`
- `GET /api/instruction-conversations/:instructionId/filters`
- `PATCH /api/instruction-conversations/thread/:threadId/tags`
- `POST /api/instruction-conversations/:instructionId/rebuild`
- `GET /api/instruction-ai/versions/:instructionId`
- `POST /api/instruction-ai/versions/:instructionId`
- `POST /api/instruction-ai`
- `GET /api/instruction-ai/changelog/:sessionId`
- `POST /api/instruction-ai/undo/:changeId`
- `POST /api/instruction-ai/upload-image`
- `POST /api/instruction-ai/stream`
- `GET /api/instruction-ai/stream/resume`
- `GET /api/instruction-ai/stream/state`
- `POST /api/instruction-ai/sessions`
- `GET /api/instruction-ai/sessions`
- `GET /api/instruction-ai/sessions/:sessionId`
- `DELETE /api/instruction-ai/sessions/:sessionId`
- `GET /api/instruction-ai/audit`

#### Chat

- `GET /admin/chat`
- `GET /admin/chat/users`
- `GET /admin/chat/user-status/:userId`
- `POST /admin/chat/user-status`
- `POST /admin/chat/users/:userId/refresh-profile`
- `POST /admin/chat/mark-read/:userId`
- `GET /admin/chat/history/:userId`
- `POST /admin/chat/send`
- `DELETE /admin/chat/clear/:userId`
- `GET /admin/chat/tags/:userId`
- `POST /admin/chat/tags/:userId`
- `POST /admin/chat/feedback`
- `GET /admin/chat/orders/:userId`
- `PUT /admin/chat/orders/:orderId`
- `DELETE /admin/chat/orders/:orderId`
- `GET /admin/chat/orders`
- `GET /admin/chat/available-tags`
- `POST /admin/chat/purchase-status/:userId`
- `GET /admin/chat/unread-count`

#### Orders

- `GET /admin/orders`
- `GET /admin/orders/pages`
- `GET /admin/orders/data`
- `GET /admin/orders/export`
- `PATCH /admin/orders/bulk/status`
- `DELETE /admin/orders/bulk/delete`
- `PATCH /admin/orders/:orderId/status`
- `PATCH /admin/orders/:orderId/notes`
- `DELETE /admin/orders/:orderId`
- `GET /admin/orders/:orderId/print-label`

#### Follow-Up

- `GET /admin/followup`
- `GET /admin/followup/status`
- `GET /admin/followup/overview`
- `GET /admin/followup/users`
- `POST /admin/followup/clear`
- `GET /admin/followup/page-settings`
- `POST /admin/followup/page-settings`
- `DELETE /admin/followup/page-settings`
- `POST /admin/followup/assets`

#### Broadcast

- `GET /admin/broadcast`
- `POST /admin/broadcast/preview`
- `POST /admin/broadcast`
- `GET /admin/broadcast/status/:jobId`
- `DELETE /admin/broadcast/cancel/:jobId`

#### Settings, Keys, and Usage

- `GET /admin/settings`
- `GET /admin/settings2`
- `GET /admin/api/all-bots`
- `GET /api/settings`
- `POST /api/settings/chat`
- `POST /api/settings/ai`
- `POST /api/settings/system`
- `POST /api/settings/filter`
- `GET /api/openai-keys`
- `POST /api/openai-keys`
- `PUT /api/openai-keys/:id`
- `DELETE /api/openai-keys/:id`
- `POST /api/openai-keys/test`
- `POST /api/openai-keys/:id/test`
- `GET /api/openai-usage/summary`
- `GET /api/openai-usage`
- `GET /api/openai-usage/by-bot/:botId`
- `GET /api/openai-usage/by-model/:model`
- `GET /api/openai-usage/by-key/:keyId`
- `POST /api/filter/test`

#### LINE Bots

- `GET /api/line-bots`
- `GET /api/line-bots/:id`
- `POST /api/line-bots`
- `PUT /api/line-bots/:id`
- `DELETE /api/line-bots/:id`
- `PATCH /api/line-bots/:id/toggle-status`
- `PATCH /api/line-bots/:id/toggle-notifications`
- `POST /api/line-bots/:id/test`
- `PUT /api/line-bots/:id/instructions`
- `PUT /api/line-bots/:id/image-collections`
- `PUT /api/line-bots/:id/keywords`

#### Facebook Bots and Posts

- `GET /admin/facebook-posts`
- `POST /api/facebook-bots/init`
- `GET /api/facebook-bots`
- `GET /api/facebook-bots/:id`
- `POST /api/facebook-bots`
- `PUT /api/facebook-bots/:id`
- `POST /api/facebook-bots/:id/dataset`
- `DELETE /api/facebook-bots/:id`
- `PATCH /api/facebook-bots/:id/toggle-status`
- `POST /api/facebook-bots/:id/test`
- `PUT /api/facebook-bots/:id/instructions`
- `PUT /api/facebook-bots/:id/image-collections`
- `GET /api/facebook-posts`
- `POST /api/facebook-posts/fetch`
- `PATCH /api/facebook-posts/:postId/reply-profile`
- `GET /api/facebook-bots/:id/comment-policy`
- `PUT /api/facebook-bots/:id/comment-policy`
- `PUT /api/facebook-bots/:id/keywords`

#### Instagram Bots

- `GET /api/instagram-bots`
- `GET /api/instagram-bots/:id`
- `POST /api/instagram-bots`
- `PUT /api/instagram-bots/:id`
- `DELETE /api/instagram-bots/:id`
- `PATCH /api/instagram-bots/:id/toggle-status`
- `POST /api/instagram-bots/:id/test`
- `PUT /api/instagram-bots/:id/instructions`
- `PUT /api/instagram-bots/:id/image-collections`
- `PUT /api/instagram-bots/:id/keywords`

#### WhatsApp Bots

- `GET /api/whatsapp-bots`
- `GET /api/whatsapp-bots/:id`
- `POST /api/whatsapp-bots`
- `PUT /api/whatsapp-bots/:id`
- `DELETE /api/whatsapp-bots/:id`
- `PATCH /api/whatsapp-bots/:id/toggle-status`
- `POST /api/whatsapp-bots/:id/test`
- `PUT /api/whatsapp-bots/:id/instructions`
- `PUT /api/whatsapp-bots/:id/image-collections`
- `PUT /api/whatsapp-bots/:id/keywords`

#### Notifications

- `GET /admin/api/notification-channels`
- `POST /admin/api/notification-channels`
- `PUT /admin/api/notification-channels/:id`
- `PATCH /admin/api/notification-channels/:id/toggle`
- `DELETE /admin/api/notification-channels/:id`
- `POST /admin/api/notification-channels/:id/test`
- `GET /admin/api/notification-logs`
- `GET /admin/api/line-bots/:botId/groups`

#### Categories

- `GET /admin/categories`
- `GET /admin/categories/:categoryId/data`
- `GET /admin/api/categories`
- `POST /admin/api/categories`
- `PUT /admin/api/categories/:categoryId`
- `DELETE /admin/api/categories/:categoryId`
- `GET /admin/api/categories/:categoryId/data`
- `POST /admin/api/categories/:categoryId/data`
- `PUT /admin/api/categories/:categoryId/data/:rowId`
- `DELETE /admin/api/categories/:categoryId/data/:rowId`
- `POST /admin/api/categories/:categoryId/import-excel`
- `GET /admin/api/categories/:categoryId/export-excel`

#### Image Collections

- `GET /api/image-collections`
- `GET /admin/image-collections`
- `GET /admin/image-collections/:id`
- `POST /admin/image-collections`
- `PUT /admin/image-collections/:id`
- `DELETE /admin/image-collections/:id`

#### Customer and Support APIs

- `GET /admin/customer-stats`
- `GET /admin/customer-stats/data`
- `GET /api/users/:userId/notes`
- `PATCH /api/users/:userId/notes`

### View-to-Asset Map

| Template | Active route(s) found in `index.js` | Local CSS | Local JS |
| --- | --- | --- | --- |
| `views/admin-api-usage.ejs` | `/admin/api-usage` | `/css/style.css`, `/css/admin-api-usage.css` | `/js/admin-api-usage.js` |
| `views/admin-broadcast.ejs` | `/admin/broadcast` | `/css/style.css`, `/css/admin-broadcast.css` | `/js/admin-broadcast.js` |
| `views/admin-categories.ejs` | `/admin/categories` | `/css/style.css`, `/css/admin-settings-v2.css` | None |
| `views/admin-category-data.ejs` | `/admin/categories/:categoryId/data` | `/css/style.css` | None |
| `views/admin-chat.ejs` | `/admin/chat` | `/css/style.css`, `/css/chat-redesign.css`, `/css/chat-a11y.css`, `/css/chat-meta.css` | `/socket.io/socket.io.js`, `/js/chat-redesign.js` |
| `views/admin-customer-stats.ejs` | `/admin/customer-stats` | `/css/style.css`, `/css/admin-customer-stats.css` | `/js/admin-customer-stats.js` |
| `views/admin-dashboard-v2.ejs` | `/admin/dashboard` | `/css/style.css`, `/css/admin-dashboard-v2.css` | `/js/admin-dashboard-v2.js`, `/js/import-export-manager.js` |
| `views/admin-facebook-comment.ejs` | No active render route found in static scans | `/css/style.css` | None |
| `views/admin-facebook-posts.ejs` | `/admin/facebook-posts` | `/css/style.css`, `/css/admin-facebook.css` | `/js/admin-facebook-posts.js` |
| `views/admin-followup.ejs` | `/admin/followup` | `/css/style.css`, `/css/admin-followup.css` | `/socket.io/socket.io.js`, `/js/followup-dashboard.js` |
| `views/admin-instruction-chat.ejs` | `/admin/instruction-ai`, `/admin/instruction-chat` | `/css/instruction-chat.css` | `/js/instruction-chat.js` |
| `views/admin-instruction-conversations.ejs` | `/admin/instruction-conversations` | `/css/instruction-conversations.css` | `/js/instruction-conversations.js` |
| `views/admin-login.ejs` | `/admin/login` | `/css/style.css` | `/js/admin-login.js` |
| `views/admin-orders.ejs` | `/admin/orders` | `/css/style.css`, `/css/admin-orders-v2.css` | `/js/admin-orders-v2.js` |
| `views/admin-settings-v2.ejs` | `/admin/settings2` | `/css/style.css`, `/css/admin-settings-v2.css` | `/js/admin-settings-v2.js`, `/js/image-collections-management.js`, `/js/notification-channels.js` |
| `views/admin-settings.ejs` | `/admin/settings` | `/css/style.css`, `/css/admin-settings.css` | `/js/admin-settings.js`, `/js/bot-management.js`, `/js/instructions-management.js`, `/js/image-collections-management.js` |
| `views/edit-data-item-v2.ejs` | `/admin/instructions-v2/:instructionId/data-items/new`, `/admin/instructions-v2/:instructionId/data-items/:itemId/edit` | `/css/style.css` | None |
| `views/edit-data-item-v3.ejs` | `/admin/instructions-v3/:instructionId/data-items/new`, `/admin/instructions-v3/:instructionId/data-items/:itemId/edit` | `/css/style.css` | None |
| `views/edit-instruction.ejs` | `/admin/instructions/:id/edit` | `/css/style.css` | None |

## Dependencies

Source: `index.js`, `views/*.ejs`, `public/js/*.js`, `public/css/*.css`, `infra/runtimeRouteGuard.js`.

- Express route declarations in `index.js`
- EJS page templates and partials
- Page-specific frontend modules in `public/js/`
- Page-specific and shared styling in `public/css/`
- Runtime route-guard rules that restrict which routes can exist on which runtime

## Data Flow

Source: `index.js`, `views/*.ejs`, `public/js/*.js`.

1. Express route declarations define the reachable HTTP surface.
2. Some routes render EJS templates, which then load local JS and CSS assets.
3. Many rendered pages call back into JSON endpoints defined in the same `index.js` file.
4. Runtime route guards then reduce the effective surface depending on whether the process is `admin-app` or `public-ingest`.

## Hotspots

Source: `index.js`, `views/*.ejs`, `public/js/*.js`, `infra/runtimeRouteGuard.js`.

- The route surface is large and centralized, which increases merge conflicts and accidental regressions.
- Static extraction can pick up commented placeholders, which is why the raw match count is higher than the active route count used here.
- Dormant templates can look active if an agent checks `views/` only and skips the matching `res.render(...)` scan in `index.js`.

## Safe-Change Rules

Source: the files listed above.

- Update this inventory whenever a route, render target, or page-specific asset mapping changes.
- When changing a page, inspect both the template and its attached JS/CSS files before editing endpoints.
- Check `infra/runtimeRouteGuard.js` before assuming a route is reachable in every runtime mode.

## Known Gaps

Source: static extraction behavior from `index.js`.

- This appendix is static, not generated at runtime.
- Dynamic middleware behavior and route-level auth are not fully represented by the path inventory alone.
- Commented-out routes require manual review when the extractor matches them.

## Risk Notes

Source: `index.js`, `views/*.ejs`, `public/js/*.js`.

- Route drift is likely because there is no central registry or generated API contract.
- Template reachability and asset reachability can diverge over time, leaving dormant UI artifacts in the repo.
- Large route families in one file make it easy to change the wrong handler during multi-feature work.

## Checkpoint Summary

Source: `index.js`, `views/*.ejs`, `public/js/*.js`, `public/css/*.css`.

- The active HTTP surface is now inventoried by family.
- The main admin templates are mapped to their local JS/CSS dependencies.
- Dormant view artifacts are called out explicitly where static scans found no active render route.

## Next Actions

- Re-run the static extractor and update this appendix whenever route families change.
- Add a generated route registry or OpenAPI-style export if route churn stays high.
- Add route-level auth annotations in a future iteration if admin-surface hardening becomes a priority.
