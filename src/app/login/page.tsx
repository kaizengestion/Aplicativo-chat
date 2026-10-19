import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Login() {
  return (
    <main className="center-page">
      <div className="narrow card">
        <h1>Entrar al tablero</h1>
        <AuthForm
          endpoint="/api/auth/login"
          submit="Entrar"
          fields={[
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Contraseña", type: "password" },
          ]}
        />
        <p className="muted"><Link href="/forgot">¿Olvidaste tu contraseña?</Link></p>
        <p className="muted">¿No tienes cuenta? <Link href="/signup">Crea tu negocio</Link></p>
      </div>
    </main>
  );
}
