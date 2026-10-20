-- Adjuntos del chat (fotos, PDF y audios). Correr una vez en la base de producción ANTES de publicar este cambio.
-- Es lo mismo que agrega db/schema.sql; se puede correr más de una vez sin problema.

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
create index if not exists attachments_conv_idx on attachments (conversation_id, created_at);

alter table attachments enable row level security;
alter table attachments force row level security;
drop policy if exists tenant_isolation on attachments;
create policy tenant_isolation on attachments
  using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

grant select, insert, update, delete on attachments to chat_app;
