"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/StatusBadge";
import type { ConversationRow } from "@/lib/admin-queries";

const FILTERS = [
  ["all", "Todas"], ["needs_human", "Necesitan persona"], ["bot", "Con el bot"], ["human", "Con humano"], ["closed", "Cerradas"],
] as const;

export default function Conversations() {
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ConversationRow[] | null>(null);

  useEffect(() => {
    let stop = false;
    async function load() {
      const res = await fetch(`/api/admin/conversations?filter=${filter}&q=${encodeURIComponent(q)}`);
      if (res.ok && !stop) setRows((await res.json()).conversations);
    }
    load();
    const t = setInterval(load, 5000);
    return () => { stop = true; clearInterval(t); };
  }, [filter, q]);

  return (
    <>
      <h1>Conversaciones</h1>
      <div className="row" style={{ marginBottom: 14 }}>
        <div className="tabs">
          {FILTERS.map(([k, label]) => (
            <button key={k} className={filter === k ? "active" : ""} onClick={() => setFilter(k)}>{label}</button>
          ))}
        </div>
        <div className="spacer" />
        <input style={{ maxWidth: 260 }} placeholder="Buscar por nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="card" style={{ padding: 0 }}>
        {rows === null ? <p className="muted" style={{ padding: 16 }}>Cargando…</p> :
          rows.length === 0 ? <p className="muted" style={{ padding: 16 }}>No hay conversaciones todavía. Comparte tu enlace desde “Bot y enlace”.</p> :
          <div className="list">
            {rows.map((c) => (
              <Link key={c.id} href={`/admin/conversations/${c.id}`}>
                <div className="row">
                  <strong>{c.contact_name}</strong>
                  <span className="muted">{c.contact_phone}</span>
                  <div className="spacer" />
                  <StatusBadge status={c.status} needsHuman={c.needs_human} />
                  <span className="muted" style={{ fontSize: 13 }}>{new Date(c.last_message_at).toLocaleString()}</span>
                </div>
                <div className="preview">
                  {c.last_sender === "contact" ? "" : c.last_sender === "bot" ? "Bot: " : c.last_sender === "agent" ? `${c.assigned_name ?? "Equipo"}: ` : ""}
                  {c.last_message}
                </div>
              </Link>
            ))}
          </div>}
      </div>
    </>
  );
}
