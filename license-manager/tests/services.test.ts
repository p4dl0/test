import { after, before, beforeEach, test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, statSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { db } from "../src/lib/db";
import { createLicense, deleteLicense, duplicateLicense, getLicense, listLicenses, revealLicenseKey, updateLicense } from "../src/services/licenses";
import { encryptKey, decryptKey } from "../src/lib/security/keys";
import { addDays, todayInTimezone } from "../src/lib/calculations";
import { generateNotifications, markNotificationsRead } from "../src/services/notifications";
import { deleteDirectory, saveDirectory, saveSettings } from "../src/services/directories";
import { statistics } from "../src/services/statistics";
import { hashPassword, verifyPassword } from "../src/lib/security/passwords";
import { authenticateAdmin, hashSessionToken, revokeSession, sessionActor, sessionCookie } from "../src/lib/security/sessions";
import { currentActor } from "../src/lib/actor";
import { getSettings, lookups } from "../src/services/licenses";
import { setSessionToken } from "./request-context";
import { previewLicenseImport, importLicenses } from "../src/services/license-import";
import { CsvImportError } from "../src/lib/license-csv";
import { csvFixture } from "./csv-fixture";
import { inspectLicenseCsv } from "../src/lib/csv-mapping";

const password = "test-only-password-not-for-deployment";
let adminToken: string;

const fixture = { productName: "CRUD test license", vendorId: "vendor", licenseType: "Subscription", licenseKey: "FAKE-NOT-REAL-12345", seatTracking: true, purchasedSeats: 10, assignedSeats: 7, purchaseDate: "2025-01-01", startDate: "2025-01-01", expirationDate: addDays(todayInTimezone(), 24), renewalDate: "", autoRenewal: false, annualCostMinor: 120000, currency: "EUR", departmentId: "dept", responsibleUserId: "admin", supplier: "Test reseller", contractNumber: "TEST-1", notes: "Test only" };
before(async () => {
  await db.appSettings.create({ data: {} });
  await db.vendor.create({ data: { id: "vendor", name: "Test vendor" } });
  await db.department.create({ data: { id: "dept", name: "Test department" } });
  await db.user.create({ data: { id: "admin", name: "Test admin", email: "admin@example.test", departmentId: "dept" } });
  await db.adminCredential.create({ data: { userId: "admin", passwordHash: await hashPassword(password) } });
  adminToken = (await authenticateAdmin("admin@example.test", password))!.token;
});
beforeEach(async () => {
  setSessionToken(adminToken);
  await db.loginThrottle.deleteMany();
});
after(() => db.$disconnect());

test("anonymous callers cannot read data, reveal keys, or perform any administrative action", async () => {
  const { id } = await createLicense(fixture);
  const counts = await Promise.all([db.license.count(), db.auditLog.count(), db.notification.count()]);
  setSessionToken(undefined);
  for (const operation of [
    () => currentActor(), () => getSettings(), () => lookups(), () => listLicenses(),
    () => getLicense(id), () => duplicateLicense(id), () => statistics(),
    () => revealLicenseKey(id), () => createLicense(fixture),
    () => updateLicense(id, 1, fixture), () => deleteLicense(id, 1),
    () => saveDirectory("vendor", { name: "Forbidden", website: "", contact: "" }),
    () => deleteDirectory("vendor", "vendor"),
    () => saveSettings({ organizationName: "Forbidden", timezone: "UTC", defaultCurrency: "EUR", notificationsEnabled: false }),
    () => generateNotifications(), () => markNotificationsRead(),
  ]) await assert.rejects(operation, /NEXT_REDIRECT/);
  assert.deepEqual(await Promise.all([db.license.count(), db.auditLog.count(), db.notification.count()]), counts);
  setSessionToken(adminToken);
  await deleteLicense(id, 1);
});

test("passwords are salted and invalid credentials or directory-only users cannot log in", async () => {
  const hash = await hashPassword(password);
  assert.notEqual(hash, await hashPassword(password));
  assert.equal(await verifyPassword(password, hash), true);
  assert.equal(await verifyPassword("incorrect", hash), false);
  assert.equal(await authenticateAdmin("admin@example.test", "incorrect"), null);
  assert.equal(await authenticateAdmin("missing@example.test", password), null);
  await db.user.create({ data: { id: "directory-only", name: "No login", email: "directory@example.test" } });
  assert.equal(await authenticateAdmin("directory@example.test", password), null);
  setSessionToken("admin");
  await assert.rejects(currentActor(), /NEXT_REDIRECT/);
});

test("opaque sessions reject tampering, expire, revoke, and bind audits to the authenticated admin", async () => {
  const session = (await authenticateAdmin("admin@example.test", password))!;
  const stored = await db.adminSession.findUniqueOrThrow({ where: { tokenHash: hashSessionToken(session.token) } });
  assert.notEqual(stored.tokenHash, session.token);
  assert.equal((await sessionActor(session.token))?.id, "admin");
  const forged = (session.token[0] === "0" ? "1" : "0") + session.token.slice(1);
  assert.equal(await sessionActor(forged), null);
  await db.adminSession.update({ where: { tokenHash: stored.tokenHash }, data: { expiresAt: new Date(Date.now() - 1) } });
  assert.equal(await sessionActor(session.token), null);
  const fresh = (await authenticateAdmin("admin@example.test", password))!;
  await revokeSession(fresh.token);
  assert.equal(await sessionActor(fresh.token), null);
  await db.user.create({ data: { id: "second-admin", name: "Second admin", email: "second@example.test" } });
  await db.adminCredential.create({ data: { userId: "second-admin", passwordHash: await hashPassword(password) } });
  const second = (await authenticateAdmin("second@example.test", password))!;
  setSessionToken(second.token);
  const { id } = await createLicense(fixture);
  await revealLicenseKey(id);
  assert.equal((await db.auditLog.findFirstOrThrow({ where: { licenseId: id, action: "KEY_REVEALED" } })).userId, "second-admin");
  await deleteLicense(id, 1);
  await db.adminCredential.delete({ where: { userId: "second-admin" } });
  assert.equal(await sessionActor(second.token), null);
});

test("login attempts are bounded across accounts and reset after the window", async () => {
  for (let i = 0; i < 10; i++) assert.equal(await authenticateAdmin(`missing-${i}@example.test`, ""), null);
  assert.equal(await authenticateAdmin("admin@example.test", password), null);
  await db.loginThrottle.update({ where: { id: "admin-login" }, data: { startedAt: new Date(Date.now() - 16 * 60 * 1000) } });
  assert.ok(await authenticateAdmin("admin@example.test", password));
});

test("session cookies require HTTPS for network deployments", () => {
  const original = process.env.APP_URL;
  try {
    process.env.APP_URL = "https://licenses.example.test";
    assert.equal(sessionCookie().name, "__Host-license-session");
    assert.deepEqual(sessionCookie().options, { httpOnly: true, secure: true, sameSite: "strict", path: "/" });
    process.env.APP_URL = "http://licenses.example.test";
    assert.throws(sessionCookie, /HTTPS/);
  } finally {
    if (original === undefined) delete process.env.APP_URL; else process.env.APP_URL = original;
  }
});

test("local provisioning creates private credentials and reset revokes old passwords and sessions", async () => {
  const directory = mkdtempSync(join(tmpdir(), "license-manager-auth-test-"));
  const credentials = join(directory, ".admin-credentials");
  const provision = () => spawnSync(process.execPath, [
    "--conditions=react-server", "--import", import.meta.resolve("tsx"),
    fileURLToPath(new URL("../scripts/setup-admin.ts", import.meta.url)), "cli-admin@example.test",
  ], { cwd: directory, env: { ...process.env, TSX_TSCONFIG_PATH: fileURLToPath(new URL("../tsconfig.json", import.meta.url)) }, encoding: "utf8" });
  try {
    const first = provision();
    assert.equal(first.status, 0, first.stderr);
    const oldPassword = readFileSync(credentials, "utf8").split("Password: ")[1].trim();
    assert.equal(statSync(credentials).mode & 0o777, 0o600);
    assert.equal(first.stdout.includes(oldPassword), false);
    const session = (await authenticateAdmin("cli-admin@example.test", oldPassword))!;
    assert.ok(session);
    assert.notEqual(provision().status, 0, "Existing credentials must not be overwritten");
    unlinkSync(credentials);
    const reset = provision();
    assert.equal(reset.status, 0, reset.stderr);
    assert.equal(await sessionActor(session.token), null);
    assert.equal(await authenticateAdmin("cli-admin@example.test", oldPassword), null);
    const newPassword = readFileSync(credentials, "utf8").split("Password: ")[1].trim();
    assert.ok(await authenticateAdmin("cli-admin@example.test", newPassword));
  } finally {
    const user = await db.user.findUnique({ where: { email: "cli-admin@example.test" } });
    if (user) await db.user.delete({ where: { id: user.id } });
    rmSync(directory, { recursive: true, force: true });
  }
});

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

test("CSV preview is read-only and hides keys; import encrypts, audits, and rejects retries", async () => {
  const key = "CSV-SECRET-MUST-NOT-LEAK-76543";
  const source = csvFixture([{ product_name: "CSV protected agreement", license_key: key, notes: 'A comma, a "quote"\nand a newline', vendor: "TEST VENDOR", owner_email: "ADMIN@EXAMPLE.TEST" }, { product_name: "CSV untracked agreement", seat_tracking: "false", currency: "usd", annual_cost: "0.29" }]);
  const beforeCount = await db.license.count();
  const beforeAudit = await db.auditLog.count();
  const preview = await previewLicenseImport(source);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].keyStored, true);
  assert.equal(JSON.stringify(preview).includes(key), false);
  assert.equal(await db.license.count(), beforeCount);
  assert.equal(await db.auditLog.count(), beforeAudit);
  assert.deepEqual(await importLicenses(source), { count: 2 });
  const records = await db.license.findMany({ where: { productName: { startsWith: "CSV " } } });
  const protectedRecord = records.find(record => record.productName === "CSV protected agreement")!;
  assert.equal(decryptKey(protectedRecord.encryptedKey!), key);
  assert.equal(protectedRecord.annualCostMinor, 120050);
  assert.equal(protectedRecord.purchasedSeats, 1);
  assert.equal(protectedRecord.notes, 'A comma, a "quote"\nand a newline');
  assert.equal(records.find(record => record.productName === "CSV untracked agreement")!.annualCostMinor, 29);
  const audit = await db.auditLog.findMany({ where: { licenseId: { in: records.map(record => record.id) } } });
  assert.equal(audit.length, 2);
  assert.ok(audit.every(event => event.action === "CREATED" && event.userId === "admin"));
  assert.equal(JSON.stringify(audit).includes(key), false);
  assert.equal(JSON.stringify(audit).includes(protectedRecord.encryptedKey!), false);
  await assert.rejects(importLicenses(source), CsvImportError);
  assert.equal(await db.license.count(), beforeCount + 2);
  for (const record of records) await deleteLicense(record.id, 1);
});

