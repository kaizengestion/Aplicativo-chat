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
  public_token text not null unique,
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

create index if not exists contacts_tenant_idx on contacts (tenant_id, last_seen_at desc);
create index if not exists conversations_tenant_idx on conversations (tenant_id, last_message_at desc);
create index if not exists messages_conv_idx on messages (conversation_id, id);
create index if not exists messages_tenant_idx on messages (tenant_id, created_at desc);

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

-- Funciones SECURITY DEFINER para los únicos accesos que cruzan tenants ------

-- Resolver un tenant público por slug (enlace /c/<slug>)
create or replace function public_tenant(p_slug text)
returns table (id uuid, name text, bot_name text, welcome_message text)
language sql stable security definer set search_path = public as $$
  select t.id, t.name, t.bot_name, t.welcome_message from tenants t where t.slug = lower(p_slug)
$$;

-- Login: buscar usuario por email sin conocer el tenant
create or replace function find_login(p_email text)
returns table (user_id uuid, tenant_id uuid, password_hash text, name text)
language sql stable security definer set search_path = public as $$
  select u.id, u.tenant_id, u.password_hash, u.name from app_users u where u.email = lower(p_email)
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
grant select, insert, update, delete on app_users, contacts, conversations, messages to chat_app;
grant usage, select on all sequences in schema public to chat_app;
grant select on tenants, contacts, conversations, messages to chat_reader;
grant execute on function current_tenant_id() to chat_app, chat_reader;

revoke all on function public_tenant(text) from public;
revoke all on function find_login(text) from public;
revoke all on function signup_tenant(text, text, text, text, text) from public;
grant execute on function public_tenant(text) to chat_app;
grant execute on function find_login(text) to chat_app;
grant execute on function signup_tenant(text, text, text, text, text) to chat_app;
