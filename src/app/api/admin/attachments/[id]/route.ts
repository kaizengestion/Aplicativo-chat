import { attachmentResponse } from "@/lib/attachment-response";
import { getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { id } = await params;
  const res = await withTenant(s.tenantId, (tx) => attachmentResponse(tx, id, null));
  return res || Response.json({ error: "No encontrado" }, { status: 404 });
}
