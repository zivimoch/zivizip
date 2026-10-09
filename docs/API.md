# API and accounts

All endpoints use the frontend origin. Mutations require an allowed `Origin` and `X-Zivizip: 1`. API responses use `Cache-Control: no-store`.

| Endpoint                          | Access               | Purpose                            |
| --------------------------------- | -------------------- | ---------------------------------- |
| `GET /api/health`                 | Public               | Service health                     |
| `POST /api/session`               | Owner credentials    | Sign in                            |
| `GET /api/session`                | Session              | Restore and renew session          |
| `DELETE /api/session`             | Current cookie       | Revoke session                     |
| `GET /api/notes`                  | Owner                | List notes                         |
| `POST /api/notes`                 | Owner                | Create note                        |
| `PUT /api/notes/:id`              | Owner                | Update note with revision check    |
| `DELETE /api/notes/:id`           | Owner                | Delete at the supplied revision    |
| `GET /api/events`                 | Owner                | SSE invalidation notifications     |
| `GET /api/tasks`                  | Owner                | Task workspace and revision        |
| `PUT /api/tasks`                  | Owner                | Replace task workspace at revision |
| `GET /api/finance`                | Owner                | Transaction snapshot and revision  |
| `PUT /api/finance`                | Owner                | Replace transactions at revision   |
| `GET /api/finance/plans`          | Owner                | Financial plans and revision       |
| `PUT /api/finance/plans`          | Owner                | Replace plans at revision          |
| `POST /api/registration-interest` | Public, rate-limited | Submit email and message           |
| `GET /api/registration-interest`  | Owner                | Latest 200 submissions             |

## Owner setup

`python3 scripts/setup-local-account.py` generates `.local/owner.json` once. The directory is private and excluded from version control and image builds. Compose mounts the file read-only. The server stores an Argon2id password hash.

To change credentials, edit the local file and restart `notes`. Changed credentials revoke existing sessions on restart. There is no public account-creation or password-reset endpoint.

## Sessions

Session secrets are random 256-bit values; only SHA-256 digests are stored in the database. Cookies are HttpOnly and SameSite=Strict, with a 365-day lifetime renewed by successful session checks. Closing the browser does not revoke a session. Logout, expiry, cookie deletion, or credential rotation can require another login.

Local HTTP sets `COOKIE_SECURE=false`. HTTPS deployment must enable it and configure the exact allowed origins and trusted proxy path. Login and interest submissions use bounded, in-memory rate limits; limits reset when the process restarts.

## Registration interest

The registration modal collects an email and a message. Submitting sends those fields only; guest notes are not included. Requests are stored in SQLite without email delivery. An authenticated owner can inspect `/api/registration-interest` on the application origin.

## Persistence and errors

SQLite lives in the `notes-data` Docker volume. Normal container recreation preserves notes and sessions. Removing the volume destroys server data.

Stale updates produce conflict copies. Stale deletes return `409`. Authentication failures return `401`, invalid mutation origins return `403`, and rate limits return `429`. Account writes are not queued offline. Failed pending edits remain available for retry or download.

## Note documents

`kind` is `text` or `draw` and cannot be changed after creation. Missing `kind` on existing records is interpreted as `text`; the SQLite JSON records need no destructive migration. `body` remains a string: plain text for Text notes, or serialized `{ "version": 1, "shapes": [...] }` for Draw.

Draw objects contain an ID, type, points, color, stroke width, rotation angle, label, font size and local eraser masks. Client and server validate geometry, identifiers and colors. Limits are 2 MB UTF-8 per body, 2,000 objects, 100,000 combined geometry/eraser points, and 10,000 UTF-16 code units per label. World coordinates are bounded to ±1,000,000. Invalid documents return `400`.

Workspace backup versions 2 and 3 include Text and Draw notes. Import also accepts version 1 Text backups and creates new note IDs. Viewport, selection and undo history are not part of the portable document. PNG export is transparent and limited to 2,400 pixels on the longest side.

## Text images and attachments

Text notes may include a `rich` document containing versioned paragraph/image blocks and image placements. `body` remains their plain-text projection. Raw HTML is never stored or rendered. Draw notes cannot contain a Text document. Existing plain-text records remain compatible. Optional image `flow` (0–10,000 px) and empty-paragraph `height` (greater than 0, up to 40 px) preserve editable spacing after image movement. Missing fields retain ordinary paragraph and image flow behavior. Automatic list markers are stored in paragraph text.

`PUT /api/media/:sha256` stores one immutable WebP attachment, and `GET /api/media/:sha256` retrieves it. Both require the owner session; uploads also require the usual mutation headers. The service checks the WebP signature, content hash and 1 MB limit. Note writes reject missing attachment references. Guest attachments stay in a separate IndexedDB media table; account images are cached in the account database and cleared with it on logout.

