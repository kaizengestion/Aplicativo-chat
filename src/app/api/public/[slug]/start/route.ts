import { publicTenant, withTenant } from "@/lib/db";
import { cleanPhone, openSession } from "@/lib/conversation";
import { checkStartLimit, rateLimited } from "@/lib/limits";

type Ctx = { params: Promise<{ slug: string }> };

/** El cliente se identifica (nombre + WhatsApp): sigue en la conversación de ese número o se crea la primera. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const tenant = await publicTenant(slug);
  if (!tenant) return Response.json({ error: "Negocio no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 120);
  const typed = cleanPhone(String(body.phone ?? "")).slice(0, 20);
  const email = body.email ? String(body.email).trim().slice(0, 200) : null;
  if (!name || typed.replace("+", "").length < 6) {
    return Response.json({ error: "Escribe tu nombre y tu número de WhatsApp" }, { status: 400 });
  }

  const data = await withTenant(tenant.id, async (tx) => {
    // El mismo número escrito de otra forma (+54 9, 011 15…) es el mismo contacto.
    const [{ phone }] = await tx<{ phone: string }[]>`select normalize_phone(${typed}) as phone`;
    await checkStartLimit(tx, phone);
    const [contact] = await tx<{ id: string }[]>`
      insert into contacts (tenant_id, name, phone, email) values (${tenant.id}, ${name}, ${phone}, ${email})
      on conflict (tenant_id, phone) do update
        set name = excluded.name, email = coalesce(excluded.email, contacts.email), last_seen_at = now()
      returning id`;
    return openSession(tx, tenant.id, contact.id, tenant.welcome_message);
  }).catch(rateLimited);
  if (data instanceof Response) return data;

  return Response.json(data);
}
