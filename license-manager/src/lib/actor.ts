import "server-only";
import { db } from "@/lib/db";

// Explicit local-demo identity boundary. Replace with a verified session before network deployment.
export async function currentActor() {
  const actor = await db.user.findUnique({ where: { email: process.env.DEMO_USER_EMAIL ?? "admin@example.test" } });
  if (!actor) throw new Error("Administrator not found. Initialize the database first.");
  return actor;
}
