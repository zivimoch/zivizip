# Zivizip

A personal workspace for notes, tasks, finances, and goals.

Zivizip opens directly into your workspace. Guest notes stay in your browser; the owner account stores notes on the server and synchronizes changes across sessions.

## Features

- Text notes with categories, reorderable tabs, and recoverable edit conflicts.
- Guest editing offline, with versioned JSON backup and import.
- Owner login with persistent sessions and a separate read-only offline cache.
- Explicit copying of guest notes into the account; local originals are preserved.
- Installable PWA shell, responsive layout, and English/Indonesian interface.

Draw, rich-text editing, Tasks, Finance, and Goals are available in the interaction prototype and are being integrated into the application. Public account registration and push notifications are not available yet.

## Quick start

Requires Docker Compose and Python 3.

```sh
python3 scripts/setup-local-account.py
docker compose --profile preview up --build -d preview
```

Open **http://127.0.0.1:4174**. Use **Account → Log in** to sign in with the credentials generated in `.local/owner.json`. The setup command preserves existing credentials.

Guest data is isolated by browser profile and origin. `localhost`, `127.0.0.1`, and different ports have separate workspaces. Use one address consistently, and export a backup before clearing browser data.

## Development

```sh
docker compose up --build -d web
```

Open http://127.0.0.1:5173. Source changes reload automatically. Rebuild the preview to test the compiled application and offline behavior.

With Node 22 and pnpm 10.28.2 installed, keep the Docker preview running as the API proxy:

```sh
corepack enable
pnpm install --frozen-lockfile
API_URL=http://127.0.0.1:4174 pnpm dev
```

See [Contributing](CONTRIBUTING.md) for formatting, checks, and browser tests.

## Repository

| Path             | Purpose                                               |
| ---------------- | ----------------------------------------------------- |
| `apps/web`       | SvelteKit frontend and IndexedDB storage              |
| `services/notes` | Rust API, owner sessions, SQLite persistence, and SSE |
| `prototype`      | Standalone interaction reference                      |
| `scripts`        | Local setup and persistence verification              |
| `docs`           | Architecture, API, product behavior, and verification |

## Documentation

- [Architecture](docs/ARCHITECTURE.md)
- [API and account operation](docs/API.md)
- [Product behavior](prototype/SPEC.md)
- [Verification](docs/VERIFICATION.md)
- [Performance measurements](docs/PERFORMANCE.md)

The Compose configuration is for local use. HTTPS deployment, Kubernetes manifests, and the delivery pipeline are not included. `docker compose down` preserves server data; adding `-v` deletes the database volume.
