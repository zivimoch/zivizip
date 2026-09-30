# API and accounts

All endpoints use the frontend origin. Mutations require an allowed `Origin` and `X-Zivizip: 1`. API responses use `Cache-Control: no-store`.

| Endpoint                          | Access               | Purpose                         |
| --------------------------------- | -------------------- | ------------------------------- |
| `GET /api/health`                 | Public               | Service health                  |
| `POST /api/session`               | Owner credentials    | Sign in                         |
| `GET /api/session`                | Session              | Restore and renew session       |
| `DELETE /api/session`             | Current cookie       | Revoke session                  |
| `GET /api/notes`                  | Owner                | List notes                      |
| `POST /api/notes`                 | Owner                | Create note                     |
| `PUT /api/notes/:id`              | Owner                | Update note with revision check |
| `DELETE /api/notes/:id`           | Owner                | Delete at the supplied revision |
| `GET /api/events`                 | Owner                | SSE invalidation notifications  |
| `POST /api/registration-interest` | Public, rate-limited | Submit email and message        |
| `GET /api/registration-interest`  | Owner                | Latest 200 submissions          |

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

Workspace backup version 2 includes Text and Draw notes. Import also accepts version 1 Text backups and creates new note IDs. Viewport, selection and undo history are not part of the portable document. PNG export is transparent and limited to 2,400 pixels on the longest side.
