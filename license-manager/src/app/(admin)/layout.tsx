import { AppShell } from "@/components/layout/app-shell";
import { currentActor } from "@/lib/actor";
import { db } from "@/lib/db";
import { getSettings } from "@/services/licenses";
import { generateNotifications } from "@/services/notifications";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const [actor, settings] = await Promise.all([currentActor(), getSettings()]);
  await generateNotifications();
  const unread = await db.notification.count({ where: { userId: actor.id, readAt: null } });
  return <AppShell user={{ name: actor.name, email: actor.email }} organization={settings.organizationName} unread={unread}>{children}</AppShell>;
}
