import Link from "next/link";

export default function Home() {
  return (
    <main className="center-page">
      <div className="narrow card">
        <p className="brand" style={{ fontSize: 28, margin: "0 0 8px" }}>KAIZEN</p>
        <h1>Chat de atención con IA</h1>
        <p className="muted">
          Crea el chat de tu negocio, pega el enlace en tu respuesta automática de WhatsApp y sigue cada conversación desde el tablero.
        </p>
        <div className="row">
          <Link className="btn primary" href="/signup">Crear mi negocio</Link>
          <Link className="btn" href="/login">Entrar</Link>
        </div>
      </div>
    </main>
  );
}
