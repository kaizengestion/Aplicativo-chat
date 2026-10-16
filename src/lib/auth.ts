import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { withTenant } from "./db";

const COOKIE = "session";

export type Role = "admin" | "agent";
export type Session = { userId: string; tenantId: string; name: string; role: Role };

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET no está configurada (mínimo 16 caracteres)");
  return new TextEncoder().encode(s);
}

export async function createSession(session: Session) {
  const token = await new SignJWT(session)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secret());
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
}

export async function getSession(): Promise<Session | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    const userId = String(payload.userId);
    const tenantId = String(payload.tenantId);
    // Se revalida contra la base para que quitar a alguien del equipo o cambiar su rol tenga efecto inmediato.
    const [user] = await withTenant(tenantId, (tx) =>
      tx<{ name: string; role: Role }[]>`select name, role from app_users where id = ${userId}`,
    );
    if (!user) return null;
    return { userId, tenantId, name: user.name, role: user.role };
  } catch {
    return null;
  }
}

export async function clearSession() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export function forbidden() {
  return Response.json({ error: "Solo un administrador puede hacer esto" }, { status: 403 });
}

export function unauthorized() {
  return Response.json({ error: "No autorizado" }, { status: 401 });
}
