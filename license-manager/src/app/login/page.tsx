import { redirect } from "next/navigation";
import { authenticatedActor } from "@/lib/actor";
import { LoginForm } from "@/components/login-form";

export const metadata = { title: "Sign in" };
export default async function LoginPage() {
  if (await authenticatedActor()) redirect("/");
  return <main className="min-h-screen flex items-center justify-center p-6"><section className="panel p-8 w-full max-w-md">
    <h1 className="text-2xl font-semibold mb-2">Sign in to License Manager</h1>
    <p className="muted mb-6">Use your administrator account to access this workspace.</p>
    <LoginForm />
  </section></main>;
}
