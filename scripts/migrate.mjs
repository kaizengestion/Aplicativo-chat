// Aplica db/schema.sql con el rol dueño y asigna la clave del rol chat_app.
import { readFile } from "node:fs/promises";
import postgres from "postgres";

const url = process.env.ADMIN_DATABASE_URL;
const appPassword = process.env.APP_DB_PASSWORD;
if (!url || !appPassword) {
  console.error("Faltan ADMIN_DATABASE_URL o APP_DB_PASSWORD");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {} });
const schema = await readFile(new URL("../db/schema.sql", import.meta.url), "utf8");
await sql.unsafe(schema);
await sql.unsafe(`alter role chat_app with login password '${appPassword.replace(/'/g, "''")}'`);
await sql.end();
console.log("Migración aplicada");
