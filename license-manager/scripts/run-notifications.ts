import "dotenv/config";
import { generateNotifications } from "../src/services/notifications";
import { db } from "../src/lib/db";
try { console.log(await generateNotifications()); }
finally { await db.$disconnect(); }
