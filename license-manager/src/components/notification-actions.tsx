"use client";
import { useState, useTransition } from "react";
import { CheckCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { checkNotificationsAction, markReadAction } from "@/actions/administration";
export function NotificationActions({ id, check = false }: { id?: string; check?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  return <span className="notification-actions"><Button size="sm" variant="outline" disabled={pending} onClick={() => startTransition(async () => { const result = check ? await checkNotificationsAction() : await markReadAction(id); setError(result.success ? "" : result.error); })}>{check ? <RefreshCw size={14} className={pending ? "animate-spin" : ""} /> : <CheckCheck size={14} />}{check ? "Check now" : id ? "Mark read" : "Mark all read"}</Button>{error && <span className="form-error block mt-2" role="alert">{error}</span>}</span>;
}
