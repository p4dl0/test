import "dotenv/config";
import { randomBytes } from "node:crypto";
import { openSync, writeFileSync, closeSync, unlinkSync } from "node:fs";
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security/passwords";

// Local operator command only. No web route can provision or reset an account.
const email = process.argv[2]?.trim().toLowerCase();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
  throw new Error("Usage: npm run auth:setup -- admin@example.test");
}
const path = ".admin-credentials";
let file: number | undefined;
try {
  // Never overwrite a previous credential file or follow a symlink.
  file = openSync(path, "wx", 0o600);
  const password = randomBytes(24).toString("base64url");
  const passwordHash = await hashPassword(password);
  writeFileSync(file, `Email: ${email}\nPassword: ${password}\n`);
  await db.$transaction(async tx => {
    const user = await tx.user.upsert({ where: { email }, create: { email, name: email.split("@")[0] }, update: {} });
    await tx.adminCredential.upsert({ where: { userId: user.id }, create: { userId: user.id, passwordHash }, update: { passwordHash } });
    await tx.adminSession.deleteMany({ where: { adminId: user.id } });
    await tx.loginThrottle.deleteMany();
  });
  console.log("Administrator ready. Read .admin-credentials locally, store the password in your password manager, then delete the file. Existing sessions for this account were revoked.");
} catch (error) {
  if (file !== undefined) unlinkSync(path);
  throw error;
} finally {
  if (file !== undefined) closeSync(file);
  await db.$disconnect();
}
