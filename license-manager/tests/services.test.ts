import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { db } from "../src/lib/db";
import { createLicense, deleteLicense, duplicateLicense, getLicense, listLicenses, revealLicenseKey, updateLicense } from "../src/services/licenses";
import { encryptKey, decryptKey } from "../src/lib/security/keys";
import { addDays, todayInTimezone } from "../src/lib/calculations";
import { generateNotifications, markNotificationsRead } from "../src/services/notifications";
import { deleteDirectory, saveDirectory, saveSettings } from "../src/services/directories";
import { statistics } from "../src/services/statistics";

const fixture = { productName: "CRUD test license", vendorId: "vendor", licenseType: "Subscription", licenseKey: "FAKE-NOT-REAL-12345", seatTracking: true, purchasedSeats: 10, assignedSeats: 7, purchaseDate: "2025-01-01", startDate: "2025-01-01", expirationDate: addDays(todayInTimezone(), 24), renewalDate: "", autoRenewal: false, annualCostMinor: 120000, currency: "EUR", departmentId: "dept", responsibleUserId: "admin", supplier: "Test reseller", contractNumber: "TEST-1", notes: "Test only" };
before(async () => {
  await db.appSettings.create({ data: {} });
  await db.vendor.create({ data: { id: "vendor", name: "Test vendor" } });
  await db.department.create({ data: { id: "dept", name: "Test department" } });
  await db.user.create({ data: { id: "admin", name: "Test admin", email: "admin@example.test", departmentId: "dept" } });
});
after(() => db.$disconnect());

test("authenticated encryption is randomized and detects tampering", () => {
  const a = encryptKey("TEST-SECRET");
  const b = encryptKey("TEST-SECRET");
  assert.notEqual(a, b);
  assert.equal(decryptKey(a), "TEST-SECRET");
  const chunks = a.split(":");
  chunks[2] = "00".repeat(16);
  assert.throws(() => decryptKey(chunks.join(":")));
});

test("CRUD persists, excludes keys, audits specialized changes, and retains deleted history", async () => {
  const { id } = await createLicense(fixture);
  const stored = await db.license.findUniqueOrThrow({ where: { id } });
  assert.notEqual(stored.encryptedKey, fixture.licenseKey);
  assert.equal(stored.keySuffix, "12345");
  const view = await getLicense(id);
  assert.equal(view?.usage, 70);
  assert.equal(view?.status, "Expiring");
  assert.equal("encryptedKey" in view!, false);
  assert.equal(await revealLicenseKey(id), fixture.licenseKey);
  const clone = await duplicateLicense(id);
  assert.equal(clone.keySuffix, null);
  assert.equal(clone.contractNumber, "");
  const changed = { ...fixture, expirationDate: addDays(fixture.expirationDate, 90), assignedSeats: 8, annualCostMinor: 240000, licenseKey: "" };
  await updateLicense(id, 1, changed);
  assert.equal((await getLicense(id))?.version, 2);
  assert.equal(await revealLicenseKey(id), fixture.licenseKey);
  await assert.rejects(updateLicense(id, 1, fixture), /changed/);
  const audit = await db.auditLog.findMany({ where: { licenseId: id } });
  for (const action of ["CREATED", "EDITED", "EXPIRATION_CHANGED", "SEATS_CHANGED", "COST_CHANGED", "KEY_REVEALED"]) assert.ok(audit.some(event => event.action === action));
  assert.equal(JSON.stringify(audit).includes(fixture.licenseKey), false);
  assert.equal(JSON.stringify(audit).includes(stored.encryptedKey!), false);
  await updateLicense(id, 2, { ...changed, clearKey: true });
  assert.equal(await revealLicenseKey(id), null);
  await deleteLicense(id, 3);
  assert.equal(await getLicense(id), null);
  const deletion = await db.auditLog.findFirstOrThrow({ where: { productName: fixture.productName, action: "DELETED" } });
  assert.equal(deletion.licenseId, null);
  assert.equal(deletion.userId, "admin");
});

test("invalid relation and invalid input cannot create a license or audit entry", async () => {
  const beforeLicenses = await db.license.count();
  const beforeAudit = await db.auditLog.count();
  await assert.rejects(createLicense({ ...fixture, vendorId: "missing" }));
  await assert.rejects(createLicense({ ...fixture, assignedSeats: 11 }));
  assert.equal(await db.license.count(), beforeLicenses);
  assert.equal(await db.auditLog.count(), beforeAudit);
});

test("database filters, search, sort, and pagination use current expiration boundaries", async () => {
  const ids: string[] = [];
  for (const [i, days] of [-1, 0, 30, 31, 60, 61].entries()) ids.push((await createLicense({ ...fixture, productName: `Boundary ${i}`, expirationDate: addDays(todayInTimezone(), days) })).id);
  assert.equal((await listLicenses({ status: "Expired" })).total, 1);
  assert.equal((await listLicenses({ status: "Expiring" })).total, 2);
  assert.equal((await listLicenses({ status: "Expiring Soon" })).total, 2);
  assert.equal((await listLicenses({ status: "Active" })).total, 1);
  assert.equal((await listLicenses({ period: "60" })).total, 4);
  assert.equal((await listLicenses({ q: "Boundary 2", vendor: "vendor", owner: "admin", department: "dept", type: "Subscription" })).total, 1);
  assert.equal((await listLicenses({ sort: "expirationDate", direction: "desc" })).licenses[0].productName, "Boundary 5");
  for (const id of ids) await deleteLicense(id, 1);
});

