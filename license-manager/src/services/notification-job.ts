import "server-only";
import { db } from "@/lib/db";
import { daysRemaining, expirationLabel, todayInTimezone } from "@/lib/calculations";
import type { Prisma } from "@/generated/prisma/client";

export const NOTIFICATION_THRESHOLDS = [1, 7, 14, 30, 60, 90] as const;
export type NotificationMessage = Prisma.NotificationUncheckedCreateInput;
// A future email channel can consume these durable in-app records using its own delivery cursor.
export interface NotificationChannel { deliver(message: NotificationMessage): Promise<void> }
export class InAppNotificationChannel implements NotificationChannel {
  async deliver(message: NotificationMessage) {
    await db.notification.upsert({ where: { dedupeKey: message.dedupeKey }, create: message, update: {} });
  }
}
export async function runNotificationJob(now = new Date(), channel: NotificationChannel = new InAppNotificationChannel()) {
  const settings = await db.appSettings.findUniqueOrThrow({ where: { id: "organization" } });
  if (!settings.notificationsEnabled) return { checked: 0, eligible: 0 };
  const admins = await db.adminCredential.findMany({ select: { userId: true } });
  const today = todayInTimezone(settings.timezone, now);
  const licenses = await db.license.findMany({ select: { id: true, productName: true, expirationDate: true, responsibleUserId: true } });
  let eligible = 0;
  for (const license of licenses) {
    if (!license.expirationDate) continue;
    const days = daysRemaining(license.expirationDate, today);
    // The nearest reached threshold catches missed jobs without producing a burst of stale reminders.
    const threshold = days < 0 ? 0 : NOTIFICATION_THRESHOLDS.find(value => days <= value);
    if (threshold === undefined) continue;
    eligible++;
    for (const userId of new Set([...admins.map(admin => admin.userId), ...(license.responsibleUserId ? [license.responsibleUserId] : [])])) await channel.deliver({
      licenseId: license.id, userId, threshold, expirationDate: license.expirationDate,
      productName: license.productName,
      message: `${license.productName}: ${expirationLabel(days)}. ${days < 0 ? "Review this expired agreement." : "Review seats and renewal arrangements before " + license.expirationDate + "."}`,
      dedupeKey: `${license.id}:${license.expirationDate}:${userId}:${threshold}`,
    });
  }
  return { checked: licenses.length, eligible };
}
