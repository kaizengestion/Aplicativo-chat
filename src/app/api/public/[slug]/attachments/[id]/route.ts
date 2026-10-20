import { attachmentResponse } from "@/lib/attachment-response";
import { publicTenant, withTenant } from "@/lib/db";

type Ctx = { params: Promise<{ slug: string; id: string }> };

/** Archivo de la conversación del cliente (se verifica con su token). */
export async function GET(req: Request, { params }: Ctx) {
  const { slug, id } = await params;
  const token = new URL(req.url).searchParams.get("token");
  const tenant = token ? await publicTenant(slug) : null;
  const res = tenant && await withTenant(tenant.id, async (tx) => {
    const [c] = await tx<{ id: string }[]>`select id from conversations where public_token = ${token}`;
    return c ? attachmentResponse(tx, id, c.id) : null;
  });
  return res || Response.json({ error: "No encontrado" }, { status: 404 });
}
