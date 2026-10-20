import { randomBytes } from "node:crypto";
import { checkAttachmentLimit, recentFilesForBot, type AttachmentKind } from "./attachments";
import { botReply } from "./bot";
import { withTenant, type Message, type Tx } from "./db";
import { checkMessageLimit, RateLimitError } from "./limits";
import { notifyHandoff } from "./notify";

export function newToken() {
  return randomBytes(24).toString("base64url");
}

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
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
