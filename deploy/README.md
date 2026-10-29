# Despliegue en el servidor propio de Kaizen

Reemplaza a Vercel + Supabase. La app y su base Postgres corren con Docker en **kaizen-server**
(Ubuntu 24.04, Tailscale `100.69.222.77`) y salen a internet por **Caddy en kaizen-edge**
(Hetzner, `167.233.84.87`), que pone el certificado. El DNS de `kaizengestion.com` está en DonWeb.

```
cliente ──https──▶ kaizen-edge (Caddy + Let's Encrypt) ──Tailscale──▶ kaizen-server:8020 (app)
                                                                      └─ red interna ─▶ db (Postgres 17)
```

Supabase y Vercel no se tocan en ningún paso: se dan de baja aparte, cuando todo esto ande.

## 1. Preparar (kaizen-server)

```bash
git clone https://github.com/kaizengestion/aplicativo-chat.git ~/chat-kaizen
cd ~/chat-kaizen/deploy
cp .env.example .env && chmod 600 .env
```

Completar `deploy/.env` en el server (nunca en un chat): claves nuevas con `openssl rand -hex 24`
(`DB_ADMIN_PASSWORD`, `APP_DB_PASSWORD`) y `openssl rand -hex 32` (`SESSION_SECRET`),
`ANTHROPIC_API_KEY`, y `SMTP_PASSWORD` = contraseña de aplicación de Google de
`administracion@kaizengestion.com` (la misma cuenta que usa kaizen-odoo-app, con `soporte@` como alias).

Antes, confirmar que los puertos están libres: `ss -ltn | grep -E ':(8020|5434) '` no debe mostrar nada.
Si Docker Hub limita las descargas (429), bajar las imágenes de `mirror.gcr.io/library/...` y retaguearlas.

## 2. Levantar la base y crear las tablas

```bash
docker compose up -d --build
docker compose exec app node scripts/migrate.mjs
```

La app ya queda andando en `http://100.69.222.77:8020` (vacía).

## 3. Copiar los datos de Supabase

En Supabase: *Connect* → **Session pooler** → copiar la cadena (con la contraseña de la base).

```bash
bash copiar-desde-supabase.sh
```

Pide la cadena sin mostrarla, se niega si la base nueva ya tiene datos, guarda el volcado en
`deploy/backups/` y muestra cuántas filas quedaron por tabla. Supabase solo se lee.
Para repetir la copia (por ejemplo el día del cambio, con los chats nuevos), vaciar antes la base:
`docker compose down -v && docker compose up -d && docker compose exec app node scripts/migrate.mjs`.

## 4. Dirección pública

1. **DonWeb** → DNS de `kaizengestion.com` → registro **A** `chat` → `167.233.84.87`.
2. **kaizen-edge** (por salto desde kaizen-server), agregar al `Caddyfile` con backup previo:

   ```
   chat.kaizengestion.com {
       reverse_proxy 100.69.222.77:8020
   }
   ```

   `caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` y después `systemctl reload caddy`.
   La app mantiene las conexiones ociosas 150 s (`KEEP_ALIVE_TIMEOUT` en el `Dockerfile`), más que los
   2 min de Caddy, así que no hace falta `keepalive` en el bloque.

## 5. Probar y cambiar

- Entrar a `https://chat.kaizengestion.com/admin` con el mismo email y contraseña de siempre.
- Abrir `https://chat.kaizengestion.com/c/kaizen-gestion` y chatear con el bot.
- Probar «¿Olvidaste tu contraseña?» para confirmar que llega el correo.
- Cambiar el enlace en la respuesta automática de WhatsApp Business.
- Rehacer el paso 3 justo antes del cambio si entraron chats nuevos en Supabase mientras tanto.

## Actualizar

```bash
cd ~/chat-kaizen && git pull --ff-only && cd deploy && ./backup.sh && docker compose up -d --build
```

Si el cambio trae SQL nuevo en `db/`, correr `docker compose exec app node scripts/migrate.mjs`
(es idempotente).

## Backups

`./backup.sh` deja un `pg_dump` en `deploy/backups/` (guarda los últimos 14). Sumarlo al
`backup-offsite` diario del server para que viaje cifrado a Drive. Restaurar:
`docker compose exec -T db pg_restore -U postgres -d chatapp --clean < backups/<archivo>.dump`.
