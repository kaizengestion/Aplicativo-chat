-- Esquema multi-tenant con Row Level Security.
-- Se ejecuta con un rol dueño (postgres). La app se conecta como chat_app, sujeto a RLS.
-- Cada request fija app.tenant_id dentro de su transacción y las políticas filtran por ese valor.

create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name text not null,
  bot_name text not null default 'Asistente',
  welcome_message text not null default '¡Hola! ¿En qué te puedo ayudar?',
  knowledge_base text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null unique,
  password_hash text not null,
  name text not null,
  role text not null default 'admin' check (role in ('admin', 'agent')),
  created_at timestamptz not null default now()
);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  phone text not null,
  email text,
  notes text not null default '',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (tenant_id, phone)
);

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  -- Ya no se usa: los enlaces del cliente están en chat_sessions (se conserva para copiar los viejos).
  public_token text unique,
  -- bot: responde Claude; human: un agente tomó el control; closed: cerrada
  status text not null default 'bot' check (status in ('bot', 'human', 'closed')),
  needs_human boolean not null default false,
  handoff_reason text,
  assigned_user_id uuid references app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  sender text not null check (sender in ('contact', 'bot', 'agent', 'system')),
  agent_id uuid references app_users(id) on delete set null,
  content text not null,
  created_at timestamptz not null default now()
);

-- Archivos que manda el cliente (imágenes, PDF, audios). Uno por mensaje; los bytes quedan en la base, aislados por tenant.
create table if not exists attachments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  message_id bigint not null unique references messages(id) on delete cascade,
  kind text not null check (kind in ('image', 'pdf', 'audio')),
  mime text not null,
  name text not null,
  size int not null,
  data bytea not null,
  created_at timestamptz not null default now()
);

-- Cada vez que el cliente abre el chat (o lo reinicia) es una sesión con su propio token en el navegador.
-- Todas las sesiones de un contacto caen en su única conversación; el cliente solo ve desde first_message_id.
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  token text not null unique,
  first_message_id bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_conv_idx on chat_sessions (conversation_id, first_message_id);
create index if not exists chat_sessions_tenant_idx on chat_sessions (tenant_id, created_at desc);
create index if not exists contacts_tenant_idx on contacts (tenant_id, last_seen_at desc);
create index if not exists conversations_tenant_idx on conversations (tenant_id, last_message_at desc);
create index if not exists messages_conv_idx on messages (conversation_id, id);
create index if not exists messages_tenant_idx on messages (tenant_id, created_at desc);
create index if not exists attachments_conv_idx on attachments (conversation_id, created_at);

-- Un contacto por número y una conversación por contacto ------------------------

-- Forma única de un teléfono para reconocer al mismo cliente aunque lo escriba distinto.
-- Argentina: +54 9 11 2345-6789, 011 15 2345-6789 y 1123456789 quedan todos como +5491123456789.
-- Otros países se guardan como + y los dígitos; lo que no se reconoce queda solo en dígitos.
create or replace function normalize_phone(p text) returns text
language plpgsql immutable as $$
declare
  d text := regexp_replace(coalesce(p, ''), '\D', '', 'g');
  intl boolean := btrim(coalesce(p, '')) like '+%';
begin
  if d like '00%' then d := substr(d, 3); intl := true; end if;
  if d like '54%' and (intl or length(d) >= 12) then
    d := substr(d, 3);
    if d like '0%' then d := substr(d, 2); end if;
    if length(d) = 11 and d like '9%' then d := substr(d, 2); end if;
  elsif intl then
    return '+' || d;
  else
    d := ltrim(d, '0');
  end if;
  -- el 15 de celular va después del código de área: 11 15…, 351 15…, 2954 15…
  if length(d) = 12 then
    if d like '11%' and substr(d, 3, 2) = '15' then d := substr(d, 1, 2) || substr(d, 5);
    elsif substr(d, 4, 2) = '15' then d := substr(d, 1, 3) || substr(d, 6);
    elsif substr(d, 5, 2) = '15' then d := substr(d, 1, 4) || substr(d, 7);
    end if;
  end if;
  if length(d) = 10 then return '+549' || d; end if;
  return d;
end $$;

-- Los enlaces de las conversaciones viejas pasan a ser sesiones (el cliente sigue viendo su chat).
alter table conversations alter column public_token drop not null;
insert into chat_sessions (tenant_id, conversation_id, token, first_message_id, created_at)
select c.tenant_id, c.id, c.public_token,
       coalesce((select min(m.id) from messages m where m.conversation_id = c.id), 0), c.created_at
from conversations c where c.public_token is not null
on conflict (token) do nothing;