test("CSV reports row errors and saves nothing when any row or relation is invalid", async () => {
  const beforeCount = await db.license.count();
  const beforeAudit = await db.auditLog.count();
  const invalid = csvFixture([{}, { product_name: "Bad agreement", vendor: "Unknown vendor", owner_email: "missing@example.test", expiration_date: "2026-02-30", purchased_seats: "2", assigned_seats: "3", annual_cost: "1,000.00", currency: "INVALID" }]);
  await assert.rejects(importLicenses(invalid), error => {
    assert.ok(error instanceof CsvImportError);
    for (const field of ["vendor", "owner_email", "expiration_date", "annual_cost", "currency"]) assert.ok(error.issues.some(issue => issue.row === 3 && issue.field === field), field);
    return true;
  });
  await assert.rejects(importLicenses(csvFixture([{ purchased_seats: "2", assigned_seats: "3" }])), error => error instanceof CsvImportError && error.issues.some(issue => issue.field === "assigned_seats"));
  await assert.rejects(importLicenses(csvFixture([{}, {}])), CsvImportError);
  assert.equal(await db.license.count(), beforeCount);
  assert.equal(await db.auditLog.count(), beforeAudit);
});

test("CSV import rolls back earlier rows and audit entries on a later write failure", async () => {
  const beforeCount = await db.license.count();
  const beforeAudit = await db.auditLog.count();
  const original = process.env.LICENSE_ENCRYPTION_KEY;
  try {
    process.env.LICENSE_ENCRYPTION_KEY = "invalid";
    await assert.rejects(importLicenses(csvFixture([{ product_name: "First row without a key" }, { product_name: "Later row with a key", license_key: "SYNTHETIC-KEY" }])), /LICENSE_ENCRYPTION_KEY/);
  } finally { process.env.LICENSE_ENCRYPTION_KEY = original; }
  assert.equal(await db.license.count(), beforeCount);
  assert.equal(await db.auditLog.count(), beforeAudit);
});

