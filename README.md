# Personal Money Manager

Offline-first MERN starter for personal finance. The client is a React + TypeScript PWA; the API is Express + TypeScript; MongoDB is accessed through Mongoose. This first implementation slice includes the requested core schemas, a protected transaction CRUD API, PWA shell, and local create/outbox flow. The endpoint table is the target contract for features that are not implemented yet.

## Build steps

1. **Set up the workspace.** Install dependencies from the repository root with `npm install`. Copy `server/.env.example` to `server/.env`, configure MongoDB and strong JWT secrets, then start the API and Vite in separate terminals with `npm run dev`.
2. **Define the data boundary.** The Mongoose models live in `server/src/models`. Every personal record has a `userId`; API handlers always take that ID from the verified access-token cookie, never from request data. Categories with a null owner are read-only built-ins.
3. **Secure account sessions.** `server/src/routes/auth.ts` implements email registration/login, Google Identity credential verification, short-lived access JWTs and rotating refresh tokens in `HttpOnly`, `Secure` (production), `SameSite=Lax` cookies. Only refresh-token hashes are persisted. Configure `GOOGLE_CLIENT_ID`; add origin/CSRF validation and rate limiting before production deployment.
4. **Add transaction and budget workflows.** Start with the implemented transaction endpoints, then add category and budget CRUD using the same owner-scoped query pattern. Store money as integer minor units (paise for INR), with an ISO 4217 currency code, to avoid floating-point rounding.
5. **Make the client installable and offline-capable.** `client/vite.config.ts` configures `vite-plugin-pwa` with Workbox precaching. `client/src/db.ts` stores local records and a durable mutation outbox in IndexedDB via Dexie. `client/src/sync.ts` flushes the outbox after reconnect and at app startup. Browser Background Sync is opportunistic; the online/startup fallback is required, especially on iOS.
6. **Complete the product.** Add authenticated screens for quick-add, recurring schedules, budgets and alerts, calendar/search, analytics, and exports. Keep OCR (Tesseract.js) on-device and treat its output as an editable suggestion. Add backup/restore only after the import validator, ownership checks, limits, and duplicate policy are in place.

## MongoDB model summary

- **User**: normalized email, Google subject, password hash when applicable, preferences, and hashed refresh-session records.
- **Transaction**: owner, client-generated stable ID, amount in minor units, currency, income/expense, category, payment mode, occurrence time, description/tags, optional recurrence metadata, and soft-delete timestamp. A unique `{userId, clientId}` index makes retries idempotent.
- **Category**: either a built-in (`userId: null`) or an owner-created category with icon/color and type applicability.
- **Budget**: owner, month key (`YYYY-MM`), optional category (null means overall), and limit in minor units. A unique owner/month/category index prevents duplicate budgets.

## REST API contract

All routes are rooted at `/api/v1`; JSON errors use `{ "error": { "code", "message" } }`. Authenticated routes derive `userId` exclusively from the access cookie. Paginated list endpoints return `{ items, nextCursor }`.

| Method | Path | Purpose |
|---|---|---|
| POST | `/auth/register`, `/auth/login` | Create/sign in with email credentials; set cookies |
| GET | `/auth/google`, `/auth/google/callback` | Google OAuth Code + PKCE, then set app cookies |
| POST | `/auth/refresh`, `/auth/logout` | Rotate refresh cookie / revoke current session |
| GET/POST | `/transactions` | Filter and cursor-page own transactions / create one |
| GET/PATCH/DELETE | `/transactions/:id` | Read/update/soft-delete own transaction |
| POST | `/sync/push` | Idempotently apply queued client mutations; return per-mutation outcomes |
| GET | `/sync/pull?since=...` | Return changes for the authenticated user since a server cursor |
| GET/POST | `/categories` | List built-ins + own categories / create a category |
| PATCH/DELETE | `/categories/:id` | Update/delete own category (reject deletion while referenced, or require reassignment) |
| GET/POST | `/budgets` | List by month / create overall or category budget |
| PATCH/DELETE | `/budgets/:id` | Update/delete own budget |
| GET | `/analytics/summary`, `/analytics/trends` | Scoped aggregates for a period |
| GET | `/export?format=csv\|xlsx\|pdf\|json&from=...&to=...` | Export only the signed-in user's data |
| GET/POST | `/backup`, `/restore` | Download full user backup / validate and merge or replace own records |

For every update/delete/export/restore query include `{ userId: req.auth.userId }`. Never accept an owner ID from a query, body, backup file, or URL. For restore, discard imported owner IDs and assign the current owner; validate schema and referential integrity, dedupe by stable transaction ID/hash, and commit in a MongoDB transaction where supported.

## Offline mutation protocol

1. Generate a UUID `clientId` and idempotency key on the device. Save the transaction locally and enqueue the mutation in the same IndexedDB transaction.
2. Render from the local database immediately. Mark the row pending; do not wait for network access.
3. On `online`, app startup, or an optional Background Sync event, send queued mutations in order with credentials. Server uniqueness on `{userId, clientId}` makes retries safe.
4. Remove successful queue entries and store the server version. Keep validation/auth failures for user resolution; retry network/5xx errors with exponential backoff. On 401, attempt refresh then retry once.
5. Pull server changes using a cursor and merge by stable ID/revision. For conflicting edits, retain both versions or ask the user; do not silently overwrite financial data. A tombstone represents deletion until all clients have observed it.

Workbox Background Sync is a best-effort enhancement for supported browsers, not the source of truth. The Dexie outbox is durable and the app-level reconnect/startup runner works when Background Sync is unavailable. iOS requires HTTPS and Safari's Add to Home Screen flow; browser limits mean the app can sync when it next runs, but cannot guarantee arbitrary background execution while closed.

## Local development

Use Node.js 20+, MongoDB, and HTTPS in production. Cookie authentication requires a same-site deployment or a carefully configured CORS allowlist with credentials and CSRF/origin validation. The starter intentionally leaves OAuth provider credentials and production secrets to environment configuration.
