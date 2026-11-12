import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { verifyPassword } from "@/lib/security/passwords";

export const SESSION_SECONDS = 8 * 60 * 60;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 10;
const dummyHash = `scrypt-v1:${"0".repeat(32)}:${"0".repeat(128)}`;

export function sessionCookie() {
  const url = new URL(process.env.APP_URL ?? "http://127.0.0.1:3000");
  if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname))) {
    throw new Error("APP_URL must use HTTPS except on loopback hosts.");
  }
  const secure = url.protocol === "https:";
  return { origin: url.origin, name: secure ? "__Host-license-session" : "license-session", options: { httpOnly: true, secure, sameSite: "strict" as const, path: "/" } };
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function sessionActor(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  const session = await db.adminSession.findUnique({
    where: { tokenHash: hashSessionToken(token) },
    select: { expiresAt: true, admin: { select: { user: true } } },
  });
  return session && session.expiresAt.getTime() > Date.now() ? session.admin.user : null;
}

export async function revokeSession(token: string | undefined) {
  if (token) await db.adminSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
}

async function takeLoginAttempt() {
  const now = new Date();
  return db.$transaction(async tx => {
    await tx.loginThrottle.upsert({ where: { id: "admin-login" }, create: { id: "admin-login", startedAt: now }, update: {} });
    await tx.loginThrottle.updateMany({ where: { id: "admin-login", startedAt: { lte: new Date(now.getTime() - LOGIN_WINDOW_MS) } }, data: { startedAt: now, attempts: 0 } });
    const result = await tx.loginThrottle.updateMany({ where: { id: "admin-login", attempts: { lt: MAX_LOGIN_ATTEMPTS } }, data: { attempts: { increment: 1 } } });
    return result.count === 1;
  });
}

export async function authenticateAdmin(email: string, password: string) {
  if (!(await takeLoginAttempt())) return null;
  if (email.length > 254 || password.length < 1 || password.length > 256) return null;
  const credential = await db.adminCredential.findFirst({ where: { user: { email: email.trim().toLowerCase() } } });
  const valid = await verifyPassword(password, credential?.passwordHash ?? dummyHash);
  if (!credential || !valid) return null;
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  // Recheck the hash in the transaction so a concurrent reset cannot revive access.
  return db.$transaction(async tx => {
    const unchanged = await tx.adminCredential.findFirst({ where: { userId: credential.userId, passwordHash: credential.passwordHash } });
    if (!unchanged) return null;
    await tx.adminSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
    await tx.adminSession.create({ data: { tokenHash: hashSessionToken(token), adminId: credential.userId, expiresAt } });
    return { token, expiresAt };
  });
}
