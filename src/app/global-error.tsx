"use client";

// Último recurso: muestra el error (o su código en producción) para poder diagnosticarlo.
export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  return (
    <html lang="es">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: 24 }}>
        <h2>Algo salió mal</h2>
        <p>Recargá la página. Si sigue pasando, mandá una captura de esta pantalla.</p>
        <pre style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{error.message}{error.digest ? `\n(${error.digest})` : ""}</pre>
        <button onClick={() => location.reload()}>Recargar</button>
      </body>
    </html>
  );
}
