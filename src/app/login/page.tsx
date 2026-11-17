import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Login() {
  return (
    <main className="center-page">
      <div className="narrow card">
        <p className="brand" style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>KAIZEN</p>
        <h1>Acceso admin</h1>
        <AuthForm
          endpoint="/api/auth/login"
          submit="Entrar"
          fields={[
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Contraseña", type: "password" },
          ]}
        />
        <p className="muted"><Link href="/forgot">¿Olvidaste tu contraseña?</Link></p>
        <p className="muted"><Link href="/">← Volver al chat</Link></p>
      </div>
    </main>
  );
}
