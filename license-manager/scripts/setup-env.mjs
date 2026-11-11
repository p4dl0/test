import { existsSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";

if (!existsSync(".env")) {
  writeFileSync(".env", `DATABASE_URL="file:./prisma/dev.db"\nLICENSE_ENCRYPTION_KEY="${randomBytes(32).toString("hex")}"\nDEMO_USER_EMAIL="admin@example.test"\n`, { mode: 0o600 });
  console.log("Created .env with a unique encryption secret.");
} else {
  console.log("Existing .env preserved.");
}
