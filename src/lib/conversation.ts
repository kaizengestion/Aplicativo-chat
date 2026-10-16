import { randomBytes } from "node:crypto";
import { botReply } from "./bot";
import { withTenant, type Message, type Tx } from "./db";

export function newToken() {
  return randomBytes(24).toString("base64url");
}

export function normalizePhone(phone: string) {
  return phone.replace(/[^\d+]/g, "").replace(/(?!^)\+/g, "");
}

export async function messagesAfter(tx: Tx, conversationId: string, after = 0) {
  return tx<Message[]>`
    select m.id::int as id, m.sender, m.content, m.created_at, u.name as agent_name
    from messages m left join app_users u on u.id = m.agent_id
    where m.conversation_id = ${conversationId} and m.id > ${after}
    order by m.id`;
}

/**
 * Guarda el mensaje del cliente y, si la conversación está en modo bot, genera la respuesta.
 * La llamada a Claude ocurre fuera de la transacción; si un agente tomó el control mientras tanto, la respuesta se descarta.
 */
export async function handleContactMessage(tenantId: string, conversationId: string, content: string) {
  const ctx = await withTenant(tenantId, async (tx) => {
    await tx`insert into messages (tenant_id, conversation_id, sender, content)
             values (${tenantId}, ${conversationId}, 'contact', ${content})`;
    const [conv] = await tx<{ status: string; contact_id: string }[]>`
      update conversations set last_message_at = now(),
        status = case when status = 'closed' then 'bot' else status end
      where id = ${conversationId} returning status, contact_id`;
    await tx`update contacts set last_seen_at = now() where id = ${conv.contact_id}`;
    const [tenant] = await tx<{ name: string; bot_name: string; knowledge_base: string }[]>`
      select name, bot_name, knowledge_base from tenants where id = ${tenantId}`;
    const history = conv.status === "bot" ? await messagesAfter(tx, conversationId) : [];
    return { status: conv.status, tenant, history };
  });

  if (ctx.status !== "bot") return;

  let result;
  try {
    result = await botReply(ctx.tenant, ctx.history);
  } catch (e) {
    console.error("Error del bot", e);
    result = { reply: "Tuve un problema para responder. Una persona del equipo revisará tu mensaje.", handoff: { reason: "Error al generar respuesta" } };
  }

  await withTenant(tenantId, async (tx) => {
    const [conv] = await tx<{ status: string }[]>`select status from conversations where id = ${conversationId} for update`;
    if (conv.status !== "bot") return;
    if (result.reply) {
      await tx`insert into messages (tenant_id, conversation_id, sender, content)
               values (${tenantId}, ${conversationId}, 'bot', ${result.reply})`;
    }
    await tx`update conversations set last_message_at = now()
               ${result.handoff ? tx`, needs_human = true, handoff_reason = ${result.handoff.reason}` : tx``}
             where id = ${conversationId}`;
  });
}
