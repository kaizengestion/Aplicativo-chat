"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import MessageList from "@/components/MessageList";
import { APP_NAME } from "@/lib/brand";
import { ASSISTANT_FLYER, SOLUTIONS, SOLUTIONS_KICKER, type Flyer } from "@/lib/promos";
import type { Message } from "@/lib/db";
import Composer, { type Outgoing } from "./Composer";

const POLL_MS = 3000;

export default function ChatWidget({ slug, businessName, botName, welcome }: {
  slug: string; businessName: string; botName: string; welcome: string;
}) {
  const storageKey = `chat-token:${slug}`;
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const lastId = useRef(0);

  const merge = useCallback((incoming: Message[] | undefined) => {
    if (!Array.isArray(incoming) || !incoming.length) return;
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

  /** Manda texto (JSON) o un archivo con texto opcional (multipart). Devuelve false si no se pudo. */
  async function send({ content, file, transcript }: Outgoing) {
    if (!token || sending) return false;
    setError("");
    setSending(true);
    const label = file ? (file.type.startsWith("audio/") ? "🎤 Enviando audio…" : `📎 Enviando ${file.name}…`) : "";
    const optimistic: Message = { id: -Date.now(), sender: "contact", content: [label, content].filter(Boolean).join("\n"), created_at: new Date().toISOString() };
    setMessages((prev) => [...prev, optimistic]);
    let res: Response;
    if (file) {
      const form = new FormData();
      form.append("token", token);
      form.append("content", content);
      form.append("after", String(lastId.current));
      form.append("file", file);
      if (transcript) form.append("transcript", transcript);
      res = await fetch(`/api/public/${slug}/messages`, { method: "POST", body: form }).catch(() => Response.error());
    } else {
      res = await fetch(`/api/public/${slug}/messages`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, content, after: lastId.current }),
      }).catch(() => Response.error());
    }
    setMessages((prev) => prev.filter((m) => m.id !== optimistic.id));
    if (res.ok) merge((await res.json()).messages);
    else setError((await res.json().catch(() => ({}))).error ?? (res.status === 413 ? "El archivo es muy grande (máximo 4 MB)." : "No se pudo enviar el mensaje"));
    setSending(false);
    return res.ok;
  }

  if (!ready) return null;

  return (
    <div className="chat-page">
      <aside className="promo-side" aria-label="Kaizen"><FlyerCard flyer={ASSISTANT_FLYER} /></aside>
      <div className="chat">
        <header className="chat-header row">
          <img src="/kaizen-logo.png" alt="Kaizen" width={44} height={44} className="chat-logo" />
          <div>
            <strong>{APP_NAME}</strong>
            <div className="muted" style={{ fontSize: "0.8125rem" }}>{businessName} · Atiende {botName}</div>
          </div>
        </header>
  
        {!token ? (
          <div className="chat-body">
            <div className="bubble them">{welcome}</div>
            <form className="card" onSubmit={start} style={{ marginTop: "0.75rem" }}>
              <p style={{ marginTop: 0 }}>Para atenderte, déjanos tus datos:</p>
              <label htmlFor="name">Nombre</label>
              <input id="name" name="name" required autoComplete="name" />
              <label htmlFor="phone">WhatsApp</label>
              <input id="phone" name="phone" required inputMode="tel" autoComplete="tel" placeholder="+52 55 1234 5678" />
              {error && <p className="error">{error}</p>}
              <div style={{ marginTop: "0.875rem" }}><button className="primary">Empezar chat</button></div>
            </form>
          </div>
        ) : (
          <>
            <MessageList messages={messages} perspective="contact" botName={botName} typing={sending}
              fileUrl={(a) => `/api/public/${slug}/attachments/${a}?token=${encodeURIComponent(token)}`} />
            {error && <p className="error" style={{ padding: "0 1rem" }}>{error}</p>}
            <Composer disabled={sending} onSend={send} onError={setError} />
          </>
        )}
      </div>
      <aside className="promo-side" aria-label={SOLUTIONS_KICKER}><SolutionsFlyer /></aside>
    </div>
  );
}

/** Flyer fijo de los costados (solo se ven en pantallas anchas, ver .promo-side en globals.css). */
function FlyerCard({ flyer: f }: { flyer: Flyer }) {
  if (f.image) return <img src={f.image} alt={f.title} className="flyer flyer-img" />;
  return (
    <div className={`flyer flyer-${f.style}`}>
      {f.art === "logo" && <img src="/kaizen-logo.png" alt="" className="flyer-logo" />}
      <p className="flyer-kicker">{f.kicker}</p>
      <h3 className="flyer-title">{f.title}</h3>
      {f.text && <p className="flyer-text">{f.text}</p>}
      {f.art === "chat" && (
        <div className="flyer-chat" aria-hidden="true">
          <span>¿Tienen turnos para mañana?</span>
          <span>¡Sí! Te paso los horarios libres.</span>
        </div>
      )}
      {f.cta && <span className="flyer-cta">{f.cta} →</span>}
    </div>
  );
}

/** Flyer que va mostrando de a una las soluciones de Kaizen; se puede elegir con los puntitos. */
function SolutionsFlyer() {
  const [i, setI] = useState(0);
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (paused || SOLUTIONS.length < 2) return;
    const t = setInterval(() => setI((n) => (n + 1) % SOLUTIONS.length), 5000);
    return () => clearInterval(t);
  }, [paused]);
  const s = SOLUTIONS[i];
  return (
    <div className="flyer flyer-dark flyer-rotating" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <p className="flyer-kicker">{SOLUTIONS_KICKER}</p>
      <div key={i} className="flyer-slide" aria-live="polite">
        <span className="flyer-num">{String(i + 1).padStart(2, "0")}</span>
        <h3 className="flyer-title">{s.title}</h3>
        <p className="flyer-text">{s.text}</p>
      </div>
      <div className="flyer-dots">
        {SOLUTIONS.map((x, n) => (
          <button key={x.title} type="button" aria-label={x.title} aria-current={n === i} onClick={() => setI(n)} />
        ))}
      </div>
    </div>
  );
}
