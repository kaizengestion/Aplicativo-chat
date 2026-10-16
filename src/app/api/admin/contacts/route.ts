import { getSession, unauthorized } from "@/lib/auth";
import { withTenant } from "@/lib/db";

/** Exporta los contactos del negocio en CSV. */
export async function GET() {
  const s = await getSession();
  if (!s) return unauthorized();
  const rows = await withTenant(s.tenantId, (tx) =>
    tx<{ name: string; phone: string; email: string | null; created_at: Date; last_seen_at: Date }[]>`
      select name, phone, email, created_at, last_seen_at from contacts order by last_seen_at desc`,
  );
  const esc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const csv = ["nombre,telefono,email,creado,ultima_visita"]
    .concat(rows.map((r) => [r.name, r.phone, r.email, r.created_at.toISOString(), r.last_seen_at.toISOString()].map(esc).join(",")))
    .join("\n");
  return new Response(csv, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="contactos.csv"' },
  });
}
