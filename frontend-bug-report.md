## Frontend Bug Report

- Context: reviewed admin UI pages (chat, settings v2, instructions dashboard) for runtime issues and client-side risks.

### 1) Template modal never opens on chat page
- Path: `public/js/chat-redesign.js:1447-1450`
- Behavior: `openTemplateModal()` is a stub that only shows a toast (“ฟีเจอร์ Template กำลังพัฒนา”), so the template button (`#btnTemplate`) and related UI in `views/admin-chat.ejs` cannot be used to insert canned replies.
- Impact: Chat agents cannot access the template modal or quick replies advertised by the UI; pressing the button/hotkey does nothing beyond a toast.
- Suggestion: Implement the modal logic (load templates, allow insert) or hide/remove the entry points until it is functional.

### 2) Follow-up config applied after initialization
- Path: `public/js/chat-redesign.js:4-48`, `views/admin-chat.ejs:403-412`
- Behavior: `ChatManager` initializes immediately with default `followUpConfig` and loads users before the server-provided `chatCenterFollowUpConfig` is assigned afterwards in the inline script.
- Impact: On first load the chat list/header uses defaults (e.g., shows follow-up badges/analysis) even when the server config disables them; it only corrects after a later refresh/poll.
- Suggestion: Pass the config into the constructor or set it before calling `new ChatManager()` so initial renders respect server settings.

### 3) Bot list rendering is vulnerable to HTML injection
- Path: `public/js/admin-settings-v2.js:73-95,107-171`
- Behavior: Bot data from `/api/line-bots` and `/api/facebook-bots` is interpolated directly into `innerHTML` without escaping (`bot.name`, `bot.description`, `bot.pageId`, etc.).
- Impact: A malicious bot name/description containing HTML/JS would execute when the settings page loads (stored XSS in admin console).
- Suggestion: Escape or set text via `textContent` when rendering bot fields, and validate the API response shape before rendering.

### 4) Bot settings crash when APIs return errors
- Path: `public/js/admin-settings-v2.js:73-95,98-171`
- Behavior: `loadBotSettings()` calls `lineRes.json()` / `fbRes.json()` and immediately passes the result to render helpers assuming an array. If the API responds with a non-200 or `{error: ...}`, `renderLineBots`/`renderFacebookBots` dereference `bots.length` and throw.
- Impact: Any transient API error blanks the Bot Settings tab with uncaught TypeError, leaving the UI unusable until a hard refresh.
- Suggestion: Check `res.ok` and `Array.isArray(...)` before rendering; show an error state instead of passing invalid data to the renderers.

### 5) Instruction import preview renders unescaped Excel data
- Path: `public/js/admin-dashboard-v2.js:730-765`
- Behavior: The Excel preview builds a table with `p.name` and `p.description` interpolated directly into `innerHTML`.
- Impact: A crafted Excel cell containing HTML/JS will execute in the admin dashboard during preview (pre-import XSS vector).
- Suggestion: Escape preview values or write them via `textContent` when constructing the preview table.
