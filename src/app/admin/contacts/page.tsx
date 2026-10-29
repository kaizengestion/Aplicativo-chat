import Link from "next/link";
import { getSession } from "@/lib/auth";
import { withTenant } from "@/lib/db";

export default async function Contacts() {
  const s = (await getSession())!;
  const rows = await withTenant(s.tenantId, (tx) => tx<{
    id: string; name: string; phone: string; email: string | null; last_seen_at: Date; visits: number; conversation: string | null;
  }[]>`
    select ct.id, ct.name, ct.phone, ct.email, ct.last_seen_at, c.id as conversation,
           (select count(*) from chat_sessions s where s.conversation_id = c.id)::int as visits
    from contacts ct left join conversations c on c.contact_id = ct.id
    order by ct.last_seen_at desc limit 500`);

  return (
    <>
      <div className="row" style={{ marginBottom: "0.875rem" }}>
        <h1 style={{ margin: 0 }}>Contactos</h1>
        <div className="spacer" />
        <a className="btn" href="/api/admin/contacts">Exportar CSV</a>
      </div>
      <div className="card" style={{ padding: 0, overflowX: "auto" }}>
        <table>
          <thead><tr><th>Nombre</th><th>WhatsApp</th><th>Email</th><th>Visitas</th><th>Última visita</th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.conversation ? <Link href={`/admin/conversations/${r.conversation}`}>{r.name}</Link> : r.name}</td>
                <td><a href={`https://wa.me/${r.phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{r.phone}</a></td>
                <td>{r.email ?? "—"}</td>
                <td>{r.visits}</td>
                <td>{r.last_seen_at.toLocaleString("es")}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={5} className="muted">Todavía no hay contactos.</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
