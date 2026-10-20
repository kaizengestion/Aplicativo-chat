import type { Tx } from "./db";

/** Devuelve el archivo de un adjunto; conversationId limita al chat del cliente (null = cualquiera del tenant). */
export async function attachmentResponse(tx: Tx, id: string, conversationId: string | null) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [a] = await tx<{ mime: string; name: string; data: Buffer }[]>`
    select mime, name, data from attachments
    where id = ${id} ${conversationId ? tx`and conversation_id = ${conversationId}` : tx``}`;
  if (!a) return null;
  return new Response(new Uint8Array(a.data), {
    headers: {
      "content-type": a.mime,
      "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(a.name)}`,
      "cache-control": "private, max-age=86400",
      "x-content-type-options": "nosniff",
    },
  });
}
