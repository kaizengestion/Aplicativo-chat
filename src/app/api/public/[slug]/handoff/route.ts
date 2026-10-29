import { withTenant } from "@/lib/db";
import { findPublicConversation, messagesAfter, requestHuman } from "@/lib/conversation";

type Ctx = { params: Promise<{ slug: string }> };

/** Menú del chat → "Hablar con un humano": pausa al bot y avisa al equipo. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const found = await findPublicConversation(slug, body.token ? String(body.token) : null);
  if (!found) return Response.json({ error: "Conversación no encontrada" }, { status: 404 });
  await requestHuman(found.tenant.id, found.conv.id);
  const after = Number(body.after ?? 0) || 0;
  const messages = await withTenant(found.tenant.id, (tx) => messagesAfter(tx, found.conv.id, after, found.conv.since));
  return Response.json({ messages, status: "human" });
}
