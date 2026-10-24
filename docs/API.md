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

Legacy stale updates produce conflict copies only before a Note initializes collaboration; afterward snapshot writes return `409` with a refresh instruction. Current clients use collaborative updates instead. Stale deletes return `409`. Authentication failures return `401`, invalid mutation origins return `403`, and rate limits return `429`. Account writes are not queued offline. Failed pending edits remain available for retry or download.

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

`PUT /api/tasks` accepts the same shape with the last-read revision. One transaction validates and replaces the snapshot, increments the revision and emits an SSE invalidation. A stale revision returns `409` without changing server data. Client drafts remain available for reload/retry. No duplicate tasks are created automatically.

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

## Shared notes

Owners manage a note's capability link with `GET`, `PUT` (`{"editable":false}`) and `DELETE /api/notes/{id}/share`. Creating a link is explicit; reading its configuration does not publish the note. Revocation invalidates the old token. Only server notes support sharing.

`GET /api/shared/{token}` returns the permitted note and its `editable` flag without an account session. `PUT` accepts content changes only when editing is enabled; owner metadata is preserved, and stale revisions return 409 rather than overwriting newer content. Clients retain unsaved changes on conflict. Shared image reads and uploads use `/api/shared/{token}/media/{asset}` and are restricted to the note or uploads made through that link. Links have upload and request limits. These endpoints do not grant workspace, task or finance access.

Shared pages carry `noindex,nofollow` and use a URL fragment for the capability token. API responses remain `no-store`. Treat the link as a credential: anyone holding it has its configured access until revoked.

## Goals and Set aside

`GET /api/goals` and `PUT /api/goals` use an authenticated revisioned document:
`{ revision, items, setAside? }`. `setAside` is an optional list of unique source
keys (`task:<id>` or `expense:<id>`), bounded to 20,000 entries and the existing
2 MB document/request limit. Clear and Restore change only this list. They never
delete tasks or transactions. Missing `setAside` on a legacy write preserves the
stored list; an explicit empty list restores all items. Stale revisions are
rejected and successful writes publish the existing workspace refresh event.

The card Completed control updates the goal's existing boolean `completed` field.
Backup v8 includes `goalSetAside`; imports remap source IDs, including tray-only
workspaces with no goals. Guest-to-account copying transfers tray state only with
the user's existing explicit workspace-copy action.

Rollback note: once the new field is stored, older API images that reject unknown
GoalState fields cannot read that document. Roll back only to a compatible API
image, or perform a separately reviewed, backed-up conversion that preserves the
tray data; do not restore the entire database just to change the frontend.

## Draw image attachments

Draw scene v1 now accepts `type: "image"` with a required lowercase SHA-256 `asset` identifier and two rectangle corner points. Non-image shapes cannot carry `asset`. Images use the same immutable WebP media endpoints as Text Notes; note writes require referenced attachments to exist. Shared access includes only images already referenced by that note or uploaded through its editable capability. Shared edits cannot change note kind.

Workspace backup v8 deduplicates both Text and Draw attachments. Guest-to-account copying and account backup prefetch include both document kinds. No database migration is required. A server/client predating Draw image support will reject image-bearing Draw documents; do not roll back to such a release without reviewing affected notes and taking a backup. Geometry-only Draw notes remain compatible.

Draw clipboard objects use a `zivizip-draw-v1:` JSON payload containing a validated scene and base64 WebP attachments. Payloads are limited to 16 MB and 100 distinct attachments; each attachment is hash-checked. File/image paste accepts up to 20 images per operation, using the existing 15 MB input, 1,600px edge and 1 MB compressed-image limits. Raster bytes are not embedded in saved scene JSON or undo revisions. Unreferenced media retention follows the existing attachment policy.

## Owner administration and visit summaries

`GET /api/admin` requires the existing owner session and returns the owner name,
active-session count, total retained visitor profiles and at most the latest 500
profiles. It does not return session tokens, password hashes or guest workspace
content. `DELETE /api/admin/sessions` revokes every session except the caller.
`DELETE /api/admin/visitors/{id}` and `DELETE /api/admin/interests/{id}` remove
individual records. All mutations retain the same-origin and custom-header guard.
Registration remains closed; this release does not create a multi-user workspace
or expose credential changes. `/admin/` is an unindexed interface, not an access
control boundary: every data endpoint checks the owner session.

`POST /api/visits` accepts `{id, name}`: a random browser-local UUID and an optional
name of at most 80 characters. The server stores a hash of that ID, a coarse
browser/OS classification, estimated country, first/last visit timestamps and a
visit count. A new visit requires a gap of 30 minutes. A reload updates last seen
without incrementing that count. Names and user-agent strings are self-reported,
not verified identity. Profiles are separate across browsers and may disappear
when site data is cleared. No device fingerprint, GPS, raw IP or workspace content
is stored in this table. Origin validation and rate limits apply, but this is not
an anti-fraud or exact unique-user analytics system.

The first guest notice explains these metadata requests and offers an opt-out;
Settings allows later opt-out and removal through `DELETE /api/visits` with the
original local ID. Failed reporting never blocks offline work. An offline first
visit is reported only on a later online launch. Removal requires connectivity.
Inactive records expire after 90 days and storage is capped at 20,000 profiles.
Operational proxy logs and backups have independent retention; removal from the
live visitor table does not rewrite backups.

Country lookup uses an optional local, read-only SQLite file at
`GEOIP_DATABASE` (default `/data/geoip.sqlite`). Prepare it with
`scripts/prepare-geoip.py` from the current [DB-IP Country Lite CSV](https://db-ip.com/db/download/ip-to-country-lite).
The database is CC BY 4.0; the admin page includes attribution. Install/replace the
lookup file atomically, readable by UID 10001, separately from application data.
No visitor IP is sent to DB-IP. Refresh the database monthly as an explicit
maintenance operation. Missing data returns an unavailable country, never an
invented location. The gateway must overwrite `X-Real-IP` and the API must remain
private; an untrusted direct connection can spoof the header. VPN and mobile
network locations are approximate. The lookup file is server-only and is not
shipped in frontend assets or guest backups.

## Collaborative Notes

`POST /api/notes/{id}/sync` requires the owner session. `POST /api/shared/{token}/sync` checks the current capability on every request. Both accept `{vector, update?}` as base64 Yjs v1 state-vector/update bytes and return `{metadata, editable, state, vector}`. `metadata` contains Note fields except body/rich; document content is reconstructed from CRDT state instead of resending the whole snapshot on every poll. `state` contains the server diff against the supplied vector; `vector` acknowledges server-integrated operations. Omitting `update` polls without writing content. Read-only links may poll but cannot submit updates.

Updates merge inside a SQLite transaction, project to validated Text/Draw content and preserve note identity. Duplicate updates do not increment the revision. Unknown document roots, invalid content, unauthorized media, oversized state and revoked permissions are rejected atomically. Full state is capped at 8 MB and sync request bodies at 12 MB.

`PUT /api/notes/{id}/metadata` accepts `{name, category, icon}` and changes only those owner-controlled fields without overwriting concurrently edited content. Note deletion still requires a current revision. See ADR 0003 for storage, retry and compatibility details.
