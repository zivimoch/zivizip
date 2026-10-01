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

The service owns Notes, Tasks, Finance transactions, the single-owner session, and registration-interest records. Account changes synchronize over HTTP and SSE. The service worker caches the application shell and excludes API requests.

## Storage boundaries

- Guest data is scoped to the browser profile and origin. It is never uploaded merely by logging in.
- Account data is stored on the server. A separate browser cache supports offline reading and is cleared on logout.
- Login offers an explicit guest-workspace copy; original notes, tasks and transactions remain local.
- Revision checks preserve conflicting edits as separate copies. Delete requires the current revision.
- Version 5 JSON backups include notes, Draw geometry, referenced image attachments, active/archived tasks, transactions and workspace preferences. Versions 1–4 remain importable.

## Service boundaries

| Domain  | Ownership                                                 | Status                                                 |
| ------- | --------------------------------------------------------- | ------------------------------------------------------ |
| Notes   | Text/Draw notes, revisions, image attachments             | Text and Draw implemented                              |
| Tasks   | Task state, dates, related amounts, ordering and archives | Implemented in local API                               |
| Finance | Transactions, categories, monthly budgets and realization | Transactions implemented; planning remains a prototype |
| Goals   | Goals and links to source records                         | Prototype                                              |

Future services must communicate through APIs or events, rather than writing each other's tables. Goals should consume Tasks/Finance changes and retain only their own relationships and aggregates.

## Deployment direction

The current SQLite service is a single-instance design. Multiple replicas require a database and event-delivery design appropriate for concurrent service instances; sharing the SQLite volume across replicas is not supported.

Planned deployment uses Kubernetes, separate environments, project-specific configuration/secrets/storage, and a shared TLS gateway. Namespace separation requires explicit network and access policies. Jenkins and GitHub are the intended delivery tools; no pipeline or cluster configuration is included yet.

## Decisions

- [ADR 0001: Browser-local notes](decisions/0001-local-notes.md)
- [ADR 0002: Owner account and Notes service](decisions/0002-local-owner-account.md)

## Draw documents

The SVG editor loads dynamically when a Draw note opens. Shape geometry and labels use a validated, versioned JSON document in the note body. Each completed gesture creates one revision; pointer movements do not send network requests. SSE refreshes wait while a local drawing gesture or text edit is active, preserving the revision used for conflict detection.

Pan and zoom are stored separately per browser workspace. Selection and undo history are transient. Account drawings follow the same login, copy, conflict, cache and offline rules as Text notes. The service worker precaches the editor for guest offline use.

## Text editing

The Text editor stores typed paragraph/image blocks rather than arbitrary HTML. Normal-flow anchors reserve space at paste time; an independent image layer places pixels behind text and stores movement/rotation separately. Editing below a moved image compensates for anchor movement so the image does not drift. Moving an image converts its reserved flow space to editable blank paragraphs, preserving the vertical position of subsequent text. Optional paragraph heights retain the exact spacing until a blank line is edited. Backspace/Delete at image boundaries and range deletion remove the affected images; the editor history restores them with undo.

Attachment bytes live outside note revisions. Guest bytes are IndexedDB blobs; the single-owner service stores content-addressed bytes in SQLite. Typing, resize and rotation only write document metadata. This keeps HTTP/SSE note synchronization independent of image byte size. A separate media store can replace the SQLite attachment table when deployment/storage requirements justify it.

Automatic list markers remain plain text in the portable document. Enter continues the current list or exits an empty item; Tab/Shift+Tab changes depth and alternates numeric/alphabetic levels. This uses the same storage, conflict and offline paths as ordinary paragraphs. Dragging selected list lines into Tasks copies their labels without changing the source.

List paragraphs preserve native browser text selection rather than setting `draggable` on each block. A native drag of selected list text carries task labels and activates the Tasks drop feedback. Drops back into the source editor are ignored for this task-transfer payload.

## Task workspace

Tasks use a separate frontend repository and Rust module within the existing API process. This keeps ownership distinct without adding a deployment dependency to the local milestone. Extraction into a standalone service remains a deployment decision.

An ordered task snapshot has one revision. SQLite transactions and IndexedDB transactions reject stale updates rather than silently overwriting another writer. Account changes trigger the existing SSE invalidation channel; guest tabs use BroadcastChannel. Refresh waits during drag and modal editing. A stale modal retains its fields so the user can reload the list and retry. Account data is cached separately and remains read-only offline.

Background reads do not disable existing task controls. Unchanged revisions leave the rendered list intact; reads invalidated by a local write or modal opening cannot replace its state. Cache writes retain the highest acknowledged revision so a delayed response cannot undo a completed write in offline storage.

The snapshot is bounded to 10,000 tasks and 2 MB. Updates currently send the full snapshot; this is a simple initial consistency model, not a large-collection performance claim. Per-task revisions, operation-based reordering and paginated archives are future scaling options. Task amounts are metadata; creating/completing tasks does not yet create Finance transactions.

## Finance ledger

Finance uses its own repository, SQLite snapshot table and authenticated endpoints within the local API process. Transactions carry an explicit income/expense type, integer IDR amount, category and calendar date. Monthly totals and date/category groups are derived in the browser. Budgets and automatic task links are not part of this ledger milestone.

Writes use a single snapshot revision with atomic conflict checks. Guest tabs use BroadcastChannel; account sessions use the existing SSE invalidation channel. Background reads keep controls stable and never replace newer cached revisions. Modal fields survive a rejected write so users can reload and retry. Offline account data comes only from the separate account cache. Logout clears that cache, while explicit guest copying uses stable transaction IDs to avoid duplication on retry.

Snapshots are bounded to 10,000 transactions and 2 MB; full-history pagination and operation-level updates remain future scaling work. Guest imports are atomic across workspace stores. Account imports span several API calls and can complete partially; they are not one cross-domain transaction.
