"use client";

import { useActionState } from "react";
import { loginAction } from "@/actions/auth";
import { Button } from "@/components/ui/button";

export function LoginForm() {
  const [state, action, pending] = useActionState(loginAction, { error: "" });
  return <form action={action} className="stack">
    <label>Email<input className="field-input" name="email" type="email" autoComplete="username" maxLength={254} required /></label>
    <label>Password<input className="field-input" name="password" type="password" autoComplete="current-password" maxLength={256} required /></label>
    {state.error && <p role="alert" className="form-error">{state.error}</p>}
    <Button type="submit" disabled={pending}>{pending ? "Signing in…" : "Sign in"}</Button>
  </form>;
}
