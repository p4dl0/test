"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { authenticateAdmin, revokeSession, sessionCookie, SESSION_SECONDS } from "@/lib/security/sessions";

export async function loginAction(_previous: { error: string }, formData: FormData) {
  const cookie = sessionCookie();
  if ((await headers()).get("origin") !== cookie.origin) return { error: "Unable to sign in from this address." };
  const email = formData.get("email"), password = formData.get("password");
  if (typeof email !== "string" || typeof password !== "string") return { error: "Enter your email and password." };
  const session = await authenticateAdmin(email, password);
  if (!session) return { error: "Unable to sign in. Check your credentials or try again in 15 minutes." };
  const jar = await cookies();
  await revokeSession(jar.get(cookie.name)?.value);
  jar.set(cookie.name, session.token, { ...cookie.options, expires: session.expiresAt, maxAge: SESSION_SECONDS });
  redirect("/");
}

export async function logoutAction() {
  const cookie = sessionCookie();
  if ((await headers()).get("origin") !== cookie.origin) throw new Error("Invalid request origin.");
  const jar = await cookies();
  await revokeSession(jar.get(cookie.name)?.value);
  jar.set(cookie.name, "", { ...cookie.options, maxAge: 0 });
  redirect("/login");
}
