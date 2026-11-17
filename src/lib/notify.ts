import nodemailer, { type Transporter } from "nodemailer";
import { withTenant } from "./db";

/**
 * Avisa por correo a los usuarios del negocio que una conversación necesita una persona.
 * Usa SMTP (p. ej. Google Workspace) si SMTP_HOST está configurado, si no Resend (https://resend.com) con RESEND_API_KEY;
 * sin ninguno de los dos, o sin NOTIFY_FROM, solo lo registra en el log.
 */
export async function notifyHandoff(tenantId: string, conversationId: string, reason: string) {
  const info = await withTenant(tenantId, async (tx) => {
    const [c] = await tx<{ contact_name: string; contact_phone: string; tenant_name: string }[]>`
      select ct.name as contact_name, ct.phone as contact_phone, t.name as tenant_name
      from conversations c join contacts ct on ct.id = c.contact_id join tenants t on t.id = c.tenant_id
      where c.id = ${conversationId}`;
    const users = await tx<{ email: string }[]>`select email from app_users`;
    return { ...c, emails: users.map((u) => u.email) };
  });

  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const link = `${base}/admin/conversations/${conversationId}`;
  const subject = `${info.contact_name} necesita atención de una persona`;
  const text = `${info.contact_name} (${info.contact_phone}) necesita que alguien de ${info.tenant_name} siga la conversación.\n\nMotivo: ${reason}\n\nAbrir chat: ${link}`;

  if (info.emails.length === 0) return;
  await sendEmail(info.emails, subject, text);
}

/** Envía un correo por SMTP o Resend. Devuelve false si no está configurado o falló (el detalle queda en el log). */
export async function sendEmail(to: string[], subject: string, text: string) {
  const from = process.env.NOTIFY_FROM;
  if (from && process.env.SMTP_HOST) return sendSmtp(from, to, subject, text);
  const key = process.env.RESEND_API_KEY;
  if (!key || !from) {
    console.log(`[correo sin enviar: falta SMTP_HOST o RESEND_API_KEY, o NOTIFY_FROM] ${subject}`);
    return false;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!res.ok) console.error("No se pudo enviar el correo", res.status, await res.text());
  return res.ok;
}

const globalForMail = globalThis as unknown as { __smtp?: Transporter };

async function sendSmtp(from: string, to: string[], subject: string, text: string) {
  if (!globalForMail.__smtp) {
    const port = Number(process.env.SMTP_PORT || 465);
    globalForMail.__smtp = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure: port === 465,
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD } : undefined,
    });
  }
  try {
    // Cada destinatario por separado, para que los usuarios de un negocio no vean los correos de los demás.
    for (const addr of to) await globalForMail.__smtp.sendMail({ from, to: addr, subject, text });
    return true;
  } catch (err) {
    console.error("No se pudo enviar el correo por SMTP", err instanceof Error ? err.message : err);
    return false;
  }
}