test("CSV commit rechecks changed directory entries and concurrent duplicate submissions", async () => {
  const vendor = await db.vendor.create({ data: { name: "Temporary CSV vendor" } });
  const source = csvFixture([{ vendor: vendor.name }]);
  await previewLicenseImport(source);
  await db.vendor.delete({ where: { id: vendor.id } });
  await assert.rejects(importLicenses(source), CsvImportError);
  const duplicate = csvFixture([{ product_name: "Concurrent CSV agreement" }]);
  const results = await Promise.allSettled([importLicenses(duplicate), importLicenses(duplicate)]);
  assert.equal(results.filter(result => result.status === "fulfilled").length, 1);
  const records = await db.license.findMany({ where: { productName: "Concurrent CSV agreement" } });
  assert.equal(records.length, 1);
  await deleteLicense(records[0].id, 1);
});

test("anonymous callers cannot preview or commit CSV imports", async () => {
  setSessionToken(undefined);
  await assert.rejects(previewLicenseImport(csvFixture([{}])), /NEXT_REDIRECT/);
  await assert.rejects(importLicenses(csvFixture([{}])), /NEXT_REDIRECT/);
});

test("Microsoft products preview and import persist mapped quantities and distinct subscription IDs", async () => {
  const source = 'Product name,Purchased quantity,Assigned licenses,Subscription ID,Subscription status,Renewal or expiration date,Purchase date,Unit price\nMicrosoft export test,10,4,ms-sub-one,Active,31/12/2028,12/11/2026,999\nMicrosoft export test,20,8,ms-sub-two,Active,31/12/2028,12/11/2026,999\n';
  const config = { mapping: inspectLicenseCsv(source).mapping, defaults: { vendor: "Test vendor", department: "Test department", owner_email: "admin@example.test", license_type: "Subscription", start_date: "2026-11-12", annual_cost: "1200.50", currency: "EUR" }, dateOrder: "DMY" };
  const count = await db.license.count();
  const preview = await previewLicenseImport(source, config);
  assert.equal(preview.rows.length, 2);
  assert.equal(preview.rows[0].purchasedSeats, 10);
  assert.equal(preview.rows[0].annualCostMinor, 120050);
  assert.equal(await db.license.count(), count);
  await assert.rejects(importLicenses(source, { ...config, defaults: { ...config.defaults, annual_cost: "" } }), CsvImportError);
  assert.equal(await db.license.count(), count);
  assert.deepEqual(await importLicenses(source, config), { count: 2 });
  const records = await db.license.findMany({ where: { productName: "Microsoft export test" }, orderBy: { contractNumber: "asc" } });
  assert.deepEqual(records.map(record => record.contractNumber), ["ms-sub-one", "ms-sub-two"]);
  assert.deepEqual(records.map(record => [record.purchasedSeats, record.assignedSeats]), [[10, 4], [20, 8]]);
  assert.equal(records[0].purchaseDate, "2026-11-12");
  assert.equal(records[0].expirationDate, "2028-12-31");
  await assert.rejects(importLicenses(source, config), CsvImportError);
  for (const record of records) await deleteLicense(record.id, 1);
  setSessionToken(undefined);
  await assert.rejects(previewLicenseImport(source, config), /NEXT_REDIRECT/);
  await assert.rejects(importLicenses(source, config), /NEXT_REDIRECT/);
});


