import type { Tx } from "./db";

export class RateLimitError extends Error {}

// Límites del chat público contra abusos (y contra gasto descontrolado en la API de Claude).
const MSGS_PER_MINUTE = 8;
const MSGS_PER_DAY = 200;
const STARTS_PER_PHONE_PER_HOUR = 5;
const STARTS_PER_TENANT_PER_MINUTE = 30;

export async function checkMessageLimit(tx: Tx, conversationId: string) {
  const [r] = await tx<{ minute: number; day: number }[]>`
    select count(*) filter (where created_at > now() - interval '1 minute')::int as minute,
           count(*)::int as day
    from messages
    where conversation_id = ${conversationId} and sender = 'contact' and created_at > now() - interval '1 day'`;
  if (r.minute >= MSGS_PER_MINUTE) throw new RateLimitError("Estás enviando mensajes muy rápido. Espera un momento.");
  if (r.day >= MSGS_PER_DAY) throw new RateLimitError("Llegaste al límite de mensajes por hoy. Te contactaremos por WhatsApp.");
}

export async function checkStartLimit(tx: Tx, phone: string) {
  const [r] = await tx<{ phone: number; tenant: number }[]>`
    select count(*) filter (where ct.phone = ${phone})::int as phone,
           count(*) filter (where s.created_at > now() - interval '1 minute')::int as tenant
    from chat_sessions s join conversations c on c.id = s.conversation_id join contacts ct on ct.id = c.contact_id
    where s.created_at > now() - interval '1 hour'`;
  if (r.phone >= STARTS_PER_PHONE_PER_HOUR) throw new RateLimitError("Ya abriste varios chats en la última hora. Intenta más tarde.");
  if (r.tenant >= STARTS_PER_TENANT_PER_MINUTE) throw new RateLimitError("Hay mucha demanda en este momento. Intenta en un minuto.");
}

export function rateLimited(e: unknown) {
  if (e instanceof RateLimitError) return Response.json({ error: e.message }, { status: 429 });
  throw e;
}
