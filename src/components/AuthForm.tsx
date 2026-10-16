"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = { name: string; label: string; type?: string; placeholder?: string; hint?: string };

export default function AuthForm({ endpoint, fields, submit }: { endpoint: string; fields: Field[]; submit: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Algo salió mal");
    router.push("/admin");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit}>
      {fields.map((f) => (
        <div key={f.name}>
          <label htmlFor={f.name}>{f.label}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} required />
          {f.hint && <small className="muted">{f.hint}</small>}
        </div>
      ))}
      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: 18 }}>
        <button className="primary" disabled={busy}>{busy ? "Un momento…" : submit}</button>
      </div>
    </form>
  );
}