test("dedicated seven-column Microsoft import upserts, preserves manual fields, validates and rolls back", async () => {
  const { MICROSOFT_COLUMNS, previewMicrosoftImport, saveMicrosoftImport } = await import("../src/services/microsoft-import");
  const options = { departmentId: "dept", dateOrder: "ISO" as const };
  const source = (name: string, assigned = "4", purchased = "10", status = "Active", profile = "Corporate", date = "2028-12-31") => MICROSOFT_COLUMNS.join(",") + "," + Array.from({length: 120}, (_, i) => `Ignored ${i}`).join(",") + "\n" + [name, assigned, purchased, "6", status, date, profile, ...Array(120).fill("ignored")].join(",") + "\n";
  const csv = source("MS dedicated product");
  const first = await previewMicrosoftImport(csv, options);
  assert.deepEqual([first.total, first.created, first.updated, first.invalid], [1, 1, 0, 0]);
  const microsoftExport = csv.replace("Product name", "Product name (includes custom names)");
  assert.deepEqual(await previewMicrosoftImport(microsoftExport, options), first);
  await assert.rejects(previewMicrosoftImport(csv.replace("Product name,", "Product name,Product name (includes custom names),").replace("MS dedicated product,", "MS dedicated product,Conflicting product,"), options), /Correct the CSV errors/);
  assert.equal(await db.license.count({ where: { productName: "MS dedicated product" } }), 0);
  await saveMicrosoftImport(microsoftExport, options, first.token);
  const record = await db.license.findFirstOrThrow({ where: { productName: "MS dedicated product" } });
  await db.license.update({ where: { id: record.id }, data: { departmentId: "dept", responsibleUserId: "admin", notes: "Manual notes", annualCostMinor: 123456, supplier: "Manual supplier", contractNumber: "Manual contract", renewalDate: "2029-01-01" } });
  const second = await previewMicrosoftImport(csv, options);
  assert.deepEqual([second.created, second.updated], [0, 1]);
  await saveMicrosoftImport(csv, options, second.token);
  assert.equal(await db.license.count({ where: { productName: "MS dedicated product" } }), 1);
  const changed = source("ms dedicated product", "8", "12");
  const next = await previewMicrosoftImport(changed, options);
  await saveMicrosoftImport(changed, options, next.token);
  const after = await db.license.findUniqueOrThrow({ where: { id: record.id } });
  assert.deepEqual([after.assignedSeats, after.purchasedSeats, after.microsoftAvailableSeats], [8, 12, 6]);
  assert.deepEqual([after.notes, after.annualCostMinor, after.supplier, after.contractNumber, after.renewalDate, after.departmentId, after.responsibleUserId], ["Manual notes", 123456, "Manual supplier", "Manual contract", "2029-01-01", "dept", "admin"]);
  assert.equal(after.microsoftBillingProfile, "Corporate");
  const blank = source("MS dedicated product", "", "", "", "", "");
  const blankPreview = await previewMicrosoftImport(blank, options);
  await saveMicrosoftImport(blank, options, blankPreview.token);
  assert.equal((await db.license.findUniqueOrThrow({where:{id:record.id}})).microsoftSubscriptionStatus, "Active");
  const invalid = source("Bad MS product", "invalid", "1");
  const bad = await previewMicrosoftImport(invalid, options);
  assert.equal(bad.invalid, 1);
  await assert.rejects(saveMicrosoftImport(invalid, options, bad.token));
  await assert.rejects(previewMicrosoftImport("Product name\nMissing columns\n", options));
  await assert.rejects(saveMicrosoftImport(csv, options, "forged-preview"));
  const two = source("Rollback first") + source("Rollback second").split("\n")[1] + "\n";
  const rollbackPreview = await previewMicrosoftImport(two, options);
  await db.$executeRawUnsafe(`CREATE TRIGGER fail_ms_import BEFORE INSERT ON License WHEN NEW.productName = 'Rollback second' BEGIN SELECT RAISE(ABORT, 'test failure'); END`);
  try { await assert.rejects(saveMicrosoftImport(two, options, rollbackPreview.token)); }
  finally { await db.$executeRawUnsafe("DROP TRIGGER fail_ms_import"); }
  assert.equal(await db.license.count({ where: { productName: { startsWith: "Rollback" } } }), 0);
  const audits = await db.auditLog.findMany({ where: {licenseId: record.id} });
  assert.ok(audits.some(event => event.action === "MICROSOFT_CREATED"));
  assert.ok(audits.some(event => event.action === "MICROSOFT_UPDATED"));
  assert.equal(await db.auditLog.count({ where: { productName: "Rollback first" } }), 0);
  setSessionToken(undefined);
  await assert.rejects(previewMicrosoftImport(csv, options), /NEXT_REDIRECT/);
});


