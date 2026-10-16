import { getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";

export async function PUT(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 120);
  const botName = String(b.bot_name ?? "").trim().slice(0, 60);
  const welcome = String(b.welcome_message ?? "").trim().slice(0, 1000);
  const kb = String(b.knowledge_base ?? "").slice(0, 50000);
  if (!name || !botName || !welcome) return Response.json({ error: "Completa nombre, bot y bienvenida" }, { status: 400 });
  await withTenant(s.tenantId, (tx) =>
    tx`update tenants set name = ${name}, bot_name = ${botName}, welcome_message = ${welcome}, knowledge_base = ${kb}
       where id = ${s.tenantId}`,
  );
  return Response.json({ ok: true });
}
