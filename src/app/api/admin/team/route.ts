import bcrypt from "bcryptjs";
import { forbidden, getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";

/** El administrador da de alta a una persona del equipo con una contraseña inicial que le comparte. */
export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  if (s.role !== "admin") return forbidden();
  const b = await req.json().catch(() => ({}));
  const name = String(b.name ?? "").trim().slice(0, 120);
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const role = b.role === "admin" ? "admin" : "agent";
  if (!name || !email.includes("@")) return Response.json({ error: "Escribe nombre y email" }, { status: 400 });
  if (password.length < 8) return Response.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });

  const hash = await bcrypt.hash(password, 10);
  try {
    await withTenant(s.tenantId, (tx) =>
      tx`insert into app_users (tenant_id, email, password_hash, name, role)
         values (${s.tenantId}, ${email}, ${hash}, ${name}, ${role})`,
    );
  } catch (e) {
    if ((e as { code?: string }).code === "23505") return Response.json({ error: "Ese email ya tiene una cuenta" }, { status: 409 });
    throw e;
  }
  return Response.json({ ok: true });
}