test("Microsoft import saves only selected preview rows and rejects invalid selections", async () => {
  const { MICROSOFT_COLUMNS, previewMicrosoftImport, saveMicrosoftImport } = await import("../src/services/microsoft-import");
  const options = { dateOrder: "ISO" as const };
  const csv = MICROSOFT_COLUMNS.join(",") + "\nSelected license,1,5,4,Active,,Corporate\nSkipped license,2,5,3,Active,,Corporate\nInvalid license,bad,5,3,Active,,Corporate\n";
  const preview = await previewMicrosoftImport(csv, options);
  assert.equal(preview.invalid, 1);
  for (const selection of [[], [999], [2, 2], [2.5], [4], [2, 4]]) {
    await assert.rejects(saveMicrosoftImport(csv, options, preview.token, selection));
  }
  assert.equal(await db.license.count({ where: { productName: "Selected license" } }), 0);
  assert.deepEqual(await saveMicrosoftImport(csv, options, preview.token, [2]), { created: 1, updated: 0 });
  assert.equal(await db.license.count({ where: { productName: { in: ["Skipped license", "Invalid license"] } } }), 0);
  assert.equal(await db.auditLog.count({ where: { productName: { in: ["Skipped license", "Invalid license"] } } }), 0);
  await assert.rejects(saveMicrosoftImport(csv, options, preview.token, [3]), /data changed/);
  const next = await previewMicrosoftImport(csv, options);
  assert.deepEqual(await saveMicrosoftImport(csv, options, next.token, [2, 3]), { created: 1, updated: 1 });
  assert.equal(await db.license.count({ where: { productName: "Selected license" } }), 1);
});

