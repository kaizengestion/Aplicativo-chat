#!/usr/bin/env bash
# Backup de la base del chat (formato custom de pg_dump). Pensado para sumarlo al backup-offsite
# del servidor o a un timer propio. Deja la copia en deploy/backups/ y guarda las últimas 14.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p backups
f="backups/chatapp-$(date +%Y%m%d-%H%M).dump"
docker compose exec -T db pg_dump -U postgres -d chatapp -Fc > "$f"
chmod 600 "$f"
ls -1t backups/chatapp-*.dump | tail -n +15 | xargs -r rm --
echo "$f"
