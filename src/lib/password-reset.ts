import { createHash } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";

// Enlace de un solo uso sin tabla extra: el token lleva una huella del hash actual,
// así que deja de valer apenas se cambia la contraseña. Vence en 1 hora.
const PURPOSE = "password-reset";

function secret() {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) throw new Error("SESSION_SECRET no está configurada (mínimo 16 caracteres)");
  return new TextEncoder().encode(s);
}

export function hashFingerprint(passwordHash: string) {
  return createHash("sha256").update(passwordHash).digest("hex").slice(0, 32);
}

export async function createResetToken(userId: string, tenantId: string, passwordHash: string) {
  return new SignJWT({ purpose: PURPOSE, userId, tenantId, fp: hashFingerprint(passwordHash) })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(secret());
}

export async function readResetToken(token: string) {
  try {
    const { payload } = await jwtVerify(token, secret());
    if (payload.purpose !== PURPOSE) return null;
    return { userId: String(payload.userId), tenantId: String(payload.tenantId), fp: String(payload.fp) };
  } catch {
    return null;
  }
}
