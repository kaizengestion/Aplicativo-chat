import bcrypt from "bcryptjs";
import { withTenant } from "@/lib/db";
import { createSession, type Role } from "@/lib/auth";
import { hashFingerprint, readResetToken } from "@/lib/password-reset";

const EXPIRED = "El enlace venció o ya se usó. Pedí uno nuevo desde «¿Olvidaste tu contraseña?».";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const password = String(body.password ?? "");
  const t = await readResetToken(String(body.token ?? ""));
  if (!t) return Response.json({ error: EXPIRED }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });

  const hash = await bcrypt.hash(password, 10);
  const user = await withTenant(t.tenantId, async (tx) => {
    const [u] = await tx<{ password_hash: string; name: string; role: Role }[]>`
      select password_hash, name, role from app_users where id = ${t.userId} for update`;
    if (!u || hashFingerprint(u.password_hash) !== t.fp) return null;
    await tx`update app_users set password_hash = ${hash} where id = ${t.userId}`;
    return u;
  });
  if (!user) return Response.json({ error: EXPIRED }, { status: 400 });

  await createSession({ userId: t.userId, tenantId: t.tenantId, name: user.name, role: user.role });
  return Response.json({ ok: true });
}
