import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { spawnSync } from "node:child_process";
const directory = mkdtempSync(join(tmpdir(), "license-manager-browser-"));
const env = { ...process.env, DATABASE_URL: `file:${join(directory, "test.db")}`, LICENSE_ENCRYPTION_KEY: randomBytes(32).toString("hex"), APP_URL: "http://127.0.0.1:3101", TEST_ADMIN_PASSWORD: randomBytes(24).toString("base64url") };
try {
  for (const args of [
    ["node_modules/prisma/build/index.js", "migrate", "deploy"],
    ["--conditions=react-server", "--import=tsx", "prisma/seed.ts"],
    ["--conditions=react-server", "--import=tsx", "tests/setup-browser-auth.ts"],
    ["node_modules/@playwright/test/cli.js", "test"],
  ]) {
    const result = spawnSync(process.execPath, args, { env, stdio: "inherit" });
    if (result.status !== 0) { process.exitCode = result.status ?? 1; break; }
  }
} finally { rmSync(directory, { recursive: true, force: true }); }
