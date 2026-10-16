"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Member = { id: string; name: string; email: string; role: "admin" | "agent"; conversations: number };

export default function TeamManager({ members, me }: { members: Member[]; me: string }) {
  const router = useRouter();
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setMsg("");
    const body = Object.fromEntries(new FormData(form));
    const res = await fetch("/api/admin/team", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setMsg(data.error ?? "No se pudo agregar");
    setMsg(`Listo. Comparte con ${body.name} su email y contraseña para que entre en /login.`);
    form.reset();
    router.refresh();
  }

  async function remove(m: Member) {
    if (!confirm(`¿Quitar a ${m.name} del equipo?`)) return;
    const res = await fetch(`/api/admin/team/${m.id}`, { method: "DELETE" });
    if (!res.ok) setMsg((await res.json().catch(() => ({}))).error ?? "No se pudo quitar");
    router.refresh();
  }

  return (
    <>
      <h1>Equipo</h1>
      <div className="card" style={{ padding: 0, overflowX: "auto", marginBottom: 16 }}>
        <table>
          <thead><tr><th>Nombre</th><th>Email</th><th>Rol</th><th>Atendiendo</th><th></th></tr></thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td>{m.name}{m.id === me && <span className="muted"> (tú)</span>}</td>
                <td>{m.email}</td>
                <td><span className={`badge ${m.role === "agent" ? "human" : ""}`}>{m.role === "admin" ? "Administrador" : "Agente"}</span></td>
                <td>{m.conversations}</td>
                <td>{m.id !== me && <button onClick={() => remove(m)}>Quitar</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <form className="card" onSubmit={add}>
        <h3>Agregar a alguien</h3>
        <p className="muted" style={{ marginTop: 0 }}>Los agentes atienden conversaciones; solo los administradores cambian el bot y el equipo.</p>
        <label htmlFor="name">Nombre</label>
        <input id="name" name="name" required />
        <label htmlFor="email">Email</label>
        <input id="email" name="email" type="email" required />
        <label htmlFor="password">Contraseña inicial</label>
        <input id="password" name="password" type="text" minLength={8} required />
        <label htmlFor="role">Rol</label>
        <select id="role" name="role" defaultValue="agent">
          <option value="agent">Agente</option>
          <option value="admin">Administrador</option>
        </select>
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary" disabled={busy}>Agregar</button>
          <span className="muted">{msg}</span>
        </div>
      </form>
    </>
  );
}
