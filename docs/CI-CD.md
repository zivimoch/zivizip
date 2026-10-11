# Delivery pipeline

Jenkins monitors the public repository's `main` branch every two minutes. Only this trusted branch has a deployment job. Pull requests and forks do not receive deployment credentials or run on the trusted agent.

The controller has zero executors. A separate agent builds against a dedicated Docker-in-Docker daemon with TLS. Neither controller nor agent mounts the production Docker socket. Docker-in-Docker requires privileged operation and is not a security boundary for hostile builds; use separate infrastructure before accepting untrusted build jobs.

## Release stages

1. Check out the exact commit.
2. Build the web image, running Svelte diagnostics and frontend unit tests.
3. Build the API image, running Rust tests.
4. Run browser acceptance tests in a disposable container.
5. Transfer the two commit-tagged images over SSH.
6. Create and verify an online SQLite backup, then replace the application containers.
7. Check the public web and API health endpoints. Restore the previous images if health checks fail.

The deployment key uses an SSH forced command installed outside the repository. It accepts only a full commit identifier and updates Zivizip; the pipeline cannot issue arbitrary remote shell commands. Server configuration and secrets remain outside images and Git. Changes to deployment configuration require a separate infrastructure review. Image rollback does not restore the database: schema changes must remain compatible with the preceding release or provide a migration-specific recovery procedure.

No registry is required for this single-host configuration. Image transfer uses `docker save` over SSH followed by `docker load`. Builds are serialized. Jenkins, its agent and Docker are open-source software; this configuration does not require a paid CI service.

## Administration

The dashboard listens only on the VPS loopback interface at port 8081. Open an SSH tunnel from a trusted computer, forwarding local port 8081 to the server's `127.0.0.1:8081`, then visit `http://127.0.0.1:8081`. Anonymous access and account signup are disabled. CSRF protection remains enabled.

The Compose project and credentials are managed separately from application releases. Persist controller home, agent workspace and build cache. Back up controller home and the private configuration separately; never publish their contents. Do not expose the dashboard or Docker daemon directly to the internet.

The browser stage covers installation, lists, formatting, media, guest persistence, offline behavior and account sharing. It starts a disposable API container with generated test credentials on a dedicated build network. Neither credentials nor data come from production; test containers are removed when the stage exits, including on failure. Browser failure artifacts are retained by Jenkins. This is not a load test or a substitute for production monitoring.

## Environments

- Development runs locally with its own configuration and database.
- CI creates a temporary application and database for automated tests. It is removed after the run and is not a staging deployment.
- Production serves the live application and persistent user data.

A persistent staging environment is not configured. A future staging gate should use separate secrets, sessions and storage, then promote the same tested image to production after approval. Branch names identify code history; they do not create or isolate runtime environments.
