# ADR 0001: Browser-local notes

Date: 2026-09-29. Status: accepted; account storage extends this design in ADR 0002.

## Decision

Use SvelteKit/TypeScript with a static workspace and Dexie/IndexedDB for guest notes and preferences. Keep persistence behind a repository interface so account storage can be introduced without sharing guest data.

Local writes use revisions inside IndexedDB transactions. Conflicting edits create a separate copy. Both database and backup formats have explicit versions.

## Consequences

The initial editor supports plain text. Rich text, images, Draw, and prototype migration require dedicated implementation; existing prototype storage is not modified.

Guest backups use JSON. Import validates records before one atomic transaction and assigns new IDs, preserving existing notes. An attachment-capable format must include media bytes and every implemented feature.

The workspace is excluded from indexing. Public landing pages, canonical metadata and sitemap remain separate work. The PWA caches the application shell, excludes API responses, and avoids forced editor reloads during updates. Browser persistence does not prevent deliberate site-data deletion.