test("reminders are idempotent, catch up once, respect recipients, and reset on renewal", async () => {
  await db.user.create({ data: { id: "owner", name: "License owner", email: "owner@example.test" } });
  const data = { ...fixture, responsibleUserId: "owner", expirationDate: addDays(todayInTimezone(), 24) };
  const { id } = await createLicense(data);
  await Promise.all([generateNotifications(), generateNotifications()]);
  assert.equal(await db.notification.count({ where: { licenseId: id } }), 2);
  assert.equal(await db.notification.count({ where: { licenseId: id, threshold: 30 } }), 2);
  const ownerNotification = await db.notification.findFirstOrThrow({ where: { licenseId: id, userId: "owner" } });
  await markNotificationsRead(ownerNotification.id);
  assert.equal((await db.notification.findUniqueOrThrow({ where: { id: ownerNotification.id } })).readAt, null);
  await markNotificationsRead();
  assert.equal(await db.notification.count({ where: { licenseId: id, userId: "admin", readAt: null } }), 0);
  assert.equal(await db.notification.count({ where: { licenseId: id, userId: "owner", readAt: null } }), 1);
  await generateNotifications(new Date(addDays(todayInTimezone(), 10) + "T12:00:00Z"));
  assert.equal(await db.notification.count({ where: { licenseId: id, threshold: 14 } }), 2);
  await updateLicense(id, 1, { ...data, expirationDate: addDays(todayInTimezone(), 60) });
  assert.equal(await db.notification.count({ where: { licenseId: id, readAt: null } }), 0);
  await generateNotifications();
  assert.equal(await db.notification.count({ where: { licenseId: id, threshold: 60, readAt: null } }), 2);
  await deleteLicense(id, 2);
});

test("all reminder thresholds and overdue catch-up are generated exactly once", async () => {
  const expirationDate = addDays(todayInTimezone(), 100);
  const { id } = await createLicense({ ...fixture, expirationDate });
  for (const days of [91, 90, 60, 30, 14, 7, 1, 0, -1]) {
    const now = new Date(addDays(expirationDate, -days) + "T12:00:00Z");
    await generateNotifications(now);
    await generateNotifications(now);
  }
  const rows = await db.notification.findMany({ where: { licenseId: id, userId: "admin" } });
  assert.deepEqual(rows.map(row => row.threshold).sort((a, b) => a - b), [0, 1, 7, 14, 30, 60, 90]);
  await deleteLicense(id, 1);
});

test("notification preference prevents generation and settings reject invalid timezone", async () => {
  const settings = await db.appSettings.findUniqueOrThrow({ where: { id: "organization" } });
  await saveSettings({ ...settings, notificationsEnabled: false });
  const { id } = await createLicense(fixture);
  await generateNotifications();
  assert.equal(await db.notification.count({ where: { licenseId: id } }), 0);
  await assert.rejects(saveSettings({ ...settings, timezone: "Invalid/Timezone" }));
  await saveSettings({ ...settings, notificationsEnabled: true });
  await generateNotifications();
  assert.equal(await db.notification.count({ where: { licenseId: id } }), 1);
  await deleteLicense(id, 1);
});

test("directory CRUD persists and prevents deleting vendors referenced by licenses", async () => {
  const vendor = await saveDirectory("vendor", { name: "New vendor", website: "https://example.test", contact: "Test" });
  await saveDirectory("vendor", { name: "Renamed vendor", website: "", contact: "Updated" }, vendor.id);
  assert.equal((await db.vendor.findUniqueOrThrow({ where: { id: vendor.id } })).name, "Renamed vendor");
  const { id } = await createLicense({ ...fixture, vendorId: vendor.id });
  await assert.rejects(deleteDirectory("vendor", vendor.id), /Reassign/);
  await deleteLicense(id, 1);
  await deleteDirectory("vendor", vendor.id);
  const department = await saveDirectory("department", { name: "New department", description: "Test" });
  await deleteDirectory("department", department.id);
});

test("reports isolate currencies, aggregate seats, and prorate recorded terms", async () => {
  const today = todayInTimezone();
  const date = new Date(today + "T00:00:00Z");
  const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)).toISOString().slice(0, 10);
  const last = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const a = await createLicense({ ...fixture, startDate: first, expirationDate: last, assignedSeats: 5 });
  const b = await createLicense({ ...fixture, currency: "USD", annualCostMinor: 900000 });
  const report = await statistics("EUR");
  assert.equal(report.annual, 120000);
  assert.equal(report.assigned, 5);
  assert.equal(report.purchased, 10);
  assert.equal(report.underutilized.length, 1);
  assert.equal(report.unusedValue, 60000);
  assert.equal(report.monthly[0].value, 10000);
  assert.equal(report.monthly[1].value, 0);
  assert.equal(report.vendorCosts[0].value, 120000);
  assert.equal((await statistics("USD")).annual, 900000);
  await deleteLicense(a.id, 1); await deleteLicense(b.id, 1);
});
