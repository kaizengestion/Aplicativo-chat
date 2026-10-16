"use client";
import { useState } from "react";

type Tenant = { name: string; bot_name: string; welcome_message: string; knowledge_base: string };

export default function SettingsForm({ tenant, link }: { tenant: Tenant; link: string }) {
  const [msg, setMsg] = useState("");
  const [copied, setCopied] = useState(false);
  const autoReply = `¡Gracias por escribir a ${tenant.name}! Para atenderte al instante entra a nuestro chat: ${link}`;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg("Guardando…");
    const body = Object.fromEntries(new FormData(e.currentTarget));
    const res = await fetch("/api/admin/settings", { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    setMsg(res.ok ? "Guardado" : (await res.json()).error ?? "Error al guardar");
  }

  async function copy() {
    await navigator.clipboard.writeText(autoReply);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <>
      <h1>Bot y enlace</h1>
      <div className="card" style={{ marginBottom: 16 }}>
        <h3>Enlace para la respuesta automática de WhatsApp</h3>
        <p><a href={link} target="_blank" rel="noreferrer">{link}</a></p>
        <label htmlFor="autoreply">Texto sugerido (WhatsApp Business → Herramientas → Mensaje de bienvenida / ausencia)</label>
        <textarea id="autoreply" readOnly value={autoReply} rows={3} />
        <div style={{ marginTop: 10 }}><button type="button" onClick={copy}>{copied ? "Copiado" : "Copiar texto"}</button></div>
      </div>
      <form className="card" onSubmit={save}>
        <h3>Configuración del bot</h3>
        <label htmlFor="name">Nombre del negocio</label>
        <input id="name" name="name" defaultValue={tenant.name} required />
        <label htmlFor="bot_name">Nombre del bot</label>
        <input id="bot_name" name="bot_name" defaultValue={tenant.bot_name} required />
        <label htmlFor="welcome_message">Mensaje de bienvenida</label>
        <textarea id="welcome_message" name="welcome_message" defaultValue={tenant.welcome_message} rows={2} required />
        <label htmlFor="knowledge_base">Información del negocio (lo que el bot puede responder)</label>
        <textarea
          id="knowledge_base" name="knowledge_base" defaultValue={tenant.knowledge_base} rows={14}
          placeholder={"Horarios, ubicación, productos y precios, envíos, formas de pago, políticas de cambio, preguntas frecuentes…"}
        />
        <div className="row" style={{ marginTop: 14 }}>
          <button className="primary">Guardar</button>
          <span className="muted">{msg}</span>
        </div>
      </form>
    </>
  );
}
