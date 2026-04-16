# Phase 4: API and UI Surface

## Purpose

This document maps the HTTP surface, admin pages, frontend asset wiring, and Socket.IO event contract so future agents can tell which page or endpoint owns a behavior before changing it.

## Source-of-Truth Files

- `index.js`
- `views/*.ejs`
- `views/partials/*.ejs`
- `public/js/*.js`
- `public/css/*.css`
- `infra/adminRealtime.js`
- `infra/eventBus.js`
- `infra/runtimeRouteGuard.js`

## Current Behavior

Source: route handlers in `index.js`, EJS views, frontend assets under `public/`.

### Public Surface Families

| Family | Main paths | Notes |
| --- | --- | --- |
| Health/root | `/health`, `/` | Root redirects to admin dashboard |
| Assets | `/assets/instructions/:fileName`, `/assets/followup/:fileName`, `/assets/chat-images/:messageId/:imageIndex`, `/broadcast/assets/:filename` | Served by `index.js`; route guard allows these on `public-ingest` |
| Short links | `/s/:code` | Uses Postgres-backed `short_links` |
| Webhooks | `/webhook/line/:botId`, `/webhook/facebook/:botId`, `/webhook/instagram/:botId`, `/webhook/whatsapp/:botId` | Verification and event ingress for Meta platforms; line is POST only |

### Admin Page Families

Source: `views/*.ejs`, render routes in `index.js`.

| Page | Render route | Frontend assets |
| --- | --- | --- |
| Dashboard / Instructions V2 | `/admin/dashboard` | `public/js/admin-dashboard-v2.js`, `public/js/import-export-manager.js`, `public/css/admin-dashboard-v2.css` |
| Instruction item editors | `/admin/instructions-v2/*`, `/admin/instructions-v3/*`, legacy `/admin/instructions/:id/edit` | Inline editor logic inside EJS, shared `public/css/style.css`, `public/css/spreadsheet-v3.css` for V3 |
| Admin settings (legacy) | `/admin/settings` | `public/js/admin-settings.js`, `public/js/bot-management.js`, `public/js/instructions-management.js`, `public/js/image-collections-management.js`, `public/css/admin-settings.css` |
| Admin settings V2 | `/admin/settings2` | `public/js/admin-settings-v2.js`, `public/js/image-collections-management.js`, `public/js/notification-channels.js`, `public/css/admin-settings-v2.css` |
| Admin chat | `/admin/chat` | `public/js/chat-redesign.js`, Socket.IO client, `public/css/chat-redesign.css`, `public/css/chat-a11y.css`, `public/css/chat-meta.css` |
| Orders | `/admin/orders` | `public/js/admin-orders-v2.js`, `public/css/admin-orders-v2.css` |
| Follow-up | `/admin/followup` | `public/js/followup-dashboard.js`, Socket.IO client, `public/css/admin-followup.css` |
| Broadcast | `/admin/broadcast` | `public/js/admin-broadcast.js`, `public/css/admin-broadcast.css` |
| Instruction AI | `/admin/instruction-ai` | `public/js/instruction-chat.js`, `public/css/instruction-chat.css` |
| Conversation history | `/admin/instruction-conversations` | `public/js/instruction-conversations.js`, `public/css/instruction-conversations.css` |
| Categories | `/admin/categories`, `/admin/categories/:categoryId/data` | Mostly inline scripts inside EJS, `public/css/admin-settings-v2.css` or shared `style.css` |
| Facebook posts/comment policies | `/admin/facebook-posts` | `public/js/admin-facebook-posts.js`, `public/css/admin-facebook.css` |
| Facebook comment config template | No active render route found in static `index.js` extraction; template exists in `views/admin-facebook-comment.ejs` | Mostly inline logic in EJS if the template is reactivated |
| API usage | `/admin/api-usage` | `public/js/admin-api-usage.js`, `public/css/admin-api-usage.css` |
| Customer stats | `/admin/customer-stats` | `public/js/admin-customer-stats.js`, `public/css/admin-customer-stats.css` |
| Login | `/admin/login` | `public/js/admin-login.js`, shared `style.css` |

`views/admin-facebook-comment.ejs` is present in the repo, but static route extraction and `res.render(...)` scans did not find an active page route that renders it from `index.js`.

### API Families

Source: `index.js`.

Main JSON route families:

- Admin auth and passcodes: `/api/auth/session`, `/api/admin-passcodes*`
- Instructions V2: `/api/instructions-v2*`
- Instruction AI and conversation history: `/api/instruction-ai*`, `/api/instruction-conversations*`
- Bot CRUD: `/api/line-bots*`, `/api/facebook-bots*`, `/api/instagram-bots*`, `/api/whatsapp-bots*`
- Settings and API keys: `/api/settings*`, `/api/openai-keys*`, `/api/openai-usage*`
- Chat/admin actions: `/admin/chat/*`
- Orders/admin actions: `/admin/orders/*`
- Follow-up/admin actions: `/admin/followup/*`
- Broadcast/admin actions: `/admin/broadcast/*`
- Notifications/admin actions: `/admin/api/notification-*`
- Categories/admin actions: `/admin/api/categories*`
- Image collections/admin actions: `/admin/image-collections*`, `/api/image-collections`
- User notes/filter test: `/api/users/:userId/notes`, `/api/filter/test`

