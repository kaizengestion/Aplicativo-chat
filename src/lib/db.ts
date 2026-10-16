import postgres from "postgres";
import { cache } from "react";

type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

const globalForDb = globalThis as unknown as { __sql?: Sql };

export function db(): Sql {
  if (!globalForDb.__sql) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL no está configurada");
    // prepare: false para funcionar con el pooler de Supabase en modo transacción
    globalForDb.__sql = postgres(url, { max: 10, prepare: false, fetch_types: false });
  }
  return globalForDb.__sql;
}

/** Ejecuta fn en una transacción con app.tenant_id fijado: RLS limita todo a ese tenant. */
export async function withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const result = await db().begin(async (tx) => {
    await tx`select set_config('app.tenant_id', ${tenantId}, true)`;
    return fn(tx);
  });
  return result as T;
}

export type PublicTenant = { id: string; name: string; bot_name: string; welcome_message: string };

// cache(): la página y su metadata comparten una sola consulta por request.
export const publicTenant = cache(async (slug: string): Promise<PublicTenant | null> => {
  const rows = await db()<PublicTenant[]>`select * from public_tenant(${slug})`;
  return rows[0] ?? null;
});

export type Message = {
  id: number;
  sender: "contact" | "bot" | "agent" | "system";
  content: string;
  created_at: string;
  agent_name?: string | null;
};
