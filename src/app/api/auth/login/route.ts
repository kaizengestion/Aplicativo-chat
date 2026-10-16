import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const [user] = await db()<{ user_id: string; tenant_id: string; password_hash: string; name: string }[]>`
    select * from find_login(${email})`;
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return Response.json({ error: "Email o contraseña incorrectos" }, { status: 401 });
  }
  await createSession({ userId: user.user_id, tenantId: user.tenant_id, name: user.name });
  return Response.json({ ok: true });
}
