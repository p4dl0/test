import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/security/passwords";

try {
  const password = process.env.TEST_ADMIN_PASSWORD;
  if (!password) throw new Error("Missing browser test password");
  const user = await db.user.findUniqueOrThrow({ where: { email: "admin@example.test" } });
  await db.adminCredential.create({ data: { userId: user.id, passwordHash: await hashPassword(password) } });
} finally { await db.$disconnect(); }
