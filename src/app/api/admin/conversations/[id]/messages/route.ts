import { getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

/** Un agente escribe en la conversación. Si estaba en modo bot, la toma automáticamente. */
export async function POST(req: Request, { params }: Ctx) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const content = String(body.content ?? "").trim().slice(0, 4000);
  if (!content) return Response.json({ error: "Mensaje vacío" }, { status: 400 });

  const ok = await withTenant(s.tenantId, async (tx) => {
    const [c] = await tx<{ status: string }[]>`select status from conversations where id = ${id} for update`;
    if (!c) return false;
    if (c.status !== "human") {
      await tx`insert into messages (tenant_id, conversation_id, sender, content, agent_id)
               values (${s.tenantId}, ${id}, 'system', ${`${s.name} tomó la conversación`}, ${s.userId})`;
    }
    await tx`insert into messages (tenant_id, conversation_id, sender, content, agent_id)
             values (${s.tenantId}, ${id}, 'agent', ${content}, ${s.userId})`;
    await tx`update conversations set status = 'human', assigned_user_id = ${s.userId}, needs_human = false,
             last_message_at = now() where id = ${id}`;
    return true;
  });
  if (!ok) return Response.json({ error: "No encontrada" }, { status: 404 });
  return Response.json({ ok: true });
}
