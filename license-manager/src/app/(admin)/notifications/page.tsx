import Link from "next/link";
import { Check, Clock3 } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared";
import { NotificationActions } from "@/components/notification-actions";
import { generateNotifications } from "@/services/notifications";
import { currentActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { getSettings } from "@/services/licenses";
export const metadata = { title: "Notifications" };
export default async function NotificationsPage({ searchParams }: { searchParams: Promise<{ view?: string; page?: string }> }) {
  await generateNotifications();
  const [actor, filters, settings] = await Promise.all([currentActor(), searchParams, getSettings()]);
  const where = { userId: actor.id, ...(filters.view === "unread" ? { readAt: null } : {}) };
  const [count, unread] = await Promise.all([db.notification.count({ where }), db.notification.count({ where: { userId: actor.id, readAt: null } })]);
  const pages = Math.max(1, Math.ceil(count / 30));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(filters.page)) || 1));
  const notifications = await db.notification.findMany({ where, orderBy: { createdAt: "desc" }, take: 30, skip: (page - 1) * 30 });
  return <><PageHeader eyebrow="RENEWAL REMINDERS" title="Notifications" description="Expiration alerts delivered to your workspace, with a complete reminder history."><NotificationActions check /><NotificationActions /></PageHeader><div className="view-tabs"><Link className={filters.view !== "unread" ? "selected" : ""} href="/notifications">All notifications</Link><Link className={filters.view === "unread" ? "selected" : ""} href="/notifications?view=unread">Unread <span className="count-badge ml-1">{unread}</span></Link></div>{!settings.notificationsEnabled && <div className="attention-banner">New reminders are paused in Settings. Existing notifications remain available.</div>}<div className="panel notification-list">{notifications.length ? notifications.map(notification => <article key={notification.id} className={`notification-item ${!notification.readAt ? "unread" : ""}`}><span className={`stat-icon ${notification.threshold === 0 ? "red" : "amber"}`}><Clock3 size={17} /></span><div><strong>{notification.productName}</strong><p>{notification.message}</p><small>{new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: settings.timezone }).format(notification.createdAt)} · {notification.threshold === 0 ? "Expired agreement" : `${notification.threshold}-day reminder`} · Expiration {notification.expirationDate}</small>{notification.licenseId && <Link href={`/licenses/${notification.licenseId}`} className="text-link mt-3">View license →</Link>}</div>{notification.readAt ? <span className="read-indicator"><Check size={12} />Read</span> : <NotificationActions id={notification.id} />}</article>) : <EmptyState title="You’re all caught up" description="No notifications match this view. Reminders appear as licenses approach expiration." />}<div className="table-footer"><span>{count} notifications · Page {page} of {pages}</span><div className="flex gap-4">{page > 1 && <Link href={`/notifications?view=${filters.view ?? "all"}&page=${page - 1}`}>← Previous</Link>}{page < pages && <Link href={`/notifications?view=${filters.view ?? "all"}&page=${page + 1}`}>Next →</Link>}</div></div></div></>;
}
