import { getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { messagesAfter } from "@/lib/conversation";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const after = Number(new URL(req.url).searchParams.get("after") ?? 0) || 0;
  const data = await withTenant(s.tenantId, async (tx) => {
    const [conversation] = await tx`
      select c.id, c.status, c.needs_human, c.handoff_reason, c.created_at, c.last_message_at,
             ct.id as contact_id, ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email,
             u.name as assigned_name, (select count(*) from chat_sessions s where s.conversation_id = c.id)::int as visits
      from conversations c join contacts ct on ct.id = c.contact_id
      left join app_users u on u.id = c.assigned_user_id
      where c.id = ${id}`;
    if (!conversation) return null;
    return { conversation, messages: await messagesAfter(tx, id, after) };
  });
  if (!data) return Response.json({ error: "No encontrada" }, { status: 404 });
  return Response.json(data);
}

/** Tomar el control (human), devolver al bot (bot) o cerrar (closed). */
export async function PATCH(req: Request, { params }: Ctx) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const { status } = await req.json().catch(() => ({}));
  if (!["bot", "human", "closed"].includes(status)) return Response.json({ error: "Estado inválido" }, { status: 400 });

  const note =
    status === "human" ? `${s.name} tomó la conversación` : status === "bot" ? `${s.name} devolvió la conversación al bot` : `${s.name} cerró la conversación`;
  await withTenant(s.tenantId, async (tx) => {
    const [c] = await tx`
      update conversations set status = ${status},
        assigned_user_id = ${status === "human" ? s.userId : null},
        needs_human = case when ${status} = 'bot' then needs_human else false end
      where id = ${id} returning id`;
    if (c) {
      await tx`insert into messages (tenant_id, conversation_id, sender, content, agent_id)
               values (${s.tenantId}, ${id}, 'system', ${note}, ${s.userId})`;
    }
  });
  return Response.json({ ok: true });
}
