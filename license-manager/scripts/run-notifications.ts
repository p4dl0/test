import "dotenv/config";
import { runNotificationJob } from "../src/services/notification-job";
import { db } from "../src/lib/db";
try { console.log(await runNotificationJob()); }
finally { await db.$disconnect(); }
