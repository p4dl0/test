import Link from "next/link";
import { ArrowUpRight, Inbox } from "lucide-react";
import { expirationLabel, utilization, utilizationTone, type LicenseStatus } from "@/lib/calculations";

export function PageHeader({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: React.ReactNode }) {
  return <div className="page-header"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h1>{title}</h1><p>{description}</p></div><div className="page-actions">{children}</div></div>;
}
export function StatusBadge({ status }: { status: LicenseStatus }) {
  return <span className={`status-badge status-${status.toLowerCase().replaceAll(" ", "-")}`}><span />{status}</span>;
}
export function ExpirationLabel({ days }: { days: number }) { return <span className={`expiration-label ${days < 0 ? "text-red" : days <= 30 ? "text-orange" : ""}`}>{expirationLabel(days)}</span>; }
export function UtilizationBar({ purchased, assigned, tracked = true, showCounts = true }: { purchased: number | null; assigned: number | null; tracked?: boolean; showCounts?: boolean }) {
  const percentage = utilization(purchased, assigned, tracked);
  if (percentage === null) return <span className="muted text-xs">{tracked ? "Seat quantities unknown" : "Not seat-based"}</span>;
  const tone = utilizationTone(purchased, assigned);
  return <div className={`utilization usage-${tone}`}><div className="usage-label">{showCounts && <span>{assigned}<span className="muted"> / {purchased} seats</span></span>}<strong>{percentage}%</strong></div><div className="progress-track" role="progressbar" aria-label="License utilization" aria-valuenow={percentage} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${Math.min(100, percentage)}%` }} /></div>{tone === "low" && <small>Potentially underutilized</small>}</div>;
}
export function ProductIcon({ name }: { name: string }) {
  const colors: Record<string, string> = { Microsoft: "microsoft", Adobe: "adobe", ESET: "eset", Fortinet: "fortinet", Planmeca: "planmeca", TeamViewer: "teamviewer" };
  return <span className={`product-icon ${colors[name] ?? "generic"}`}>{name === "Microsoft" ? <span className="microsoft-grid"><i /><i /><i /><i /></span> : name.slice(0, 1)}</span>;
}
export function EmptyState({ title = "No results found", description = "Try adjusting your search or filters.", children }: { title?: string; description?: string; children?: React.ReactNode }) {
  return <div className="empty-state"><span><Inbox size={26} /></span><h3>{title}</h3><p>{description}</p>{children}</div>;
}
export function Card({ title, description, href, children, className = "" }: { title?: string; description?: string; href?: string; children: React.ReactNode; className?: string }) {
  return <section className={`panel ${className}`}>{title && <div className="panel-header"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{href && <Link href={href} className="text-link">View all <ArrowUpRight size={14} /></Link>}</div>}{children}</section>;
}
