import { getSession, unauthorized } from "@/lib/auth";
import { askAboutChats } from "@/lib/nlquery";

export async function POST(req: Request) {
  const s = await getSession();
  if (!s) return unauthorized();
  const { question } = await req.json().catch(() => ({}));
  const q = String(question ?? "").trim().slice(0, 2000);
  if (!q) return Response.json({ error: "Escribe una pregunta" }, { status: 400 });
  try {
    return Response.json(await askAboutChats(s.tenantId, q));
  } catch (e) {
    console.error("Error en consulta", e);
    return Response.json({ error: "No se pudo responder la consulta" }, { status: 500 });
  }
}
