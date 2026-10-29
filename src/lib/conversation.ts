import { randomBytes } from "node:crypto";
import { checkAttachmentLimit, recentFilesForBot, type AttachmentKind } from "./attachments";
import { botReply } from "./bot";
import { publicTenant, withTenant, type Message, type Tx } from "./db";
import { checkMessageLimit, checkStartLimit, RateLimitError } from "./limits";
import { notifyHandoff } from "./notify";

export function newToken() {
  return randomBytes(24).toString("base64url");
}

/** Limpia lo que escribió el cliente; la forma final del número la da normalize_phone() en la base. */
export function cleanPhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
}

/** Sesión del chat público: conversación del contacto y desde qué mensaje la ve este navegador. */
export type PublicConv = { id: string; status: string; since: number };

/** Busca la conversación del chat público a partir del enlace del negocio y el token que guarda el navegador del cliente. */
export async function findPublicConversation(slug: string, token: string | null) {
  if (!token) return null;
  const tenant = await publicTenant(slug);
  if (!tenant) return null;
  const conv = await withTenant(tenant.id, async (tx) => {
    const [c] = await tx<PublicConv[]>`
      select c.id, c.status, s.first_message_id::int as since
      from chat_sessions s join conversations c on c.id = s.conversation_id where s.token = ${token}`;
    return c;
  });
  return conv ? { tenant, conv } : null;
}

/** Mensajes posteriores a `after`. El tablero ve toda la conversación; el cliente, desde `since` (inicio de su sesión). */
export async function messagesAfter(tx: Tx, conversationId: string, after = 0, since = 0) {
  return tx<Message[]>`
    select m.id::int as id, m.sender, m.content, m.created_at, u.name as agent_name,
           case when a.id is null then null
                else json_build_object('id', a.id, 'kind', a.kind, 'name', a.name, 'mime', a.mime) end as attachment,
           exists (select 1 from chat_sessions s where s.conversation_id = m.conversation_id and s.first_message_id = m.id) as new_session
    from messages m left join app_users u on u.id = m.agent_id
    left join attachments a on a.message_id = m.id
    where m.conversation_id = ${conversationId} and m.id > ${after} and m.id >= ${since}
    order by m.id`;
}

/**
 * El cliente abre el chat: todo va a la única conversación de su contacto (se crea la primera vez).
 * Cada apertura es una sesión nueva con su token; en el navegador solo se ve desde la bienvenida, en el tablero se ve todo junto.
 * Si estaba cerrada o con una persona vuelve al bot; si esperaba a una persona, sigue marcada para el equipo.
 */
export async function openSession(tx: Tx, tenantId: string, contactId: string, welcome: string) {
  const [conv] = await tx<{ id: string }[]>`
    insert into conversations (tenant_id, contact_id) values (${tenantId}, ${contactId})
    on conflict (contact_id) do update set status = 'bot', assigned_user_id = null, last_message_at = now()
    returning id`;
  const [msg] = await tx<{ id: number }[]>`
    insert into messages (tenant_id, conversation_id, sender, content)
    values (${tenantId}, ${conv.id}, 'bot', ${welcome}) returning id::int as id`;
  const token = newToken();
  await tx`insert into chat_sessions (tenant_id, conversation_id, token, first_message_id)
           values (${tenantId}, ${conv.id}, ${token}, ${msg.id})`;
  return { token, messages: await messagesAfter(tx, conv.id, 0, msg.id), status: "bot" };
}

/** "Reiniciar chat": el cliente ve el chat de cero; en el tablero sigue la misma conversación con una marca. */
export async function restartConversation(tenantId: string, conversationId: string, welcome: string) {
  return withTenant(tenantId, async (tx) => {
    const [old] = await tx<{ contact_id: string; phone: string }[]>`
      select c.contact_id, ct.phone
      from conversations c join contacts ct on ct.id = c.contact_id where c.id = ${conversationId} for update of c`;
    await checkStartLimit(tx, old.phone);
    await tx`insert into messages (tenant_id, conversation_id, sender, content)
             values (${tenantId}, ${conversationId}, 'system', 'El cliente reinició el chat')`;
    return openSession(tx, tenantId, old.contact_id, welcome);
  });
}

/**
 * "Hablar con un humano": pausa al bot y deja la conversación marcada para el equipo en el tablero.
 * Si ya estaba con una persona no hace nada, y el correo al equipo sale una sola vez.
 */
