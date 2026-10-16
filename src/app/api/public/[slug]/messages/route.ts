import { publicTenant, withTenant } from "@/lib/db";
import { handleContactMessage, messagesAfter } from "@/lib/conversation";

type Ctx = { params: Promise<{ slug: string }> };

async function resolve(slug: string, token: string | null) {
  if (!token) return null;
  const tenant = await publicTenant(slug);
  if (!tenant) return null;
  const conv = await withTenant(tenant.id, async (tx) => {
    const [c] = await tx<{ id: string; status: string }[]>`
      select id, status from conversations where public_token = ${token}`;
    return c;
  });
  return conv ? { tenant, conv } : null;
}

/** Sondeo de mensajes nuevos (el cliente lo llama cada pocos segundos). */
export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const url = new URL(req.url);
  const found = await resolve(slug, url.searchParams.get("token"));
  if (!found) return Response.json({ error: "Conversación no encontrada" }, { status: 404 });
  const after = Number(url.searchParams.get("after") ?? 0) || 0;
  const messages = await withTenant(found.tenant.id, (tx) => messagesAfter(tx, found.conv.id, after));
  return Response.json({ messages, status: found.conv.status });
}

export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const found = await resolve(slug, body.token ? String(body.token) : null);
  if (!found) return Response.json({ error: "Conversación no encontrada" }, { status: 404 });
  const content = String(body.content ?? "").trim().slice(0, 4000);
  if (!content) return Response.json({ error: "Mensaje vacío" }, { status: 400 });

  await handleContactMessage(found.tenant.id, found.conv.id, content);
  const after = Number(body.after ?? 0) || 0;
  const messages = await withTenant(found.tenant.id, (tx) => messagesAfter(tx, found.conv.id, after));
  return Response.json({ messages });
}
