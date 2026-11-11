import Link from "next/link";
import { PageHeader, EmptyState } from "@/components/shared";
import { ACTION_LABELS, AuditTimeline } from "@/components/audit-timeline";
import { Button } from "@/components/ui/button";
import { db } from "@/lib/db";
import { getSettings } from "@/services/licenses";
import type { Prisma } from "@/generated/prisma/client";
export const metadata = { title: "Audit Log" };
export default async function AuditLogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const filters = await searchParams;
  const validDate = (value: string | undefined) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) ? value : undefined;
  const from = validDate(filters.from), to = validDate(filters.to);
  const where: Prisma.AuditLogWhereInput = {
    ...(filters.q ? { productName: { contains: filters.q.slice(0, 200) } } : {}),
    ...(filters.action && ACTION_LABELS[filters.action] ? { action: filters.action } : {}),
    ...(filters.license ? { licenseId: filters.license } : {}),
    ...(filters.user ? { userId: filters.user } : {}),
    ...(from || to ? { timestamp: { ...(from ? { gte: new Date(`${from}T00:00:00Z`) } : {}), ...(to ? { lte: new Date(`${to}T23:59:59.999Z`) } : {}) } } : {}),
  };
  const [count, users, settings] = await Promise.all([db.auditLog.count({ where }), db.user.findMany({ orderBy: { name: "asc" } }), getSettings()]);
  const pages = Math.max(1, Math.ceil(count / 25)), page = Math.min(pages, Math.max(1, Math.trunc(Number(filters.page)) || 1));
  const events = await db.auditLog.findMany({ where, include: { user: true }, orderBy: { timestamp: "desc" }, skip: (page - 1) * 25, take: 25 });
  const href = (page: number) => `/audit-log?${new URLSearchParams({ ...Object.fromEntries(Object.entries(filters).filter((entry): entry is [string, string] => typeof entry[1] === "string")), page: String(page) })}`;
  return <><PageHeader eyebrow="ACCOUNTABILITY" title="Audit Log" description="A permanent record of license changes, key access, and the people behind them." /><form action="/audit-log" className="audit-filter"><input className="field-input" name="q" placeholder="Search product names…" aria-label="Search audit log" defaultValue={filters.q} /><select className="field-input" name="action" aria-label="Action" defaultValue={filters.action ?? ""}><option value="">All actions</option>{Object.entries(ACTION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><select className="field-input" name="user" aria-label="User" defaultValue={filters.user ?? ""}><option value="">All users</option>{users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select><input className="field-input" type="date" name="from" aria-label="From date (UTC)" title="From date (UTC)" defaultValue={filters.from} /><input className="field-input" type="date" name="to" aria-label="To date (UTC)" title="To date (UTC)" defaultValue={filters.to} />{filters.license && <input type="hidden" name="license" value={filters.license} />}<Button variant="outline" type="submit">Apply</Button><Button variant="ghost" asChild><Link href="/audit-log">Reset</Link></Button></form><div className="panel"><div className="panel-header"><h2>Activity <span className="count-badge ml-2">{count}</span></h2><span className="muted text-[10px]">Displayed in {settings.timezone} · Date filters use UTC</span></div>{events.length ? events.map(event => <div key={event.id} className="border-t pt-4"><div className="px-[22px] mb-1">{event.licenseId ? <Link href={`/licenses/${event.licenseId}`} className="text-link">{event.productName}</Link> : <span className="muted text-xs">{event.productName} · deleted license</span>}</div><AuditTimeline events={[event]} timezone={settings.timezone} /></div>) : <EmptyState title="No matching activity" />}<div className="table-footer"><span>Page {page} of {pages}</span><div className="flex gap-4">{page > 1 && <Link href={href(page - 1)}>← Previous</Link>}{page < pages && <Link href={href(page + 1)}>Next →</Link>}</div></div></div></>;
}
