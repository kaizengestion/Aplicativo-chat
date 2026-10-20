import type Anthropic from "@anthropic-ai/sdk";
import { claude, FALLBACK, MODEL, textOf } from "./claude";
import type { BotAttachment } from "./attachments";
import type { Message } from "./db";

type BotTenant = { name: string; bot_name: string; knowledge_base: string };

export type BotResult = { reply: string; handoff: { reason: string } | null };

const HANDOFF_TOOL: Anthropic.Beta.BetaTool = {
  name: "transfer_to_human",
  description:
    "Marca la conversación para que una persona del equipo la atienda. Úsala cuando el cliente pida hablar con una persona, " +
    "cuando la pregunta no se pueda responder con la información del negocio, o ante quejas, pagos, o casos sensibles.",
  input_schema: {
    type: "object",
    properties: { reason: { type: "string", description: "Motivo breve para el equipo" } },
    required: ["reason"],
    additionalProperties: false,
  },
  strict: true,
};

function systemPrompt(t: BotTenant) {
  return `Eres ${t.bot_name}, el asistente de atención al cliente de "${t.name}". Hablas con clientes que llegaron desde un enlace en WhatsApp.

Responde en el idioma del cliente, de forma breve y amable, como en un chat (2 a 4 frases, sin encabezados).
Usa solo la información del negocio de abajo. Si no sabes algo, no lo inventes: dilo y usa transfer_to_human para que una persona siga la conversación.
Si en el historial aparece un mensaje de un agente humano, mantén coherencia con lo que dijo.
El cliente puede mandar fotos, PDF o audios (los audios te llegan transcritos). Si te mandan un archivo, revisa su contenido y responde sobre él.

<informacion_del_negocio>
${t.knowledge_base || "(El negocio todavía no cargó información. Ofrece pasar la consulta a una persona.)"}
</informacion_del_negocio>`;
}

type Block = Anthropic.Beta.BetaContentBlockParam;

/** Contenido que ve el bot de un mensaje: texto, y la imagen o el PDF si está entre los recientes. */
function blocksOf(m: Message, files: Map<number, BotAttachment>): Block[] {
  const blocks: Block[] = [];
  const a = m.attachment;
  let text = m.sender === "agent" ? `[Agente humano] ${m.content}` : m.content;
  if (a?.kind === "audio") {
    text = m.content ? `[Audio del cliente, transcrito] ${m.content}` : "[El cliente mandó un audio que no se pudo transcribir; pídele que lo escriba]";
  } else if (a) {
    const f = files.get(m.id);
    const data = f?.data.toString("base64");
    if (data && f!.kind === "image") {
      blocks.push({ type: "image", source: { type: "base64", media_type: f!.mime as "image/png", data } });
    } else if (data) {
      blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data }, title: f!.name });
    } else {
      blocks.push({ type: "text", text: `[El cliente había mandado ${a.kind === "image" ? "una imagen" : "un PDF"}: ${a.name}]` });
    }
  }
  if (text) blocks.push({ type: "text", text });
  return blocks;
}

/** Convierte el historial a turnos user/assistant alternados, empezando por user. */
function toTurns(history: Message[], files: Map<number, BotAttachment>): Anthropic.Beta.BetaMessageParam[] {
  const turns: { role: "user" | "assistant"; content: Block[] }[] = [];
  for (const m of history) {
    if (m.sender === "system") continue;
    const role = m.sender === "contact" ? "user" : "assistant";
    const blocks = blocksOf(m, files);
    if (!blocks.length) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === role) last.content.push(...blocks);
    else turns.push({ role, content: blocks });
  }
  while (turns.length && turns[0].role === "assistant") turns.shift();
  return turns;
}

export async function botReply(tenant: BotTenant, history: Message[], files = new Map<number, BotAttachment>()): Promise<BotResult> {
  const client = claude();
  if (!client) {
    const last = history[history.length - 1]?.content ?? "";
    if (/persona|humano|agente/i.test(last)) {
      return { reply: "(Modo demo) Listo, le aviso al equipo para que una persona siga esta conversación.", handoff: { reason: "El cliente pidió hablar con una persona" } };
    }
    return {
      reply: `(Modo demo, sin ANTHROPIC_API_KEY) Recibí tu mensaje. Soy ${tenant.bot_name} de ${tenant.name}; cuando el bot esté conectado contestaré con la información del negocio.`,
      handoff: null,
    };
  }

  const system = systemPrompt(tenant);
  const messages = toTurns(history.slice(-40), files);
  let handoff: BotResult["handoff"] = null;

  // Máximo dos vueltas: respuesta (posible tool_use) y texto final tras el tool_result.
  for (let i = 0; i < 2; i++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages,
      tools: [HANDOFF_TOOL],
      output_config: { effort: "low" },
      ...FALLBACK,
    });

    if (res.stop_reason === "refusal") {
      return { reply: "Disculpa, no puedo ayudarte con eso por aquí. Una persona del equipo te va a contactar.", handoff: { reason: "El modelo rechazó la solicitud" } };
    }

    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    const text = textOf(res.content);
    if (toolUses.length === 0) return { reply: text, handoff };

    for (const t of toolUses) {
      const reason = typeof (t.input as { reason?: unknown })?.reason === "string" ? (t.input as { reason: string }).reason : "Sin motivo";
      handoff = { reason };
    }
    if (text && i === 1) return { reply: text, handoff };
    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    messages.push({
      role: "user",
      content: toolUses.map((t) => ({
        type: "tool_result" as const,
        tool_use_id: t.id,
        content: "Listo: el equipo fue notificado. Avísale al cliente que una persona seguirá la conversación pronto.",
      })),
    });
  }
  return { reply: "Una persona del equipo seguirá esta conversación en breve.", handoff };
}
