# Performance verification

## Local checks

- `pnpm build` reports production JavaScript/CSS and gzip estimates. These are asset sizes, not RAM or server latency.
- Settings shows the current workspace read time: elapsed time from browser component mount through IndexedDB loading; it excludes network boot and is not LCP.
- A `zivizip-workspace-ready` performance mark is available in DevTools. No telemetry leaves this browser.
- Browser tests verify desktop persistence/backup and mobile-sized offline reload/editing. Viewport simulation is not physical-phone testing.

## Initial budgets (targets, not achieved claims)

- Total initial compressed JS/CSS under 150 KiB for the Notes application.
- No storage request blocks native textarea typing.
- Measure note opening and keystroke latency with 100, 1,000 and 10,000 notes before committing to a long-term loading strategy.
- Measure on physical mobile devices before setting release gates for interaction latency.

## Scope of baseline

Current UI loads all Text notes on initial open. This is adequate for the initial feature set, not yet a proven design for lifetime data. Metadata-first loading, pagination/search and editor-specific lazy loading are planned before larger datasets or images ship.

Later monitoring must include frontend interaction/LCP/INP, API p95/p99, errors, DB query/connection waits, and container resources. Staging/production dashboards and alerts are deferred with server work.

## Baseline — 2026-09-29

Local production build: 213,326 bytes JS/CSS, 80,163 bytes summed gzip (78.3 KiB). Counts all emitted JS/CSS, including framework error routes; excludes HTML, icons, service-worker .mjs and user data. Build tool: Vite 7.3.6. This is an asset-size baseline, not a runtime RAM or latency result.

## Owner account baseline — 2026-09-30

Docker production preview: 233,108 bytes JS/CSS, 86,316 bytes summed gzip (84.3 KiB), 15 files. Same counting method as the September 29 baseline: excludes HTML, icons, service-worker .mjs and user data. The increase is approximately 6 KiB gzip. Compression here is an offline estimate, not measured wire transfer or browser RAM.

A local `docker stats --no-stream` snapshot near the end of the small acceptance run showed Notes at 97.31 MiB / 0.01% CPU, Nginx preview at 10.85 MiB / 0% CPU, and Vite development at 199.4 MiB / 0.10% CPU. This includes password authentication activity and runtime allocator retention; it is not an idle floor, a peak measurement, or a production capacity claim. The development container is not part of the deployed runtime design. Password hashing intentionally incurs memory/CPU cost.

The database remains a single-owner SQLite instance. No load test, large-note collection benchmark, real-device test, or multi-replica performance claim is made. Track authentication memory peaks, synchronous database contention, SSE refresh payloads and browser memory as the next measurement targets.