-- Unificar lo que ya existe. Se puede correr más de una vez: si no hay repetidos no hace nada.
do $$
declare r record;
begin
  -- Contactos con el mismo número: queda el último que se vio y se lleva las conversaciones de los otros.
  for r in
    select id, keeper from (
      select id, first_value(id) over (partition by tenant_id, normalize_phone(phone)
                                       order by last_seen_at desc, created_at desc, id) as keeper
      from contacts) x
    where id <> keeper
  loop
    update conversations set contact_id = r.keeper where contact_id = r.id;
    update contacts k set email = coalesce(k.email, d.email),
           notes = concat_ws(E'\n', nullif(k.notes, ''), nullif(d.notes, '')),
           created_at = least(k.created_at, d.created_at)
      from contacts d where k.id = r.keeper and d.id = r.id;
    delete from contacts where id = r.id;
  end loop;
  update contacts set phone = normalize_phone(phone)
   where normalize_phone(phone) <> '' and phone <> normalize_phone(phone);

  -- Varias conversaciones del mismo contacto: todo pasa a la más reciente, en orden.
  -- Su estado manda; si alguna otra seguía esperando a una persona, la unificada queda marcada igual.
  for r in
    select id, keeper from (
      select id, first_value(id) over (partition by contact_id order by last_message_at desc, created_at desc, id) as keeper
      from conversations) x
    where id <> keeper
  loop
    update messages set conversation_id = r.keeper where conversation_id = r.id;
    update attachments set conversation_id = r.keeper where conversation_id = r.id;
    update chat_sessions set conversation_id = r.keeper where conversation_id = r.id;
    update conversations k set
           created_at = least(k.created_at, d.created_at),
           status = case when k.status = 'closed' then d.status else k.status end,
           assigned_user_id = case when k.status = 'closed' then d.assigned_user_id else k.assigned_user_id end,
           needs_human = k.needs_human or (d.needs_human and d.status <> 'closed'),
           handoff_reason = case when k.needs_human then k.handoff_reason
                                 when d.needs_human and d.status <> 'closed' then d.handoff_reason
                                 else k.handoff_reason end
      from conversations d where k.id = r.keeper and d.id = r.id;
    delete from conversations where id = r.id;
  end loop;
end $$;

create unique index if not exists conversations_contact_uidx on conversations (contact_id);

-- Row Level Security -------------------------------------------------------

create or replace function current_tenant_id() returns uuid
language sql stable as $$
  select nullif(current_setting('app.tenant_id', true), '')::uuid
$$;

alter table tenants enable row level security;
alter table tenants force row level security;
alter table app_users enable row level security;
alter table app_users force row level security;
alter table contacts enable row level security;
alter table contacts force row level security;
alter table conversations enable row level security;
alter table conversations force row level security;
alter table messages enable row level security;
alter table messages force row level security;
alter table attachments enable row level security;
alter table attachments force row level security;
alter table chat_sessions enable row level security;
alter table chat_sessions force row level security;

drop policy if exists tenant_isolation on tenants;
create policy tenant_isolation on tenants
  using (id = current_tenant_id()) with check (id = current_tenant_id());

drop policy if exists tenant_isolation on app_users;
create policy tenant_isolation on app_users
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

drop policy if exists tenant_isolation on contacts;
create policy tenant_isolation on contacts
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

drop policy if exists tenant_isolation on conversations;
create policy tenant_isolation on conversations
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

drop policy if exists tenant_isolation on messages;
create policy tenant_isolation on messages
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

drop policy if exists tenant_isolation on attachments;
create policy tenant_isolation on attachments
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

drop policy if exists tenant_isolation on chat_sessions;
create policy tenant_isolation on chat_sessions
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

-- Funciones SECURITY DEFINER para los únicos accesos que cruzan tenants ------

-- Resolver un tenant público por slug (enlace /c/<slug>)
create or replace function public_tenant(p_slug text)
returns table (id uuid, name text, bot_name text, welcome_message text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.bot_name, t.welcome_message from tenants t where t.slug = lower(p_slug)
$$;

-- Login: buscar usuario por email sin conocer el tenant
drop function if exists find_login(text);
create function find_login(p_email text)
returns table (user_id uuid, tenant_id uuid, password_hash text, name text, role text)
language sql stable security definer set search_path = public as $$
  select u.id, u.tenant_id, u.password_hash, u.name, u.role from app_users u where u.email = lower(p_email)
$$;

-- Alta de un tenant nuevo con su primer admin
create or replace function signup_tenant(p_slug text, p_name text, p_email text, p_password_hash text, p_user_name text)
returns table (tenant_id uuid, user_id uuid)
language plpgsql security definer set search_path = public as $$
declare t_id uuid; u_id uuid;
begin
  insert into tenants (slug, name) values (lower(p_slug), p_name) returning id into t_id;
  insert into app_users (tenant_id, email, password_hash, name)
    values (t_id, lower(p_email), p_password_hash, p_user_name) returning id into u_id;
  return query select t_id, u_id;
end $$;

-- Roles y permisos ------------------------------------------------------------

do $$ begin
  create role chat_app login;
exception when duplicate_object then null; end $$;

-- Rol de solo lectura para las consultas en lenguaje natural (no ve app_users)
do $$ begin
  create role chat_reader nologin;
exception when duplicate_object then null; end $$;

grant chat_reader to chat_app;
grant usage on schema public to chat_app, chat_reader;
grant select, update on tenants to chat_app;
grant select, insert, update, delete on app_users, contacts, conversations, messages, attachments, chat_sessions to chat_app;
grant usage, select on all sequences in schema public to chat_app;
grant select on tenants, contacts, conversations, messages to chat_reader;
grant execute on function current_tenant_id() to chat_app, chat_reader;
grant execute on function normalize_phone(text) to chat_app;

revoke all on function public_tenant(text) from public;
revoke all on function find_login(text) from public;
revoke all on function signup_tenant(text, text, text, text, text) from public;
grant execute on function public_tenant(text) to chat_app;
grant execute on function find_login(text) to chat_app;
grant execute on function signup_tenant(text, text, text, text, text) to chat_app;
