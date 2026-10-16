"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import MessageList from "@/components/MessageList";
import type { Message } from "@/lib/db";

const POLL_MS = 3000;

export default function ChatWidget({ slug, businessName, botName, welcome }: {
  slug: string; businessName: string; botName: string; welcome: string;
}) {
  const storageKey = `chat-token:${slug}`;
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastId = useRef(0);

  const merge = useCallback((incoming: Message[]) => {
    if (!incoming.length) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const next = [...prev, ...incoming.filter((m) => !seen.has(m.id))];
      lastId.current = Math.max(lastId.current, ...next.map((m) => m.id));
      return next;
    });
  }, []);

  useEffect(() => {
    try { setToken(localStorage.getItem(storageKey)); } catch {}
    setReady(true);
  }, [storageKey]);

  // Sondeo: trae respuestas del bot o de un agente humano que tomó la conversación.
  useEffect(() => {
    if (!token) return;
    let stop = false;
    async function poll() {
      const res = await fetch(`/api/public/${slug}/messages?token=${encodeURIComponent(token!)}&after=${lastId.current}`);
      if (res.status === 404) {
        try { localStorage.removeItem(storageKey); } catch {}
        setToken(null);
        return;
      }
      if (res.ok && !stop) merge((await res.json()).messages);
    }
    poll();
    const t = setInterval(poll, POLL_MS);
    return () => { stop = true; clearInterval(t); };
  }, [token, slug, storageKey, merge]);

  async function start(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(`/api/public/${slug}/start`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json();
    if (!res.ok) return setError(data.error ?? "No se pudo iniciar el chat");
    try { localStorage.setItem(storageKey, data.token); } catch {}
    merge(data.messages);
    setToken(data.token);
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const content = text.trim();
    if (!content || !token || sending) return;
    setText("");
    setError("");
    setSending(true);
    const optimistic: Message = { id: -Date.now(), sender: "contact", content, created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    const res = await fetch(`/api/public/${slug}/messages`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, content, after: lastId.current }),
    });
    setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    if (res.ok) merge((await res.json()).messages);
    else {
      setText(content);
      setError((await res.json().catch(() => ({}))).error ?? "No se pudo enviar el mensaje");
    }
    setSending(false);
  }

  if (!ready) return null;

  return (
    <div className="chat">
      <header className="chat-header">
        <strong>{businessName}</strong>
        <div className="muted" style={{ fontSize: 13 }}>Atiende {botName}</div>
      </header>

      {!token ? (
        <div className="chat-body">
          <div className="bubble them">{welcome}</div>
          <form className="card" onSubmit={start} style={{ marginTop: 12 }}>
            <p style={{ marginTop: 0 }}>Para atenderte, déjanos tus datos:</p>
            <label htmlFor="name">Nombre</label>
            <input id="name" name="name" required autoComplete="name" />
            <label htmlFor="phone">WhatsApp</label>
            <input id="phone" name="phone" required inputMode="tel" autoComplete="tel" placeholder="+52 55 1234 5678" />
            {error && <p className="error">{error}</p>}
            <div style={{ marginTop: 14 }}><button className="primary">Empezar chat</button></div>
          </form>
        </div>
      ) : (
        <>
          <MessageList messages={messages} perspective="contact" botName={botName} typing={sending} />
          {error && <p className="error" style={{ padding: "0 16px" }}>{error}</p>}
          <form className="chat-input" onSubmit={send}>
            <textarea
              value={text} onChange={(e) => setText(e.target.value)} placeholder="Escribe tu mensaje" rows={1}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
            />
            <button className="primary" disabled={sending || !text.trim()}>Enviar</button>
          </form>
        </>
      )}
    </div>
  );
}
