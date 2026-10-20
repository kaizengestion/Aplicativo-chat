import type { Tx } from "./db";

export type AttachmentKind = "image" | "pdf" | "audio";

// Vercel corta los cuerpos de más de 4,5 MB; las fotos se achican en el navegador antes de subirlas.
export const MAX_FILE_BYTES = 4 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_DAY = 30;

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const AUDIO_TYPES = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav", "audio/x-m4a", "audio/aac"];

/** Tipo de adjunto aceptado para un mime, o null si no se acepta. */
export function kindOf(mime: string): AttachmentKind | null {
  const base = mime.split(";")[0].trim().toLowerCase();
  if (IMAGE_TYPES.includes(base)) return "image";
  if (base === "application/pdf") return "pdf";
  if (AUDIO_TYPES.includes(base)) return "audio";
  return null;
}

export type BotAttachment = { kind: AttachmentKind; mime: string; name: string; data: Buffer };

/** Bytes de las últimas imágenes/PDF de la conversación, para que el bot las lea (las más viejas solo se mencionan). */
export async function recentFilesForBot(tx: Tx, conversationId: string, limit = 3) {
  const rows = await tx<(BotAttachment & { message_id: number })[]>`
    select message_id::int as message_id, kind, mime, name, data from attachments
    where conversation_id = ${conversationId} and kind in ('image', 'pdf')
    order by created_at desc limit ${limit}`;
  return new Map(rows.map((r) => [r.message_id, r]));
}

export async function checkAttachmentLimit(tx: Tx, conversationId: string) {
  const [r] = await tx<{ n: number }[]>`
    select count(*)::int as n from attachments
    where conversation_id = ${conversationId} and created_at > now() - interval '1 day'`;
  return r.n < MAX_ATTACHMENTS_PER_DAY;
}

/**
 * Pasa un audio a texto con la API de transcripción de OpenAI (Claude no recibe audio).
 * Devuelve null si no hay OPENAI_API_KEY o si falla: el audio queda guardado igual.
 */
export async function transcribe(data: Buffer, mime: string, name: string): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  const form = new FormData();
  form.append("file", new Blob([new Uint8Array(data)], { type: mime.split(";")[0] }), name);
  form.append("model", process.env.TRANSCRIBE_MODEL || "gpt-4o-mini-transcribe");
  try {
    const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST", headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      console.error("Error al transcribir", res.status, await res.text().catch(() => ""));
      return null;
    }
    const text = String((await res.json()).text ?? "").trim();
    return text || null;
  } catch (e) {
    console.error("Error al transcribir", e);
    return null;
  }
}
