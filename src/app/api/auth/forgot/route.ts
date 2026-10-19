import { db } from "@/lib/db";
import { sendEmail } from "@/lib/notify";
import { createResetToken } from "@/lib/password-reset";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const [user] = await db()<{ user_id: string; tenant_id: string; password_hash: string; name: string }[]>`
    select * from find_login(${email})`;
  // Siempre la misma respuesta, para no revelar qué emails tienen cuenta.
  if (!user) return Response.json({ ok: true });

  const token = await createResetToken(user.user_id, user.tenant_id, user.password_hash);
  const base = process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin;
  const link = `${base}/reset?token=${encodeURIComponent(token)}`;
  const text = `Hola ${user.name}:\n\nPara elegir una contraseña nueva para el tablero, abrí este enlace:\n${link}\n\nVence en 1 hora y sirve una sola vez. Si no lo pediste, ignorá este correo.`;
  await sendEmail([email], "Elegí una contraseña nueva", text);
  return Response.json({ ok: true });
}