export async function requestHuman(tenantId: string, conversationId: string) {
  const reason = "El cliente pidió hablar con una persona";
  const isNew = await withTenant(tenantId, async (tx) => {
    const [c] = await tx<{ status: string; needs_human: boolean }[]>`
      select status, needs_human from conversations where id = ${conversationId} for update`;
    if (c.status === "human") return false;
    await tx`insert into messages (tenant_id, conversation_id, sender, content)
             values (${tenantId}, ${conversationId}, 'bot',
                     'Listo, avisé al equipo. Una persona continuará esta conversación aquí en cuanto pueda.')`;
    await tx`update conversations set status = 'human', assigned_user_id = null, needs_human = true,
             handoff_reason = ${reason}, last_message_at = now() where id = ${conversationId}`;
    return !c.needs_human; // si el bot ya había pedido una persona, el aviso por correo ya salió
  });
  if (isNew) await notifyHandoff(tenantId, conversationId, reason).catch((e) => console.error("Error al avisar", e));
}

/**
 * Guarda el mensaje del cliente y, si la conversación está en modo bot, genera la respuesta.
 * La llamada a Claude ocurre fuera de la transacción; si un agente tomó el control mientras tanto, la respuesta se descarta.
 */
export type IncomingFile = { kind: AttachmentKind; mime: string; name: string; data: Buffer };

export async function handleContactMessage(tenantId: string, conv: PublicConv, content: string, file?: IncomingFile) {
  const conversationId = conv.id;
  const ctx = await withTenant(tenantId, async (tx) => {
    await checkMessageLimit(tx, conversationId);
    if (file && !(await checkAttachmentLimit(tx, conversationId))) {
      throw new RateLimitError("Llegaste al límite de archivos por hoy. Puedes seguir escribiendo.");
    }
    const [msg] = await tx<{ id: string }[]>`insert into messages (tenant_id, conversation_id, sender, content)
             values (${tenantId}, ${conversationId}, 'contact', ${content}) returning id`;
    if (file) {
      await tx`insert into attachments (tenant_id, conversation_id, message_id, kind, mime, name, size, data)
               values (${tenantId}, ${conversationId}, ${msg.id}, ${file.kind}, ${file.mime}, ${file.name}, ${file.data.length}, ${file.data})`;
    }
    const [updated] = await tx<{ status: string; contact_id: string }[]>`
      update conversations set last_message_at = now(),
        status = case when status = 'closed' then 'bot' else status end
      where id = ${conversationId} returning status, contact_id`;
    await tx`update contacts set last_seen_at = now() where id = ${updated.contact_id}`;
    const [tenant] = await tx<{ name: string; bot_name: string; knowledge_base: string }[]>`
      select name, bot_name, knowledge_base from tenants where id = ${tenantId}`;
    // El bot solo lee la sesión actual: quien abre el chat con un número no ve lo que se habló antes.
    const history = updated.status === "bot" ? await messagesAfter(tx, conversationId, 0, conv.since) : [];
    const files = updated.status === "bot" ? await recentFilesForBot(tx, conversationId, conv.since) : new Map();
    return { status: updated.status, tenant, history, files };
  });

  if (ctx.status !== "bot") return;

  let result;
  try {
    result = await botReply(ctx.tenant, ctx.history, ctx.files);
  } catch (e) {
    console.error("Error del bot", e);
    result = { reply: "Tuve un problema para responder. Una persona del equipo revisará tu mensaje.", handoff: { reason: "Error al generar respuesta" } };
  }

  const newHandoff = await withTenant(tenantId, async (tx) => {
    const [conv] = await tx<{ status: string; needs_human: boolean }[]>`
      select status, needs_human from conversations where id = ${conversationId} for update`;
    if (conv.status !== "bot") return false;
    if (result.reply) {
      await tx`insert into messages (tenant_id, conversation_id, sender, content)
               values (${tenantId}, ${conversationId}, 'bot', ${result.reply})`;
    }
    await tx`update conversations set last_message_at = now()
               ${result.handoff ? tx`, needs_human = true, handoff_reason = ${result.handoff.reason}` : tx``}
             where id = ${conversationId}`;
    return Boolean(result.handoff) && !conv.needs_human;
  });

  // Aviso solo cuando la conversación pasa a necesitar persona (no en cada mensaje).
  if (newHandoff && result.handoff) {
    await notifyHandoff(tenantId, conversationId, result.handoff.reason).catch((e) => console.error("Error al avisar", e));
  }
}
