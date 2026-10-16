import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Signup() {
  return (
    <main className="center-page">
      <div className="narrow card">
        <h1>Crear mi negocio</h1>
        <AuthForm
          endpoint="/api/auth/signup"
          submit="Crear cuenta"
          fields={[
            { name: "business", label: "Nombre del negocio", placeholder: "Ferretería López" },
            { name: "slug", label: "Enlace del chat", placeholder: "ferreteria-lopez", hint: "Tu chat quedará en /c/ferreteria-lopez" },
            { name: "name", label: "Tu nombre" },
            { name: "email", label: "Email", type: "email" },
            { name: "password", label: "Contraseña", type: "password", hint: "Mínimo 8 caracteres" },
          ]}
        />
        <p className="muted">¿Ya tienes cuenta? <Link href="/login">Entra</Link></p>
      </div>
    </main>
  );
}
