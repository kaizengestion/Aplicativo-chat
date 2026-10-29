import { attachmentResponse } from "@/lib/attachment-response";
import { findPublicConversation } from "@/lib/conversation";
import { withTenant } from "@/lib/db";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/** Archivo de la sesión del cliente (se verifica con su token). */
export async function GET(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const found = await findPublicConversation(slug, token);
  const res = found && await withTenant(found.tenant.id, (tx) =>
    attachmentResponse(tx, id, { conversationId: found.conv.id, since: found.conv.since }));
  return res || Response.json({ error: "No encontrado" }, { status: 404 });
}
