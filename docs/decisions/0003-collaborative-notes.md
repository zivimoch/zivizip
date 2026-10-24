# Collaborative Notes

Status: accepted. Supersedes the Notes revision-copy synchronization in ADR 0002.

## Contract

Account Notes and editable shared links exchange Yjs-compatible CRDT updates. Text characters and formatting merge; Draw objects merge by stable object ID, with deterministic last-writer resolution when the same object is modified concurrently. This is not character-level coauthoring inside a Draw text object. Shared links cannot modify note metadata or access other workspace data.

The browser uses Yjs and Quill Delta to translate the existing structured editor document into operations. Rust uses Yrs to apply updates and derive the canonical snapshot, which is validated before committing. The server never trusts a caller-supplied merged snapshot. Unicode offsets use UTF-16 on both sides.

SQLite stores CRDT state and the existing portable Note snapshot in one transaction. Existing Notes initialize lazily. JSON backups continue exporting content and attachments, not synchronization history. Replayed updates are idempotent; late updates cannot resurrect deleted Notes. Legacy full-document writes are rejected once collaboration is initialized, requiring old clients to refresh. Metadata updates use a separate owner-only endpoint.

## Interaction and recovery

- Editors display Connecting, Saving, Saved, Offline or an unsuccessful-save state. Ctrl/Cmd+S flushes pending changes; no manual Save button is needed.
- All Notes editors are read-only while the browser reports offline. Account/shared editors also lock after a failed synchronization request and unlock after reconnection. This does not change offline editing for other guest workspace features.
- Account/shared unsent state is retained in the browser's isolated workspace cache for retry. Closing a page with pending changes warns the user. Revoked permissions stop writes without automatically discarding the pending state.
- Remote Text updates preserve selection positions. Collaborative Undo tracks local operations rather than replacing the entire document with an earlier snapshot.
- Active account/shared Notes exchange updates after a 450 ms pause and poll every second. No room runs for unopened Notes. This provides bounded-latency synchronization, not presence cursors or a permanent WebSocket connection.

## Bounds and tradeoffs

Canonical content retains the existing 2 MB document, image and object limits. CRDT state is capped at 8 MB; sync requests accept up to 12 MB including base64 overhead. History compaction is not implemented. Repeated structural editing can grow synchronization state even if visible content stays small. Failures retain pending changes rather than silently replacing content.

Guest Notes remain local IndexedDB documents and are never uploaded by this feature. Offline read-only behavior applies to guest Text and Draw editors too. Browser network status is not proof of reachability; server request failures additionally lock account/shared editing.

## Rollback boundary

Keep a CRDT-aware API when rolling back frontend assets; older snapshot clients
will receive a refresh response instead of overwriting collaborative content.
Do not run a pre-CRDT writer against initialized Notes and later reuse their old
CRDT state: the snapshot and operation history could diverge. An API downgrade
requires a separately reviewed conversion with a database backup and all editors
stopped, preserving the latest canonical snapshots. No automatic history reset or
content conversion is performed.