test("downloadable Microsoft template imports and repeat import updates the same product", async () => {
  const { licenseCsvTemplate } = await import("../src/lib/microsoft-csv");
  const { readCsv } = await import("../src/lib/license-csv");
  const { previewMicrosoftImport, saveMicrosoftImport } = await import("../src/services/microsoft-import");
  const source = licenseCsvTemplate();
  const name = readCsv(source).rows[0].cells[0];
  const options = { departmentId: "dept", dateOrder: "ISO" as const };
  const first = await previewMicrosoftImport(source, options);
  assert.equal(first.invalid, 0);
  await saveMicrosoftImport(source, options, first.token);
  const second = await previewMicrosoftImport(source, options);
  assert.deepEqual([second.created, second.updated], [0, 1]);
  await saveMicrosoftImport(source, options, second.token);
  const records = await db.license.findMany({ where: { productName: name } });
  assert.equal(records.length, 1);
  assert.equal(records[0].microsoftBillingProfile, "EXAMPLE ONLY - Fictional billing profile");
});

test("Microsoft seven-column CSV permits empty quantities, dates, and all manual fields", async () => {
  const { MICROSOFT_COLUMNS, previewMicrosoftImport, saveMicrosoftImport } = await import("../src/services/microsoft-import");
  const { parseMicrosoftDate } = await import("../src/lib/microsoft-date");
  const options = { dateOrder: "ISO" as const };
  const csv = MICROSOFT_COLUMNS.join(",") + "\nMicrosoft null fields,,,,Disabled,,Billing A\n";
  const preview = await previewMicrosoftImport(csv, options);
  assert.equal(preview.invalid, 0);
  await saveMicrosoftImport(csv, options, preview.token);
  const record = await db.license.findFirstOrThrow({ where: { productName: "Microsoft null fields" } });
  for (const field of ["purchasedSeats", "assignedSeats", "microsoftAvailableSeats", "expirationDate", "purchaseDate", "startDate", "annualCostMinor", "departmentId", "responsibleUserId"] as const) assert.equal(record[field], null, field);
  assert.equal(record.source, "MICROSOFT_CSV");
  assert.ok(record.lastImportedAt);
  assert.equal(record.microsoftSubscriptionStatus, "Disabled");
  assert.equal((await getLicense(record.id))?.status, "Unknown");
  await statistics();
  await generateNotifications();
  assert.equal(await db.notification.count({where:{licenseId:record.id}}), 0);
  const again = await previewMicrosoftImport(csv, options);
  await saveMicrosoftImport(csv, options, again.token);
  assert.equal(await db.license.count({where:{ productName: record.productName }}), 1);
  for (const [value, order, expected] of [
    ["", "ISO", null], ["2028-12-31", "ISO", "2028-12-31"],
    ["31/12/2028 12:30 PM", "ISO", "2028-12-31"],
    ["12/31/2028 12:30:00 AM", "ISO", "2028-12-31"],
    ["11/12/2028", "DMY", "2028-12-11"], ["11/12/2028", "MDY", "2028-11-12"],
    ["2028-12-31T23:00:00Z", "ISO", "2028-12-31"],
    ["2028-12-31 23:00:00", "ISO", "2028-12-31"],
  ] as const) assert.equal(parseMicrosoftDate(value, order), expected);
  assert.throws(() => parseMicrosoftDate("11/12/2028", "ISO"), /Ambiguous/);
  assert.throws(() => parseMicrosoftDate("31/02/2028", "DMY"), /Invalid/);
  const bad = await previewMicrosoftImport(MICROSOFT_COLUMNS.join(",") + "\nInvalid MS,not-a-number,,,Active,,\n", options);
  assert.equal(bad.invalid, 1);
  await assert.rejects(saveMicrosoftImport(MICROSOFT_COLUMNS.join(",") + "\nInvalid MS,not-a-number,,,Active,,\n", options, bad.token));
  const zero = await previewMicrosoftImport(MICROSOFT_COLUMNS.join(",") + "\nZero MS,0,0,0,Expired,,\n", options);
  assert.equal(zero.invalid, 0);
});

