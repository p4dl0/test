import "server-only";
import { db } from "@/lib/db";
import { daysRemaining, expirationLabel, todayInTimezone } from "@/lib/calculations";
import { currentActor } from "@/lib/actor";
import { getSettings } from "@/services/licenses";
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
export async function generateNotifications(now = new Date(), channel: NotificationChannel = new InAppNotificationChannel()) {
  const settings = await getSettings();
  if (!settings.notificationsEnabled) return { checked: 0, eligible: 0 };
  const admin = await currentActor();
  const today = todayInTimezone(settings.timezone, now);
  const licenses = await db.license.findMany({ select: { id: true, productName: true, expirationDate: true, responsibleUserId: true } });
  let eligible = 0;
  for (const license of licenses) {
    const days = daysRemaining(license.expirationDate, today);
    // The nearest reached threshold catches missed jobs without producing a burst of stale reminders.
    const threshold = days < 0 ? 0 : NOTIFICATION_THRESHOLDS.find(value => days <= value);
    if (threshold === undefined) continue;
    eligible++;
    for (const userId of new Set([admin.id, license.responsibleUserId])) await channel.deliver({
      licenseId: license.id, userId, threshold, expirationDate: license.expirationDate,
      productName: license.productName,
      message: `${license.productName}: ${expirationLabel(days)}. ${days < 0 ? "Review this expired agreement." : "Review seats and renewal arrangements before " + license.expirationDate + "."}`,
      dedupeKey: `${license.id}:${license.expirationDate}:${userId}:${threshold}`,
    });
  }
  return { checked: licenses.length, eligible };
}
export async function markNotificationsRead(id?: string) {
  const actor = await currentActor();
  return db.notification.updateMany({ where: { userId: actor.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}
