import "server-only";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

function derive(password: string, salt: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, key) => {
      if (error) reject(error); else resolve(key);
    });
  });
}

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  return `scrypt-v1:${salt}:${(await derive(password, salt)).toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string) {
  if (!/^scrypt-v1:[a-f0-9]{32}:[a-f0-9]{128}$/.test(stored)) return false;
  const [, salt, hash] = stored.split(":");
  return timingSafeEqual(await derive(password, salt), Buffer.from(hash, "hex"));
}