test("nullable migration preserves existing license values and linked audit and notification records", async () => {
  const { default: Database } = await import("better-sqlite3");
  const { readdirSync } = await import("node:fs");
  const database = new Database(":memory:");
  const root = fileURLToPath(new URL("../prisma/migrations/", import.meta.url));
  const names = readdirSync(root).filter(name => /^\d/.test(name)).sort();
  try {
    for (const name of names.filter(name => name !== "20261112180000_nullable_microsoft")) database.exec(readFileSync(join(root, name, "migration.sql"), "utf8"));
    database.exec(`PRAGMA foreign_keys=ON;
      INSERT INTO Vendor (id,name) VALUES ('v','Microsoft');
      INSERT INTO Department (id,name) VALUES ('d','Department');
      INSERT INTO User (id,name,email) VALUES ('u','Owner','owner@test.invalid');
      INSERT INTO License (id,productName,vendorId,licenseType,purchaseDate,startDate,expirationDate,annualCostMinor,departmentId,responsibleUserId,updatedAt,notes) VALUES ('l','Existing','v','Subscription','2026-01-01','2026-01-01','2028-01-01',12345,'d','u',CURRENT_TIMESTAMP,'Keep me');
      INSERT INTO AuditLog (id,licenseId,productName,action,userId) VALUES ('a','l','Existing','CREATED','u');
      INSERT INTO Notification (id,licenseId,userId,productName,message,threshold,expirationDate,dedupeKey) VALUES ('n','l','u','Existing','Keep notification',7,'2028-01-01','dedupe');`);
    const before = database.prepare("SELECT * FROM License").get();
    database.exec(readFileSync(join(root, "20261112180000_nullable_microsoft/migration.sql"), "utf8"));
    const after = database.prepare("SELECT * FROM License").get() as Record<string, unknown>;
    assert.deepEqual(after, { ...(before as object), source: null, lastImportedAt: null });
    assert.equal((database.prepare("SELECT licenseId FROM AuditLog").get() as {licenseId:string}).licenseId, "l");
    assert.equal((database.prepare("SELECT licenseId FROM Notification").get() as {licenseId:string}).licenseId, "l");
    assert.deepEqual(database.pragma("foreign_key_check"), []);
  } finally { database.close(); }
});

async function importedNullableLicense(productName: string) {
  const { MICROSOFT_COLUMNS, previewMicrosoftImport, saveMicrosoftImport } = await import("../src/services/microsoft-import");
  const source = MICROSOFT_COLUMNS.join(",") + `\n${productName},,,,Disabled,,Billing A\n`;
  const options = { dateOrder: "ISO" as const };
  const preview = await previewMicrosoftImport(source, options);
  await saveMicrosoftImport(source, options, preview.token);
  return db.license.findFirstOrThrow({ where: { productName } });
}

