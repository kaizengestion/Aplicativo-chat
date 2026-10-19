import Link from "next/link";
import AuthForm from "@/components/AuthForm";

export default async function Reset({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token = "" } = await searchParams;
  return (
    <main className="center-page">
      <div className="narrow card">
        <h1>Contraseña nueva</h1>
        <AuthForm
          endpoint="/api/auth/reset"
          submit="Guardar y entrar"
          fields={[
            { name: "token", label: "", type: "hidden", value: token },
            { name: "password", label: "Contraseña nueva", type: "password", hint: "Mínimo 8 caracteres" },
          ]}
        />
        <p className="muted"><Link href="/forgot">Pedir otro enlace</Link></p>
      </div>
    </main>
  );
}
