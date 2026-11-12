import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionActor, sessionCookie } from "@/lib/security/sessions";

export async function authenticatedActor() {
  return sessionActor((await cookies()).get(sessionCookie().name)?.value);
}

// An AdminCredential is the authorization grant; directory users have no access.
export async function currentActor() {
  const actor = await authenticatedActor();
  if (!actor) redirect("/login");
  return actor;
}
