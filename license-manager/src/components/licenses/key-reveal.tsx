"use client";
import { useEffect, useState, useTransition } from "react";
import { Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { revealLicenseKeyAction } from "@/actions/licenses";

export function KeyReveal({ id, suffix }: { id: string; suffix: string | null }) {
  const [key, setKey] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  useEffect(() => {
    if (!key) return;
    const timer = setTimeout(() => setKey(null), 30_000);
    const hide = () => { if (document.hidden) setKey(null); };
    document.addEventListener("visibilitychange", hide);
    return () => { clearTimeout(timer); document.removeEventListener("visibilitychange", hide); };
  }, [key]);
  if (!suffix) return <span className="muted">No key stored</span>;
  return <div><div className="key-reveal"><code>{key ?? `XXXXX-XXXXX-XXXXX-${suffix}`}</code><Button variant="outline" size="sm" disabled={pending} onClick={() => {
    if (key) { setKey(null); return; }
    startTransition(async () => { const result = await revealLicenseKeyAction(id); if (result.success) { setKey(result.data); setError(""); } else setError(result.error); });
  }}>{key ? <EyeOff size={14} /> : <Eye size={14} />}{key ? "Hide" : pending ? "Loading…" : "Show"}</Button></div>{key && <small className="muted">Automatically hides after 30 seconds. This reveal is recorded in the audit log.</small>}{error && <p className="form-error" role="alert">{error}</p>}</div>;
}
