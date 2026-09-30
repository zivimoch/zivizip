# Architecture

## Runtime

```text
Browser
  ├─ Guest workspace → IndexedDB
  ├─ Account cache   → separate IndexedDB database
  └─ /api            → Rust Notes service → SQLite volume
                          └─ SSE → change notifications
```

SvelteKit builds a static application served by Nginx. Vite provides the development server. Both proxy same-origin API requests to the Notes service; the database and API container have no host-facing ports.

The service owns Notes, the single-owner session, and registration-interest records. Account notes synchronize over HTTP and SSE. The service worker caches the application shell and excludes API requests.

## Storage boundaries

- Guest data is scoped to the browser profile and origin. It is never uploaded merely by logging in.
- Account data is stored on the server. A separate browser cache supports offline reading and is cleared on logout.
- Login offers an explicit guest-note copy; original guest notes remain local.
- Revision checks preserve conflicting edits as separate copies. Delete requires the current revision.
- JSON backups include implemented note/workspace data. Media and full-feature archives remain planned.

## Service boundaries

| Domain  | Ownership                                                 | Status               |
| ------- | --------------------------------------------------------- | -------------------- |
| Notes   | Text notes, revisions, future drawings and attachments    | Implemented for text |
| Tasks   | Task state and ordering                                   | Prototype            |
| Finance | Transactions, categories, monthly budgets and realization | Prototype            |
| Goals   | Goals and links to source records                         | Prototype            |

Future services must communicate through APIs or events, rather than writing each other's tables. Goals should consume Tasks/Finance changes and retain only their own relationships and aggregates.

## Deployment direction

The current SQLite service is a single-instance design. Multiple replicas require a database and event-delivery design appropriate for concurrent service instances; sharing the SQLite volume across replicas is not supported.

Planned deployment uses Kubernetes, separate environments, project-specific configuration/secrets/storage, and a shared TLS gateway. Namespace separation requires explicit network and access policies. Jenkins and GitHub are the intended delivery tools; no pipeline or cluster configuration is included yet.

## Decisions

- [ADR 0001: Browser-local notes](decisions/0001-local-notes.md)
- [ADR 0002: Owner account and Notes service](decisions/0002-local-owner-account.md)
