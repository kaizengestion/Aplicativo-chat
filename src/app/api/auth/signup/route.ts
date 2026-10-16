import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { createSession } from "@/lib/auth";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const business = String(body.business ?? "").trim();
  const slug = String(body.slug ?? "").trim().toLowerCase();
  const name = String(body.name ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!business || !name || !email.includes("@")) return Response.json({ error: "Completa todos los campos" }, { status: 400 });
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(slug)) {
    return Response.json({ error: "El enlace solo puede tener minúsculas, números y guiones" }, { status: 400 });
  }
  if (password.length < 8) return Response.json({ error: "La contraseña debe tener al menos 8 caracteres" }, { status: 400 });

  try {
    const hash = await bcrypt.hash(password, 10);
    const [row] = await db()<{ tenant_id: string; user_id: string }[]>`
      select * from signup_tenant(${slug}, ${business}, ${email}, ${hash}, ${name})`;
    await createSession({ userId: row.user_id, tenantId: row.tenant_id, name, role: "admin" });
    return Response.json({ ok: true });
  } catch (e) {
    if ((e as { code?: string }).code === "23505") {
      return Response.json({ error: "Ese enlace o email ya está en uso" }, { status: 409 });
    }
    throw e;
  }
}
