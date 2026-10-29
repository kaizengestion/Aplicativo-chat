import { findPublicConversation, restartConversation } from "@/lib/conversation";
import { rateLimited } from "@/lib/limits";

type Ctx = { params: Promise<{ slug: string }> };

/** Menú del chat → "Reiniciar chat": el cliente ve el chat de cero, sin volver a pedir sus datos. */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const body = await req.json().catch(() => ({}));
  const found = await findPublicConversation(slug, body.token ? String(body.token) : null);
  if (!found) return Response.json({ error: "Conversación no encontrada" }, { status: 404 });
  const data = await restartConversation(found.tenant.id, found.conv.id, found.tenant.welcome_message).catch(rateLimited);
  if (data instanceof Response) return data;
  return Response.json(data);
}
