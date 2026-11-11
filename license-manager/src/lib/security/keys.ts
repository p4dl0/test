import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function secret() {
  const value = process.env.LICENSE_ENCRYPTION_KEY;
  if (!value || !/^[0-9a-f]{64}$/i.test(value)) throw new Error("LICENSE_ENCRYPTION_KEY must contain 32 bytes encoded as 64 hex characters.");
  return Buffer.from(value, "hex");
}
export function encryptKey(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secret(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("hex"), cipher.getAuthTag().toString("hex"), ciphertext.toString("hex")].join(":");
}
export function decryptKey(value: string) {
  const [version, iv, tag, ciphertext] = value.split(":");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Invalid encrypted key.");
  const decipher = createDecipheriv("aes-256-gcm", secret(), Buffer.from(iv, "hex"));
  decipher.setAuthTag(Buffer.from(tag, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "hex")), decipher.final()]).toString("utf8");
}
export function maskKey(suffix: string | null) {
  return suffix ? `XXXXX-XXXXX-XXXXX-${suffix}` : "No key stored";
}
