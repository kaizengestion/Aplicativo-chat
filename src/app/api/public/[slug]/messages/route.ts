import { withTenant } from "@/lib/db";
import { kindOf, MAX_FILE_BYTES, transcribe } from "@/lib/attachments";
import { findPublicConversation as resolve, handleContactMessage, messagesAfter, type IncomingFile } from "@/lib/conversation";
import { rateLimited } from "@/lib/limits";

type Ctx = { params: Promise<{ slug: string }> };

/** Sondeo de mensajes nuevos (el cliente lo llama cada pocos segundos). */
export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const url = new URL(req.url);
  const found = await resolve(slug, url.searchParams.get("token"));
  if (!found) return Response.json({ error: "Conversación no encontrada" }, { status: 404 });
  const after = Number(url.searchParams.get("after") ?? 0) || 0;
  const messages = await withTenant(found.tenant.id, (tx) => messagesAfter(tx, found.conv.id, after));
  return Response.json({ messages, status: found.conv.status });
}

// Transcribir un audio puede tardar; el bot responde en la misma llamada.
export const maxDuration = 60;

/** Mensaje del cliente: JSON con texto, o multipart con texto opcional y un archivo (imagen, PDF o audio). */
export async function POST(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const multipart = (req.headers.get("content-type") ?? "").startsWith("multipart/form-data");
  const body: Record<string, unknown> = multipart
    ? Object.fromEntries((await req.formData().catch(() => new FormData())).entries())
    : await req.json().catch(() => ({}));
  const found = await resolve(slug, body.token ? String(body.token) : null);
  if (!found) return Response.json({ error: "Conversación no encontrada" }, { status: 404 });
  let content = String(body.content ?? "").trim().slice(0, 4000);

  let file: IncomingFile | undefined;
  if (body.file instanceof File && body.file.size > 0) {
    const kind = kindOf(body.file.type);
    if (!kind) return Response.json({ error: "Solo se pueden mandar fotos, PDF o audios." }, { status: 400 });
    if (body.file.size > MAX_FILE_BYTES) return Response.json({ error: "El archivo es muy grande (máximo 4 MB)." }, { status: 413 });
    const data = Buffer.from(await body.file.arrayBuffer());
    const name = (body.file.name || (kind === "audio" ? "audio" : "archivo")).slice(0, 200);
    file = { kind, mime: body.file.type, name, data };
    // El texto de un audio es su transcripción: así lo lee el bot, el tablero y las consultas.
    // Si no hay servicio de transcripción, se usa el texto que reconoció el navegador al grabar.
    if (kind === "audio") content = ((await transcribe(data, body.file.type, name)) ?? String(body.transcript ?? "").trim()).slice(0, 4000);
  }
  if (!content && !file) return Response.json({ error: "Mensaje vacío" }, { status: 400 });

  try {
    await handleContactMessage(found.tenant.id, found.conv.id, content, file);
  } catch (e) {
    return rateLimited(e);
  }
  const after = Number(body.after ?? 0) || 0;
  const messages = await withTenant(found.tenant.id, (tx) => messagesAfter(tx, found.conv.id, after));
  return Response.json({ messages });
}
