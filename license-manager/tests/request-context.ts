// Test-only Next.js request boundary. Production has no environment bypass.
import { mock } from "node:test";
import { redirect } from "next/dist/client/components/redirect.js";

let token: string | undefined;
export function setSessionToken(value: string | undefined) { token = value; }

mock.module("next/headers", { namedExports: {
  cookies: async () => ({ get: (name: string) => name === "license-session" && token ? { value: token } : undefined }),
} });
// Next's bundler selects the React-server navigation entry; Node needs it mapped.
mock.module("next/navigation", { namedExports: { redirect } });
