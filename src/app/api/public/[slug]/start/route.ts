import { publicTenant, withTenant } from "@/lib/db";
import { messagesAfter, newToken, normalizePhone } from "@/lib/conversation";

type Ctx = { params: Promise<{ slug: string }> };

/** El cliente se identifica (nombre + WhatsApp) y se abre una conversación nueva. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const tenant = await publicTenant(slug);
  if (!tenant) return Response.json({ error: "Negocio no encontrado" }, { status: 404 });

  const body = await req.json().catch(() => ({}));
  const name = String(body.name ?? "").trim().slice(0, 120);
  const phone = normalizePhone(String(body.phone ?? "")).slice(0, 20);
  const email = body.email ? String(body.email).trim().slice(0, 200) : null;
  if (!name || phone.replace("+", "").length < 6) {
    return Response.json({ error: "Escribe tu nombre y tu número de WhatsApp" }, { status: 400 });
  }

  const token = newToken();
  const data = await withTenant(tenant.id, async (tx) => {
    const [contact] = await tx<{ id: string }[]>`
      insert into contacts (tenant_id, name, phone, email) values (${tenant.id}, ${name}, ${phone}, ${email})
      on conflict (tenant_id, phone) do update
        set name = excluded.name, email = coalesce(excluded.email, contacts.email), last_seen_at = now()
      returning id`;
    const [conv] = await tx<{ id: string }[]>`
      insert into conversations (tenant_id, contact_id, public_token)
      values (${tenant.id}, ${contact.id}, ${token}) returning id`;
    await tx`insert into messages (tenant_id, conversation_id, sender, content)
             values (${tenant.id}, ${conv.id}, 'bot', ${tenant.welcome_message})`;
    return { messages: await messagesAfter(tx, conv.id), status: "bot" };
  });

  return Response.json({ token, ...data });
}
