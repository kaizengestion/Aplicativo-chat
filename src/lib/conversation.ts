import { randomBytes } from "node:crypto";
import { checkAttachmentLimit, recentFilesForBot, type AttachmentKind } from "./attachments";
import { botReply } from "./bot";
import { publicTenant, withTenant, type Message, type Tx } from "./db";
import { checkMessageLimit, checkStartLimit, RateLimitError } from "./limits";
import { notifyHandoff } from "./notify";

export function newToken() {
  return randomBytes(24).toString("base64url");
}

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
}

/** Busca la conversación del chat público a partir del enlace del negocio y el token que guarda el navegador del cliente. */
export async function findPublicConversation(slug: string, token: string | null) {
  if (!token) return null;
  const tenant = await publicTenant(slug);
  if (!tenant) return null;
  const conv = await withTenant(tenant.id, async (tx) => {
    const [c] = await tx<{ id: string; status: string }[]>`
      select id, status from conversations where public_token = ${token}`;
    return c;
  });
  return conv ? { tenant, conv } : null;
}

export async function messagesAfter(tx: Tx, conversationId: string, after = 0) {
  return tx<Message[]>`
    select m.id::int as id, m.sender, m.content, m.created_at, u.name as agent_name,
           case when a.id is null then null
                else json_build_object('id', a.id, 'kind', a.kind, 'name', a.name, 'mime', a.mime) end as attachment
    from messages m left join app_users u on u.id = m.agent_id
    left join attachments a on a.message_id = m.id
    where m.conversation_id = ${conversationId} and m.id > ${after}
    order by m.id`;
}

/** Abre una conversación nueva para el contacto con el mensaje de bienvenida del negocio. */
export async function openConversation(tx: Tx, tenantId: string, contactId: string, welcome: string) {
  const token = newToken();
  const [conv] = await tx<{ id: string }[]>`
    insert into conversations (tenant_id, contact_id, public_token)
    values (${tenantId}, ${contactId}, ${token}) returning id`;
  await tx`insert into messages (tenant_id, conversation_id, sender, content)
           values (${tenantId}, ${conv.id}, 'bot', ${welcome})`;
  return { token, messages: await messagesAfter(tx, conv.id), status: "bot" };
}

/**
 * "Reiniciar chat": el mismo contacto empieza una conversación nueva.
 * La anterior queda en el historial; si estaba solo con el bot se cierra, si espera a una persona sigue abierta para el equipo.
 */
export async function restartConversation(tenantId: string, conversationId: string, welcome: string) {
  return withTenant(tenantId, async (tx) => {
    const [old] = await tx<{ contact_id: string; phone: string; status: string; needs_human: boolean }[]>`
      select c.contact_id, ct.phone, c.status, c.needs_human
      from conversations c join contacts ct on ct.id = c.contact_id where c.id = ${conversationId} for update of c`;
    await checkStartLimit(tx, old.phone);
    await tx`insert into messages (tenant_id, conversation_id, sender, content)
             values (${tenantId}, ${conversationId}, 'system', 'El cliente reinició el chat')`;
    if (old.status === "bot" && !old.needs_human) {
      await tx`update conversations set status = 'closed' where id = ${conversationId}`;
    }
    return openConversation(tx, tenantId, old.contact_id, welcome);
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

export async function handleContactMessage(tenantId: string, conversationId: string, content: string, file?: IncomingFile) {
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
    const [conv] = await tx<{ status: string; contact_id: string }[]>`
      update conversations set last_message_at = now(),
        status = case when status = 'closed' then 'bot' else status end
      where id = ${conversationId} returning status, contact_id`;
    await tx`update contacts set last_seen_at = now() where id = ${conv.contact_id}`;
    const [tenant] = await tx<{ name: string; bot_name: string; knowledge_base: string }[]>`
      select name, bot_name, knowledge_base from tenants where id = ${tenantId}`;
    const history = conv.status === "bot" ? await messagesAfter(tx, conversationId) : [];
    const files = conv.status === "bot" ? await recentFilesForBot(tx, conversationId) : new Map();
    return { status: conv.status, tenant, history, files };
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
