"use client";
import Link from "next/link";
import { useState } from "react";

type Result = { answer: string; queries: { query: string; rows: number; error?: string }[] };

const EXAMPLES = [
  "¿Cuántas conversaciones hubo esta semana y cuántas pasaron a una persona?",
  "¿Qué preguntan más los clientes sobre precios?",
  "Lista los clientes que preguntaron por envíos y no recibieron respuesta de una persona",
];

/** Muestra la respuesta convirtiendo /admin/conversations/<id> en enlaces. */
function Answer({ text }: { text: string }) {
  const parts = text.split(/(\/admin\/conversations\/[0-9a-f-]{36})/g);
  return (
    <div style={{ whiteSpace: "pre-wrap" }}>
      {parts.map((p, i) => (p.startsWith("/admin/conversations/") ? <Link key={i} href={p}>ver chat</Link> : p))}
    </div>
  );
}

export default function Ask() {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function ask(q: string) {
    if (!q.trim()) return;
    setQuestion(q);
    setBusy(true);
    setError("");
    setResult(null);
    const res = await fetch("/api/admin/ask", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ question: q }) });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "No se pudo responder");
    setResult(data);
  }

  return (
    <>
      <h1>Preguntar sobre los chats</h1>
      <p className="muted">Pregunta en lenguaje natural; Claude consulta tus conversaciones y contactos para responder.</p>
      <form onSubmit={(e) => { e.preventDefault(); ask(question); }} className="row" style={{ alignItems: "stretch" }}>
        <input style={{ flex: 1, width: "auto" }} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="¿Qué te gustaría saber?" />
        <button className="primary" disabled={busy}>{busy ? "Consultando…" : "Preguntar"}</button>
      </form>
      <div className="row" style={{ marginTop: 10 }}>
        {EXAMPLES.map((e) => <button key={e} type="button" onClick={() => ask(e)} disabled={busy} style={{ fontSize: 13 }}>{e}</button>)}
      </div>
      {error && <p className="error">{error}</p>}
      {result && (
        <div className="card" style={{ marginTop: 16 }}>
          <Answer text={result.answer} />
          {result.queries.length > 0 && (
            <details style={{ marginTop: 14 }}>
              <summary className="muted">Consultas ejecutadas ({result.queries.length})</summary>
              {result.queries.map((q, i) => (
                <pre key={i} className="sql">{q.query}{"\n"}→ {q.error ? `error: ${q.error}` : `${q.rows} filas`}</pre>
              ))}
            </details>
          )}
        </div>
      )}
    </>
  );
}
