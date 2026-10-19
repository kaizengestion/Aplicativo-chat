"use client";
import Link from "next/link";
import { use, useCallback, useEffect, useRef, useState } from "react";
import MessageList from "@/components/MessageList";
import StatusBadge from "@/components/StatusBadge";
import type { Message } from "@/lib/db";

type Conv = {
  id: string; status: "bot" | "human" | "closed"; needs_human: boolean; handoff_reason: string | null;
  contact_name: string; contact_phone: string; contact_email: string | null; assigned_name: string | null; created_at: string;
};

export default function ConversationPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [conv, setConv] = useState<Conv | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const lastId = useRef(0);

  const load = useCallback(async () => {
    const res = await fetch(`/api/admin/conversations/${id}?after=${lastId.current}`);
    if (!res.ok) return;
    const data = await res.json();
    setConv(data.conversation);
    if (data.messages.length) {
      setMessages((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const next = [...prev, ...data.messages.filter((m: Message) => !seen.has(m.id))];
        lastId.current = Math.max(lastId.current, ...next.map((m) => m.id));
        return next;
      });
    }
  }, [id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  async function setStatus(status: Conv["status"]) {
    setBusy(true);
    await fetch(`/api/admin/conversations/${id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ status }) });
    await load();
    setBusy(false);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (!content) return;
    setBusy(true);
    setText("");
    await fetch(`/api/admin/conversations/${id}/messages`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ content }) });
    await load();
    setBusy(false);
  }

  if (!conv) return <p className="muted">Cargando…</p>;

  return (
    <div className="conv-view">
      <div className="chat">
        <header className="chat-header row">
          <Link href="/admin">←</Link>
          <strong>{conv.contact_name}</strong>
          <StatusBadge status={conv.status} needsHuman={conv.needs_human} />
        </header>
        <MessageList messages={messages} perspective="agent" botName="Bot" />
        <form className="chat-input" onSubmit={send}>
          <textarea
            value={text} onChange={(e) => setText(e.target.value)} rows={1}
            placeholder={conv.status === "human" ? "Escribe al cliente" : "Escribir aquí toma la conversación y pausa al bot"}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
          />
          <button className="primary" disabled={busy || !text.trim()}>Enviar</button>
        </form>
      </div>
      <aside className="card" style={{ alignSelf: "start" }}>
        <h3>Contacto</h3>
        <p style={{ margin: "0.25rem 0" }}><strong>{conv.contact_name}</strong></p>
        <p style={{ margin: "0.25rem 0" }}>
          <a href={`https://wa.me/${conv.contact_phone.replace(/\D/g, "")}`} target="_blank" rel="noreferrer">{conv.contact_phone}</a>
        </p>
        {conv.contact_email && <p style={{ margin: "0.25rem 0" }}>{conv.contact_email}</p>}
        <p className="muted" style={{ fontSize: "0.8125rem" }}>Inició {new Date(conv.created_at).toLocaleString()}</p>
        {conv.needs_human && conv.handoff_reason && (
          <p className="badge warn" style={{ whiteSpace: "normal" }}>Motivo: {conv.handoff_reason}</p>
        )}
        <h3 style={{ marginTop: "1.125rem" }}>Control</h3>
        {conv.assigned_name && conv.status === "human" && <p className="muted">Atiende {conv.assigned_name}</p>}
        <div className="row">
          {conv.status !== "human" && <button className="primary" disabled={busy} onClick={() => setStatus("human")}>Tomar conversación</button>}
          {conv.status !== "bot" && <button disabled={busy} onClick={() => setStatus("bot")}>Devolver al bot</button>}
          {conv.status !== "closed" && <button disabled={busy} onClick={() => setStatus("closed")}>Cerrar</button>}
        </div>
      </aside>
    </div>
  );
}
