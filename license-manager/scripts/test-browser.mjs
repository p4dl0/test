import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const directory = mkdtempSync(join(tmpdir(), "license-manager-browser-"));
const env = { ...process.env, DATABASE_URL: `file:${join(directory, "test.db")}`, LICENSE_ENCRYPTION_KEY: randomBytes(32).toString("hex"), DEMO_USER_EMAIL: "admin@example.test" };
try {
  for (const args of [
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["--conditions=react-server", "--import=tsx", "prisma/seed.ts"],
    ["node_modules/@playwright/test/cli.js", "test"],
  ]) {
    const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
  }
} finally { rmSync(directory, { recursive: true, force: true }); }
