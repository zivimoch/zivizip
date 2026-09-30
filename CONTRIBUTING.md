# Contributing

Keep changes focused on one outcome. Use a short-lived `feat/`, `fix/`, or `docs/` branch and describe the resulting behavior in the commit subject.

## Checks

From the repository root:

```sh
pnpm format:check
pnpm check
pnpm test
pnpm build
```

For changes to navigation, editing, storage, or account flows, start the Docker preview and run:

```sh
pnpm --dir apps/web exec playwright install chromium
pnpm test:e2e
```

Set `CHROMIUM_PATH` when using an existing Chrome installation. Account tests read `.local/owner.json`; run the setup script first. The suite creates temporary notes and clearly identified interest-form fixtures in the local database. Do not run it against a live deployment.

Rust checks:

```sh
cargo fmt --manifest-path services/notes/Cargo.toml --check
cargo test --manifest-path services/notes/Cargo.toml --locked
```

The Notes Docker build also runs Rust tests. `python3 scripts/check-local-persistence.py` verifies persistence through a container restart using a temporary note and session.

## Review criteria

- Preserve documented behavior and existing data, including guest/account separation.
- Handle failed writes and conflicting revisions without silently losing edits.
- Verify desktop and mobile layouts; distinguish viewport checks from device testing.
- Record API/schema changes and architecture decisions with their consequences.
- Report measured performance with the environment and workload.
- Exclude credentials, user backups, database files, and generated build output.

Use concise pull request descriptions covering the problem, behavior change, and validation. Keep implementation status accurate; do not describe prototypes or planned features as released capabilities.