Browser paste/file input accepts images up to 15 MB and converts them to WebP with a maximum edge of 1,600 pixels before upload/storage. Each converted image must fit 1 MB; a note supports up to 100 placements. Text/image documents are limited to 2 MB, independently of their attachment bytes. Requests are limited to 4.2 MB behind a 5 MB local proxy limit.

Backup version 3 embeds referenced attachment bytes once per content hash and retains placement/rotation. Versions 1 and 2 remain importable. Import validates attachment hashes before writing notes. Account copies transfer images only through the explicit guest-copy action. Images must be cached for offline viewing; unavailable images display a reconnect message. Account exports fetch missing referenced attachments before creating the archive.

Removing an image removes its document reference. Unreferenced attachment bytes are currently retained to support undo and conflict copies; automated attachment garbage collection is not implemented yet. JSON backup import currently accepts files up to 50 MB.

## Tasks

`GET /api/tasks` returns `{ "revision": 0, "items": [] }` for a new account workspace. Each task contains `id`, `title`, `date` (empty or `YYYY-MM-DD`), `amount` (integer IDR), `done`, `archived`, and `createdAt` (milliseconds). The UI sorts dated tasks chronologically before undated tasks. Array order breaks ties for equal dates and determines undated order.

`PUT /api/tasks` accepts the same shape with the last-read revision. One transaction validates and replaces the snapshot, increments the revision and emits an SSE invalidation. A stale revision returns `409` without changing server data. Client drafts remain available for reload/retry. This differs from Notes conflict copies: no duplicate tasks are created automatically.

Limits: 10,000 tasks, 2 MB serialized items, unique alphanumeric/hyphen IDs up to 64 characters, nonempty titles up to 150 UTF-16 units, valid calendar dates and integer amounts from zero through 1 trillion whole currency units. Authentication and mutation-origin rules apply to both endpoints. Existing account-local tasks are migrated before their browser cache is replaced; guest tasks are only copied with explicit consent.

Backup version 4 adds active and archived tasks to version 3 media/notes. Version 5 additionally includes transactions. Import accepts versions 1–5 and assigns new IDs to imported records. Server imports across Notes, media, Tasks and Finance can complete partially if a request fails; they are not one atomic transaction.

## Finance

`GET /api/finance` returns `{ "revision": 0, "items": [] }` for an empty ledger. Each transaction contains `id`, `type` (`income` or `expense`), `title`, `category`, `date` (`YYYY-MM-DD`), `amount` (positive integer whole currency units), and `createdAt` (milliseconds). Type is explicit and is not inferred from category names. Client month/group filters do not change stored data.

`PUT /api/finance` replaces the snapshot only at the supplied revision, increments that revision and emits an SSE invalidation. Stale revisions return `409`; malformed transactions return `400`. Rejections leave the previous snapshot intact. The session and mutation-origin requirements match Tasks. No guest ledger is uploaded on login without the explicit workspace-copy choice.

Limits: 10,000 transactions, 2 MB serialized items, unique alphanumeric/hyphen IDs up to 64 characters, nonempty descriptions up to 150 UTF-16 units, nonempty categories up to 60 units, valid dates and amounts from 1 through 1 trillion whole currency units. Combined absolute amounts cannot exceed JavaScript's safe-integer range. Account writes require connectivity; cached transactions are read-only offline.

## Financial planning

`GET /api/finance/plans` returns `{ revision, months, items }`. Month records contain `month` (`YYYY-MM`) and signed integer `opening`. Budget items contain `id`, `month`, `category`, `group` (`income`, `recurring`, `monthly`), integer `amount`, `note`, `enabled` and `automatic`.

`PUT` accepts the same shape, replaces the snapshot atomically at the supplied revision and emits an SSE invalidation. Stale revisions return `409`; malformed data or duplicate month/type/category budgets return `400`. Category matching trims whitespace and ignores case. Income and expense may use the same category, but recurring and monthly expenses cannot have separate budgets for the same category in one month.

Limits: 2,400 months, 10,000 budgets and 2 MB serialized snapshot; category names up to 60 UTF-16 units, notes up to 2,000, each budget from 0 through 1 trillion whole currency units, and opening balances within ±1 trillion whole currency units. Automatic entries must be zero-budget monthly expenses. Every persisted budget references an existing month record. These endpoints store plans only; realization is computed from `/api/finance` transactions. Guest plans are never uploaded without the explicit workspace-copy choice.

Transaction descriptions (`title`) may be empty; category and a positive whole-unit amount remain required. Currency selection is a browser workspace display preference and does not convert stored amounts.
