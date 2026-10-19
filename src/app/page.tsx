import Link from "next/link";
import { APP_NAME } from "@/lib/brand";

export default function Home() {
  return (
    <main className="center-page">
      <div className="narrow card">
        <p className="brand" style={{ fontSize: "1.75rem", margin: "0 0 0.5rem" }}>KAIZEN</p>
        <h1>{APP_NAME}</h1>
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