### Auth Boundaries

Source: auth middleware and route definitions in `index.js`, `utils/auth.js`.

Current auth pattern:

- Admin login is handled by session-backed passcode logic in `index.js` and `utils/auth.js`.
- Many sensitive routes use `requireAdmin` or `requireSuperadmin`.
- Not every legacy admin HTML route is consistently protected in the same way, so route-level middleware must be checked per handler before assuming protection.

### Socket.IO Surface

Source: `index.js`, `infra/adminRealtime.js`, `infra/eventBus.js`, frontend consumers in `public/js/`.

Socket.IO usage is admin-only:

- Clients join room `admin`.
- `infra/adminRealtime.js` emits locally and bridges through Redis pub/sub when available.
- Event names emitted from `index.js` include:
  - `newMessage`
  - `followUpTagged`
  - `followUpScheduleUpdated`
  - `orderExtracted`
  - `orderUpdated`
  - `orderDeleted`
  - `broadcastProgress`
  - `chatCleared`
  - `userTagsUpdated`
  - `userPurchaseStatusUpdated`

## Dependencies

Source: `views/*.ejs`, `public/js/*.js`, `public/css/*.css`.

Frontend/admin pages depend on:

- EJS server-side rendering
- Bootstrap 5 CDN assets on most admin pages
- Font Awesome CDN assets
- Socket.IO client for chat/follow-up realtime pages
- Chart.js for API usage charts
- SweetAlert2 on some settings/category pages
- Jspreadsheet and jsuites for spreadsheet editor V3

## Data Flow

Source: `index.js`, `views/*.ejs`, `public/js/*.js`, `infra/adminRealtime.js`.

### Rendered Page Flow

1. `index.js` renders an EJS page.
2. The page loads one or more page-specific scripts from `public/js/`.
3. The frontend calls JSON endpoints in `index.js`.
4. Mutations persist through repository or helper logic.
5. Realtime pages subscribe to admin Socket.IO events and refresh visible state.

### API Mutation Flow

1. Browser sends JSON or multipart data to an admin or API route.
2. Route validates and normalizes payloads.
3. Route uses repository/service/helper functions.
4. Route returns JSON and may emit admin events for cross-tab updates.

## Hotspots

Source: `index.js`, `views/*.ejs`, `public/js/*.js`.

- Route ownership is centralized in `index.js`, which makes endpoint discovery easy but increases merge risk and regression risk.
- Legacy and V2 instruction surfaces coexist.
- Some admin pages use dedicated frontend modules; others rely on inline page scripts inside EJS files.
- Socket.IO event names are implicit contracts between `index.js` and frontend pages, not centrally typed.

## Safe-Change Rules

Source: route handlers and frontend assets listed above.

- Before changing a page, inspect both its EJS template and its page-specific JS/CSS file.
- Before renaming or removing an endpoint, check whether the page script calls it directly through `fetch`.
- Before changing a Socket.IO payload shape, inspect the consumer pages that subscribe to that event.
- When adding admin routes, verify whether they belong on `admin-app` only or should be public-ingest accessible.

## Known Gaps

Source: `views/*.ejs`, `public/js/*.js`.

- There is no generated API spec.
- Route-family counts are derived from static inspection of `index.js`, not from a router registry.
- Some legacy pages still rely on inline scripts, which makes ownership less obvious than pages backed by `public/js/*.js`.

## Risk Notes

Source: `index.js`, `views/*.ejs`, `public/js/*.js`, `infra/runtimeRouteGuard.js`.

- Centralized route ownership in `index.js` increases regression risk because unrelated API families live in the same file.
- Static route extraction can overcount commented routes or miss conditionally-generated behavior, so dormant templates and placeholder endpoints require manual judgment.
- Auth boundaries are route-local, not centrally declared, which makes it easy to add an endpoint without matching the surrounding protection level.

## Checkpoint Summary

Source: `index.js`, `views/*.ejs`, `public/js/*.js`, `public/css/*.css`.

- Public routes, admin routes, webhook families, Socket.IO events, and page-to-asset ownership are now mapped.
- The main frontend/admin surfaces are tied back to their templates and scripts.
- Dormant UI surfaces, such as `admin-facebook-comment.ejs`, are called out explicitly instead of being assumed live.

## Next Actions

- Use `appendices/route-inventory.md` when editing or adding endpoints.
- Normalize auth protection across legacy admin page routes.
- Consider extracting a route registry or OpenAPI-like contract if route churn remains high.
