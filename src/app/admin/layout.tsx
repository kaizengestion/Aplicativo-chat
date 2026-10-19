import Link from "next/link";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import LogoutButton from "./LogoutButton";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");
  return (
    <div className="admin">
      <nav className="sidebar">
        <Link href="/admin" className="brand">KAIZEN</Link>
        <strong style={{ padding: "0 0.625rem 0.75rem" }}>Tablero</strong>
        <Link href="/admin">Conversaciones</Link>
        <Link href="/admin/contacts">Contactos</Link>
        <Link href="/admin/ask">Preguntar</Link>
        <Link href="/admin/settings">Bot y enlace</Link>
        {session.role === "admin" && <Link href="/admin/team">Equipo</Link>}
        <div className="spacer" />
        <span className="muted" style={{ padding: "0.5rem 0.625rem", fontSize: "0.8125rem" }}>{session.name}</span>
        <LogoutButton />
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
