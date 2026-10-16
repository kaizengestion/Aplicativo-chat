"use client";

// Si el chat falla en el navegador, muestra el motivo (sirve para diagnosticar) y permite reintentar.
export default function ChatError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  function restart() {
    try {
      for (const k of Object.keys(localStorage)) if (k.startsWith("chat-token:")) localStorage.removeItem(k);
    } catch {}
    reset();
    location.reload();
  }
  return (
    <main className="center-page">
      <div className="narrow card">
        <h2>No pudimos cargar el chat</h2>
        <p className="muted">Probá de nuevo en un momento.</p>
        <pre className="sql">{error.message}{error.digest ? `\n(${error.digest})` : ""}</pre>
        <button className="primary" onClick={restart}>Reintentar</button>
      </div>
    </main>
  );
}
