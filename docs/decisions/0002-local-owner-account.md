# Local owner account and Notes service

Status: accepted, 2026-09-30.

## Product behavior

The main workspace remains the entry page. The lower-left account control opens a menu and a login modal. There is no login route and no public account creation endpoint. One owner account is provisioned from a private local credential file.

Register opens an interest form, not an account creator. Submitting explicitly sends an email and message to the service. Guest notes and workspace content never accompany this request. First-visit guest onboarding explains browser-local storage, backup, and this exception. Acknowledgement is stored in IndexedDB per origin/browser profile; IP is not an identity or onboarding identifier.

## Architecture and alternatives

A Rust/Axum Notes service owns SQLite data on a persistent Docker volume. It also hosts the single-owner session and registration-interest endpoints for the current single-owner deployment. Modules/endpoints are the initial boundaries; authentication and Notes currently share one process. Tasks, Finance and Goals have no backend in this slice.

SQLite avoids a separate database process for one owner and enables transactional revision checking. This is a single-instance choice, not a shared-volume strategy for multiple replicas. Before Kubernetes replicas or multiple backend instances, decide on a server database (such as PostgreSQL), service-specific ownership, distributed sessions/rate limits, and an event bus. Do not share this SQLite volume among concurrent service replicas.

HTTP handles reads/writes; SSE invalidates note lists on changes and rechecks sessions. It is synchronization between devices, not live character-by-character collaborative editing. Revision conflicts preserve a separate copy. Deletion requires the latest revision.

## Session and privacy

The server hashes the owner password with Argon2id. Sessions contain 256-bit random secrets; only their SHA-256 digest is stored in SQLite. The browser receives an HttpOnly, SameSite=Strict cookie with a 365-day renewable lifetime. Successful session checks renew expiration. Browser restarts do not revoke it. Logout deletes that session; expired/deleted cookies or owner credential changes require login again. Replacing the provisioned credentials invalidates existing sessions on service restart.

Local HTTP explicitly sets COOKIE_SECURE=false. HTTPS deployment must set it true, restrict ALLOWED_ORIGINS to actual origins, and review reverse-proxy trust. Mutation endpoints require an allowed Origin plus the custom X-Zivizip header; no cross-origin credential sharing is enabled. API responses use no-store, and the service worker does not cache API routes. Login and interest submission have bounded in-memory rate limits; the service is reachable only behind the local proxies. No ports expose SQLite or the Notes service to the host.

The account IndexedDB database is distinct from guest data. Offline account data is read-only. Logout/expired-session detection clears the account cache and restores the guest workspace. Pending failed edits remain visible with retry/download rather than being silently discarded. Shared browser profiles are not separate OS-level security boundaries.

Guest-to-account copy requires an explicit choice after login. Source guest notes remain local. Account import creates copies; a failed batch can be partial and must not be described as atomic. Future attachment/full-feature backups remain pending.

## Local operation

Run `python3 scripts/setup-local-account.py` before Compose. It creates `.local/owner.json` once and never overwrites it. The containing directory is owner-only (0700); the file is readable by the non-root container via a read-only Compose secret. `.local/` is excluded from Git and Docker build contexts. Do not include credentials in screenshots, commits, logs or bug reports.

`docker compose --profile preview up --build -d` starts the service and frontend. `docker compose down` preserves the database volume; `down -v` destroys it. There is no email delivery integration: interest submissions are stored in the local service database. This configuration serves a local installation.

## Limits

No self-service registration, password reset email, external identity provider, multi-owner tenancy, admin dashboard or production abuse controls are implemented. The initial service synchronously serializes short SQLite transactions; measure contention before expanding traffic. SSE falls back to a 20-second refresh signal and currently reloads all Notes. Large collections and media require metadata-first loading and narrower events.

## Review notes

Workspace activation is prepared before changing the UI's active repository. A failed account fetch cannot leave guest notes attached to the account writer. Account repositories are deactivated during logout/switch so delayed responses cannot repopulate a cleared private cache. The HTTP helper accepts successful empty responses (for example the interest form's 201) as well as JSON.

Session design references: [OWASP session management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html), [OWASP CSRF prevention](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html).
