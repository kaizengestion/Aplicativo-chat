import { forbidden, getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(_req: Request, { params }: Ctx) {
  const s = await getSession();
  if (!s) return unauthorized();
  if (s.role !== "admin") return forbidden();
  const { id } = await params;
  if (id === s.userId) return Response.json({ error: "No puedes quitarte a ti mismo" }, { status: 400 });
  await withTenant(s.tenantId, async (tx) => {
    // Lo que atendía esa persona queda marcado para que otra la tome.
    await tx`update conversations set needs_human = true, handoff_reason = 'La persona que atendía salió del equipo'
             where assigned_user_id = ${id} and status = 'human'`;
    await tx`delete from app_users where id = ${id}`;
  });
  return Response.json({ ok: true });
}
