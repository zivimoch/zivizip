# Production deployment

The production Compose files use versioned images, HTTPS-only account cookies and a private project network. They are separate from the local development and preview configuration. Configuration files are deployment inputs, not evidence that a server is running them.

## Layout

- `/srv/platform/gateway`: shared HTTPS gateway and its Compose configuration.
- `/srv/zivizip/releases/<release>/deploy`: application deployment files.
- `/srv/zivizip/secrets/owner.json`: private production owner credential.
- `zivizip-production_notes-data`: persistent application database volume.
- `platform-gateway_data`: persistent TLS certificates and account data.

Only the gateway publishes ports 80 and 443. Create `zivizip-ingress` with `docker network create --internal zivizip-ingress`. The gateway also has an outbound network for certificate issuance. For another project, add its own ingress network and hostname route; do not attach its application containers to Zivizip's network. The gateway is shared infrastructure and should be managed independently of application releases.

## Release preparation

1. Verify SSH access, host identity, operating system, existing services and firewall rules. Preserve an active SSH session while changing access rules. Do not disable password access until key access has been independently verified.
2. Install Docker Engine and Compose from the [official Ubuntu repository](https://docs.docker.com/engine/install/ubuntu/). Docker-published ports are not protected by UFW alone; publish only the gateway ports and inspect the actual host/network rules.
3. Build frontend and API images from a checked release, tagged with its commit. The current Docker build runs frontend checks/tests and Rust tests. Run browser acceptance tests before promotion. Transfer images with a private registry or `docker save`/`docker load`; never place credentials or database files in an image.
4. Copy the production Compose and Nginx files into the release directory. Fill a private environment file using `deploy/.env.example`; replace `RELEASE` with the exact tested tag. Keep the same image archive or digest for rollback. Do not deploy mutable `latest` tags.
5. Provision a separate production owner credential containing `username` and a password of at least 8 characters; a generated password of 16 or more characters is recommended. Protect the containing directory (root, mode 0700) and make the mounted file readable only by UID 10001 (mode 0400). Do not publish the password or reuse a local sample credential by accident.
6. Copy the gateway templates to `/srv/platform/gateway`, choose a tested Caddy image digest, and set its domain environment variable. Validate with `caddy validate` before starting. [Caddy automatic HTTPS](https://caddyserver.com/docs/automatic-https) requires the domain to resolve to this server and ports 80/443 to reach it.
7. Validate both Compose configurations, start the application services, and then start the gateway. Do not bring down other projects or delete existing volumes.

The gateway sends the client address to the private API as `X-Real-IP`, replacing any client-supplied value. The API is not published directly. If a CDN or another proxy is introduced, review the trusted-proxy chain before changing address handling.

## Verification and promotion

Check HTTP-to-HTTPS redirection, the valid TLS certificate, `/api/health`, anonymous rejection on private endpoints, owner login and the Secure/HttpOnly/SameSite cookie. Verify Notes, Tasks, Finance, SSE updates, backup/export, installability and guest offline behavior against the HTTPS origin. Confirm another project cannot reach private Zivizip services through its own network.

Start with an empty production workspace. Guest data at localhost does not move to the domain automatically because browser storage is origin-scoped. Transfer it with export/import when desired. Copying local account data to the VPS is a separate data migration, not part of image deployment.

## Persistence and rollback

Use SQLite's online backup API or stop the API cleanly before copying its complete database state. Copying only the live main file can omit WAL changes. Backups contain private workspace data; protect them and keep a separate off-server copy. Test restoration into an isolated volume before relying on a backup schedule. TLS volumes must also survive gateway recreation.

Before each update, record image digests and take a verified database backup. Roll back image references only when the previous version supports the current schema; otherwise restore the matching backup into an isolated volume before switching traffic. Never use `docker compose down -v` for routine updates.

Jenkins/GitHub delivery, scheduled backups and external monitoring require their own verified setup. These templates do not claim that those services are installed.
