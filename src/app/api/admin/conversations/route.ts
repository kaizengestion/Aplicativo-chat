import { getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";
import { listConversations } from "@/lib/admin-queries";

export async function GET(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const url = new URL(req.url);
  const rows = await withTenant(s.tenantId, (tx) =>
    listConversations(tx, url.searchParams.get("filter") ?? "all", url.searchParams.get("q") ?? ""),
  );
  return Response.json({ conversations: rows });
}
