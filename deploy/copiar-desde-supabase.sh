#!/usr/bin/env bash
# Copia los datos (negocios, usuarios, contactos, chats y adjuntos) de Supabase a la base nueva.
# Correr en el servidor, desde la carpeta del repo, con la base nueva ya migrada y vacía:
#   bash deploy/copiar-desde-supabase.sh
# Pide la cadena "Session pooler" de Supabase sin mostrarla ni guardarla. Supabase no se modifica.
set -euo pipefail
cd "$(dirname "$0")"
DC="docker compose"
TABLES=(tenants app_users contacts conversations messages attachments)

existing=$($DC exec -T db psql -U postgres -d chatapp -tAc "select count(*) from tenants" </dev/null)
if [ "$existing" != "0" ]; then
  echo "La base nueva ya tiene $existing negocios. Para no duplicar nada, no copio." >&2
  exit 1
fi

read -rsp "Pegá la cadena Session pooler de Supabase (no se muestra): " SUPA_URL; echo
[ -n "$SUPA_URL" ] || { echo "Vacía, no copio." >&2; exit 1; }

mkdir -p backups
dump="backups/supabase-$(date +%Y%m%d-%H%M).sql"
args=(); for t in "${TABLES[@]}"; do args+=(-t "public.$t"); done
# pg_dump corre dentro del contenedor de la base (cliente 17); la clave viaja por variable, no por argumentos.
$DC exec -T -e SUPA_URL="$SUPA_URL" db sh -c 'pg_dump "$SUPA_URL" "$@"' sh \
  --data-only --no-owner --no-privileges --disable-triggers "${args[@]}" > "$dump" </dev/null
unset SUPA_URL
chmod 600 "$dump"
echo "Copia guardada en deploy/$dump"

$DC exec -T db psql -U postgres -d chatapp -v ON_ERROR_STOP=1 --single-transaction < "$dump" > /dev/null
echo "Datos cargados. Cantidades en la base nueva:"
for t in "${TABLES[@]}"; do
  printf "  %-14s %s\n" "$t" "$($DC exec -T db psql -U postgres -d chatapp -tAc "select count(*) from $t" </dev/null)"
done
