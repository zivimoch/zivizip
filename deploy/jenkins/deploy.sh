#!/bin/bash
set -euo pipefail
# Install root-owned outside the application checkout. The SSH key is forced to this command.
if [[ ! ${SSH_ORIGINAL_COMMAND:-} =~ ^release\ ([a-f0-9]{40})$ ]]; then
  echo 'Expected a full commit release identifier' >&2
  exit 1
fi
release=${BASH_REMATCH[1]}
exec 9>/srv/zivizip/deploy.lock
flock -n 9 || exit 1
previous=$(docker inspect zivizip-production-web-1 --format '{{index .Config.Labels "com.docker.compose.project.working_dir"}}')
case "$previous" in /srv/zivizip/releases/*/deploy) ;; *) exit 1 ;; esac
destination=/srv/zivizip/releases/$release/deploy
docker load
docker image inspect "zivizip-web:$release" "zivizip-api:$release" >/dev/null
install -d -m 700 "$destination" /srv/backups/zivizip
volume=$(docker volume inspect zivizip-production_notes-data --format '{{.Mountpoint}}')
python3 /srv/zivizip/backup-sqlite.py "$volume/notes.sqlite" "/srv/backups/zivizip/$(date -u +%Y%m%dT%H%M%SZ)-before-$release.sqlite"
if [[ "$previous" != "$destination" ]]; then
  cp "$previous/compose.yaml" "$previous/nginx.conf" "$previous/production.env" "$destination/"
fi
sed -i "s|^ZIVIZIP_WEB_IMAGE=.*|ZIVIZIP_WEB_IMAGE=zivizip-web:$release|;s|^ZIVIZIP_API_IMAGE=.*|ZIVIZIP_API_IMAGE=zivizip-api:$release|" "$destination/production.env"
chmod 600 "$destination/production.env"
cd "$destination"
docker compose --env-file production.env config --quiet
docker compose --env-file production.env up -d --no-deps notes web
for attempt in $(seq 1 30); do
  if curl --fail --silent https://zivi.zip/ >/dev/null && curl --fail --silent https://zivi.zip/api/health >/dev/null; then
    echo "Release $release is healthy"
    exit 0
  fi
  sleep 2
done
echo 'Health check failed; restoring previous images' >&2
cd "$previous"
docker compose --env-file production.env up -d --no-deps notes web
exit 1
