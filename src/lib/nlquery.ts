import type Anthropic from "@anthropic-ai/sdk";
import { claude, FALLBACK, MODEL, textOf } from "./claude";
import { withTenant } from "./db";

const SCHEMA_DOC = `Tablas disponibles (PostgreSQL). Todas ya están filtradas al negocio del usuario; no filtres por tenant_id.

contacts(id uuid, name text, phone text, email text, notes text, created_at timestamptz, last_seen_at timestamptz)
conversations(id uuid, contact_id uuid -> contacts.id, status text ['bot','human','closed'], needs_human boolean, handoff_reason text,
              created_at timestamptz, last_message_at timestamptz)
messages(id bigint, conversation_id uuid -> conversations.id, sender text ['contact','bot','agent','system'], content text, created_at timestamptz)

Cada contacto (un número de teléfono) tiene una sola conversación con todas sus visitas al chat.
"contact" = mensaje del cliente, "bot" = asistente automático, "agent" = persona del equipo.`;

const SQL_TOOL: Anthropic.Beta.BetaTool = {
  name: "run_sql",
  description:
    "Ejecuta una única consulta SELECT de solo lectura y devuelve hasta 200 filas en JSON. " +
    "Usa ILIKE para buscar texto en messages.content. Para listar conversaciones incluye conversations.id.",
  input_schema: {
    type: "object",
    properties: { query: { type: "string", description: "Una sola sentencia SELECT (o WITH ... SELECT), sin punto y coma" } },
    required: ["query"],
    additionalProperties: false,
  },
  strict: true,
};

const FORBIDDEN = /\b(set_config|current_setting|pg_\w+|dblink|lo_\w+|copy|reset|set|insert|update|delete|alter|drop|grant|create|truncate|call|do)\b/i;

/** Valida y ejecuta SQL generado por el modelo con rol de solo lectura, RLS y timeout. */
export async function runReadOnlySql(tenantId: string, query: string): Promise<unknown[]> {
  const q = query.trim().replace(/;+\s*$/, "");
  if (q.includes(";")) throw new Error("Solo se permite una sentencia");
  if (!/^(select|with)\b/i.test(q)) throw new Error("Solo se permiten consultas SELECT");
  if (FORBIDDEN.test(q.replace(/'(?:[^']|'')*'/g, "''"))) throw new Error("La consulta usa funciones o comandos no permitidos");

  return withTenant(tenantId, async (tx) => {
    await tx`set transaction read only`;
    await tx`set local statement_timeout = '5s'`;
    await tx`set local role chat_reader`;
    // Envolver en subconsulta impide sentencias que modifiquen datos y limita filas.
    const rows = await tx.unsafe(`select * from (${q}) as q limit 200`);
    return [...rows];
  });
}

export type AskResult = { answer: string; queries: { query: string; rows: number; error?: string }[] };

export async function askAboutChats(tenantId: string, question: string): Promise<AskResult> {
  const client = claude();
  if (!client) {
    return { answer: "Las consultas en lenguaje natural necesitan ANTHROPIC_API_KEY configurada.", queries: [] };
  }

  const system = `Eres un analista que responde preguntas del equipo sobre las conversaciones de clientes de su negocio.
Usa la herramienta run_sql para consultar los datos; puedes hacer varias consultas. Responde en el idioma de la pregunta,
de forma concreta y con cifras. Cuando menciones conversaciones concretas, incluye su enlace como /admin/conversations/<id>.
Hoy es ${new Date().toISOString().slice(0, 10)}.

${SCHEMA_DOC}`;

  const messages: Anthropic.Beta.BetaMessageParam[] = [{ role: "user", content: question }];
  const queries: AskResult["queries"] = [];

  for (let i = 0; i < 8; i++) {
    const res = await client.beta.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages,
      tools: [SQL_TOOL],
      output_config: { effort: "medium" },
      ...FALLBACK,
    });

    if (res.stop_reason === "refusal") return { answer: "No pude responder esa consulta.", queries };
    const toolUses = res.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (toolUses.length === 0) return { answer: textOf(res.content), queries };

    messages.push({ role: "assistant", content: res.content as Anthropic.Beta.BetaContentBlockParam[] });
    const results: Anthropic.Beta.BetaToolResultBlockParam[] = [];
    for (const t of toolUses) {
      const query = String((t.input as { query?: unknown })?.query ?? "");
      try {
        const rows = await runReadOnlySql(tenantId, query);
        queries.push({ query, rows: rows.length });
        results.push({ type: "tool_result", tool_use_id: t.id, content: JSON.stringify(rows).slice(0, 60000) });
      } catch (e) {
        const error = e instanceof Error ? e.message : String(e);
        queries.push({ query, rows: 0, error });
        results.push({ type: "tool_result", tool_use_id: t.id, content: `Error: ${error}`, is_error: true });
      }
    }
    messages.push({ role: "user", content: results });
  }
  return { answer: "La consulta requirió demasiados pasos; intenta una pregunta más específica.", queries };
}
