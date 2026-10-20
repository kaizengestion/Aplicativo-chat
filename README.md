# Chat de atención con IA (multi-tenant)

Cada negocio (tenant) obtiene un enlace público `https://<tu-dominio>/c/<slug>` para pegar en la respuesta automática de WhatsApp Business. El cliente abre el enlace, deja su nombre y WhatsApp, y conversa con un bot (Claude) que responde con la información del negocio. El equipo sigue todo desde un tablero, consulta los chats en lenguaje natural y puede tomar cualquier conversación en vivo.

## Arquitectura

```
WhatsApp (respuesta automática con enlace)
        │
        ▼
/c/<slug>  ── chat público (Next.js, sondeo cada 3 s)
        │  POST /api/public/<slug>/start      → crea/actualiza contacto + conversación
        │  POST /api/public/<slug>/messages   → guarda mensaje; si status = bot, responde Claude
        ▼
Postgres (Supabase)  ── RLS por tenant_id en todas las tablas
        ▲
        │  /api/admin/*  (sesión firmada en cookie)
/admin  ── tablero: conversaciones, contactos, preguntar, bot y enlace
```

- **Stack:** Next.js 16 (App Router) + TypeScript, Postgres (pensado para Supabase), `@anthropic-ai/sdk`, modelo `claude-opus-5-5` (configurable con `CLAUDE_MODEL`).
- **Multi-tenant:** cada tabla tiene `tenant_id` y una política RLS `tenant_id = current_setting('app.tenant_id')`. La app se conecta con el rol restringido `chat_app` (sin BYPASSRLS) y cada request abre una transacción que fija `app.tenant_id`. Los únicos accesos entre tenants (resolver el slug público, login, alta) pasan por tres funciones `SECURITY DEFINER` en `db/schema.sql`.
- **Bot:** `src/lib/bot.ts`. Prompt con la “información del negocio” que cada tenant carga en *Bot y enlace*. Tiene la herramienta `transfer_to_human`: cuando el cliente pide una persona o el bot no sabe, marca la conversación como *Necesita persona*. Sin `ANTHROPIC_API_KEY` responde en modo demo.
- **Tomar la conversación:** el agente pulsa *Tomar conversación* o simplemente escribe. El estado pasa a `human` y el bot deja de responder (si una respuesta del bot estaba en curso, se descarta). *Devolver al bot* lo reactiva.
- **Consultas en lenguaje natural:** `src/lib/nlquery.ts`. Claude genera SQL de solo lectura que se ejecuta con el rol `chat_reader` (solo ve contactos, conversaciones y mensajes, no usuarios), en transacción `read only`, con timeout de 5 s, envuelto en subconsulta y con RLS del tenant activo.
- **Contactos:** se deduplican por teléfono dentro de cada tenant; exportables a CSV.

## Puesta en marcha

1. Crea un proyecto en Supabase (o cualquier Postgres 14+).
2. Copia `.env.example` a `.env.local` y completa los valores (en Supabase, `ADMIN_DATABASE_URL` es la cadena del rol `postgres`; `DATABASE_URL` usa el usuario `chat_app` con la clave `APP_DB_PASSWORD`).
3. Instala y migra:
   ```bash
   npm install
   set -a; . ./.env.local; set +a
   npm run db:migrate
   npm run dev
   ```
4. Entra a `http://localhost:3000/signup`, crea tu negocio, carga la información en *Bot y enlace* y copia el texto sugerido a la respuesta automática de WhatsApp Business.

## Desplegar en producción (Supabase + Vercel)

1. **Supabase:** crea un proyecto en https://supabase.com y guarda la contraseña de la base. En *Connect* copia la cadena **Session pooler** (rol `postgres`): esa es `ADMIN_DATABASE_URL`.
2. **Migrar:** desde tu computadora, con `ADMIN_DATABASE_URL` y una `APP_DB_PASSWORD` nueva, corre `npm run db:migrate`. Eso crea las tablas y el rol `chat_app`.
3. **`DATABASE_URL`:** la misma cadena del pooler pero con usuario `chat_app.<ref-del-proyecto>` y la clave `APP_DB_PASSWORD` (en Supabase el usuario del pooler lleva el sufijo del proyecto, igual que `postgres.<ref>`).
4. **Claude:** crea una clave en https://platform.claude.com (*API keys*) y agrega saldo; esa es `ANTHROPIC_API_KEY`.
5. **Vercel:** importa el repositorio en https://vercel.com, carga `DATABASE_URL`, `SESSION_SECRET`, `ANTHROPIC_API_KEY`, `NEXT_PUBLIC_APP_URL` (y opcionalmente `RESEND_API_KEY` y `NOTIFY_FROM` para avisos, y `OPENAI_API_KEY` para transcribir audios) y despliega.

Las claves van solo en las variables de entorno de Vercel; no hace falta compartirlas en ningún chat.

## Equipo

En *Equipo* (solo administradores) se agregan personas con email y contraseña inicial. Los **agentes** ven y atienden conversaciones; los **administradores** además cambian el bot y el equipo. Quitar a alguien cierra su sesión de inmediato y sus conversaciones abiertas quedan marcadas como *Necesita persona*.

## Límites y avisos

- Chat público: máximo 8 mensajes por minuto y 200 por día por conversación; 5 chats nuevos por teléfono por hora y 30 por minuto por negocio (`src/lib/limits.ts`).
- Cuando el bot pasa una conversación a una persona, se envía un correo a los usuarios del negocio vía Resend (`src/lib/notify.ts`). Sin `RESEND_API_KEY` el aviso solo queda en el log.

## Estructura

```
db/schema.sql                 tablas, RLS, roles y funciones
scripts/migrate.mjs           aplica el esquema
src/lib/                      db + RLS, sesión, bot, consultas NL
src/app/c/[slug]/             chat público
src/app/admin/                tablero
src/app/api/public/           API del chat público
src/app/api/admin/            API del tablero
```

## Pendiente para siguientes iteraciones

- Tiempo real con Supabase Realtime o SSE en lugar de sondeo.
- Base de conocimiento con archivos (PDF, catálogo) en lugar de solo texto.
