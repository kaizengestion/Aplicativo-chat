import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default function Forgot() {
  return (
    <main className="center-page">
      <div className="narrow card">
        <h1>Recuperar contraseña</h1>
        <p className="muted">Escribí tu email y te mandamos un enlace para elegir una contraseña nueva.</p>
        <AuthForm
          endpoint="/api/auth/forgot"
          submit="Enviar enlace"
          done="Listo. Si ese email tiene cuenta, en unos minutos te llega un correo con el enlace (revisá también correo no deseado)."
          fields={[{ name: "email", label: "Email", type: "email" }]}
        />
        <p className="muted"><Link href="/login">Volver a entrar</Link></p>
      </div>
    </main>
  );
}
