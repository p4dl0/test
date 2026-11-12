import "server-only";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/actor";
import { runNotificationJob, type NotificationChannel } from "@/services/notification-job";

export async function generateNotifications(now = new Date(), channel?: NotificationChannel) {
  await currentActor();
  return runNotificationJob(now, channel);
}
export async function markNotificationsRead(id?: string) {
  const actor = await currentActor();
  return db.notification.updateMany({ where: { userId: actor.id, readAt: null, ...(id ? { id } : {}) }, data: { readAt: new Date() } });
}
