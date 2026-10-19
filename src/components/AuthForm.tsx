"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

type Field = { name: string; label: string; type?: string; placeholder?: string; hint?: string; value?: string };

export default function AuthForm({ endpoint, fields, submit, done }: { endpoint: string; fields: Field[]; submit: string; done?: string }) {
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch(endpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) return setError(data.error ?? "Algo salió mal");
    if (done) return setSent(true);
    router.push("/admin");
    router.refresh();
  }

  if (sent) return <p>{done}</p>;

  return (
    <form onSubmit={onSubmit}>
      {fields.map((f) => f.type === "hidden" ? (
        <input key={f.name} name={f.name} type="hidden" defaultValue={f.value} />
      ) : (
        <div key={f.name}>
          <label htmlFor={f.name}>{f.label}</label>
          <input id={f.name} name={f.name} type={f.type ?? "text"} placeholder={f.placeholder} required />
          {f.hint && <small className="muted">{f.hint}</small>}
        </div>
      ))}
      {error && <p className="error">{error}</p>}
      <div style={{ marginTop: "1.125rem" }}>
        <button className="primary" disabled={busy}>{busy ? "Un momento…" : submit}</button>
      </div>
    </form>
  );
}
