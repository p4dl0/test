import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";

const directory = mkdtempSync(join(tmpdir(), "license-manager-test-"));
const env = { ...process.env, DATABASE_URL: `file:${join(directory, "test.db")}`, LICENSE_ENCRYPTION_KEY: randomBytes(32).toString("hex"), DEMO_USER_EMAIL: "admin@example.test" };
try {
  const migration = spawnSync(process.execPath, ["node_modules/prisma/build/index.js", "migrate", "deploy"], { env, stdio: "inherit" });
  if (migration.status !== 0) process.exitCode = 1;
  else {
    const test = spawnSync(process.execPath, ["--conditions=react-server", "--import=tsx", "--test", "--test-concurrency=1", "tests/calculations.test.ts", "tests/services.test.ts"], { env, stdio: "inherit" });
    process.exitCode = test.status ?? 1;
  }
} finally {
  rmSync(directory, { recursive: true, force: true });
}
