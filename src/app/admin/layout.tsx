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
        <strong style={{ padding: "4px 10px 12px" }}>Tablero</strong>
        <Link href="/admin">Conversaciones</Link>
        <Link href="/admin/contacts">Contactos</Link>
        <Link href="/admin/ask">Preguntar</Link>
        <Link href="/admin/settings">Bot y enlace</Link>
        <div className="spacer" />
        <span className="muted" style={{ padding: "8px 10px", fontSize: 13 }}>{session.name}</span>
        <LogoutButton />
      </nav>
      <main className="main">{children}</main>
    </div>
  );
}