test("notes-only edit of a nullable Microsoft license preserves every untouched database value", async () => {
  const before = await importedNullableLicense("Nullable notes regression");
  await updateLicense(before.id, before.version, { notes: "Administrator note" });
  const after = await db.license.findUniqueOrThrow({ where: { id: before.id } });
  assert.deepEqual({ ...after, notes: before.notes, version: before.version, updatedAt: before.updatedAt }, before);
  assert.equal(after.notes, "Administrator note");
  const events = await db.auditLog.findMany({ where: { licenseId: before.id } });
  assert.equal(events.filter(event => event.action === "EDITED").length, 1);
  assert.equal(events.some(event => ["COST_CHANGED", "SEATS_CHANGED", "EXPIRATION_CHANGED"].includes(event.action)), false);
  await deleteLicense(before.id, after.version);
});

test("null annual cost stays null when editing department and responsible person", async () => {
  const before = await importedNullableLicense("Nullable cost regression");
  await updateLicense(before.id, before.version, { departmentId: "dept", responsibleUserId: "admin" });
  const after = await db.license.findUniqueOrThrow({ where: { id: before.id } });
  assert.equal(after.annualCostMinor, null);
  assert.equal(after.departmentId, "dept");
  assert.equal(after.responsibleUserId, "admin");
  await deleteLicense(before.id, after.version);
});

test("null quantities stay null with tracking enabled or disabled and utilization stays unknown", async () => {
  const before = await importedNullableLicense("Nullable seats regression");
  for (const seatTracking of [true, false]) {
    const current = await db.license.findUniqueOrThrow({ where: { id: before.id } });
    await updateLicense(before.id, current.version, { notes: "Seat quantities unknown", seatTracking });
    const after = await getLicense(before.id);
    assert.equal(after?.purchasedSeats, null);
    assert.equal(after?.assignedSeats, null);
    assert.equal(after?.microsoftAvailableSeats, null);
    assert.equal(after?.usage, null);
  }
  await deleteLicense(before.id, 3);
});

test("nullable dates stay null when an imported license is edited through the full form schema", async () => {
  const { licenseEditSchema } = await import("../src/lib/validation/license");
  const before = await importedNullableLicense("Nullable dates regression");
  const form = licenseEditSchema.parse({ ...before, purchaseDate: "", startDate: "", expirationDate: "", renewalDate: "", departmentId: "", responsibleUserId: "", notes: "Full form edit" });
  await updateLicense(before.id, before.version, form);
  const after = await db.license.findUniqueOrThrow({ where: { id: before.id } });
  for (const name of ["purchaseDate", "startDate", "expirationDate", "renewalDate", "annualCostMinor", "purchasedSeats", "assignedSeats"] as const) assert.equal(after[name], null, name);
  await deleteLicense(before.id, after.version);
});

test("notes-only edit preserves existing known fields and the stored encrypted key", async () => {
  const { id } = await createLicense(fixture);
  const before = await db.license.findUniqueOrThrow({ where: { id } });
  await updateLicense(id, before.version, { notes: "Only notes changed" });
  const after = await db.license.findUniqueOrThrow({ where: { id } });
  assert.deepEqual({ ...after, notes: before.notes, version: before.version, updatedAt: before.updatedAt }, before);
  await deleteLicense(id, after.version);
});

test("edit relationships validate merged known values and skip missing counterparts", async () => {
  const before = await importedNullableLicense("Nullable relationships regression");
  await updateLicense(before.id, 1, { assignedSeats: 20, expirationDate: "2027-01-01" });
  await assert.rejects(updateLicense(before.id, 2, { purchasedSeats: 10 }), /Assigned seats cannot exceed/);
  await assert.rejects(updateLicense(before.id, 2, { startDate: "2028-01-01" }), /Expiration must be/);
  await updateLicense(before.id, 2, { purchasedSeats: 20, startDate: "2027-01-01" });
  await assert.rejects(updateLicense(before.id, 3, { purchasedSeats: 0 }), /Purchase at least one seat/);
  await assert.rejects(updateLicense(before.id, 3, { seatTracking: false }), /Set seat counts to zero/);
  await assert.rejects(updateLicense(before.id, 3, { assignedSeats: -1 }));
  await assert.rejects(updateLicense(before.id, 3, { annualCostMinor: -1 }));
  await assert.rejects(updateLicense(before.id, 3, { purchaseDate: "2027-02-30" }));
  assert.equal((await getLicense(before.id))?.version, 3);
  await deleteLicense(before.id, 3);
});
