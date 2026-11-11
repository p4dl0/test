import "server-only";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/actor";
import { encryptKey, decryptKey } from "@/lib/security/keys";
import { licenseSchema } from "@/lib/validation/license";
import { addDays, daysRemaining, licenseStatus, todayInTimezone, utilization } from "@/lib/calculations";
import type { License, Prisma } from "@/generated/prisma/client";

export async function getSettings() {
  return db.appSettings.findUniqueOrThrow({ where: { id: "organization" } });
}
export async function organizationToday() { return todayInTimezone((await getSettings()).timezone); }

function snapshot(license: License): Prisma.InputJsonObject {
  const { encryptedKey: _key, keySuffix: _suffix, createdAt, updatedAt, ...safe } = license;
  void _key; void _suffix;
  return { ...safe, createdAt: createdAt.toISOString(), updatedAt: updatedAt.toISOString() };
}

export async function createLicense(input: unknown) {
  const data = licenseSchema.parse(input);
  const actor = await currentActor();
  const { licenseKey, clearKey: _clear, ...fields } = data;
  void _clear;
  return db.$transaction(async tx => {
    const license = await tx.license.create({ data: { ...fields, encryptedKey: licenseKey ? encryptKey(licenseKey) : null, keySuffix: licenseKey ? licenseKey.slice(-5).padStart(5, "X") : null } });
    await tx.auditLog.create({ data: { licenseId: license.id, productName: license.productName, action: "CREATED", userId: actor.id, newValue: snapshot(license) } });
    return { id: license.id };
  });
}

export async function updateLicense(id: string, expectedVersion: number, input: unknown) {
  const data = licenseSchema.parse(input);
  const actor = await currentActor();
  const { licenseKey, clearKey, ...fields } = data;
  return db.$transaction(async tx => {
    const before = await tx.license.findUniqueOrThrow({ where: { id } });
    if (before.version !== expectedVersion) throw new Error("This license changed while you were editing. Reload and try again.");
    const keyData = clearKey ? { encryptedKey: null, keySuffix: null } : licenseKey ? { encryptedKey: encryptKey(licenseKey), keySuffix: licenseKey.slice(-5).padStart(5, "X") } : {};
    const after = await tx.license.update({ where: { id, version: expectedVersion }, data: { ...fields, ...keyData, version: { increment: 1 } } });
    const events = [{ action: "EDITED", previousValue: snapshot(before), newValue: snapshot(after) }];
    if (before.expirationDate !== after.expirationDate) events.push({ action: "EXPIRATION_CHANGED", previousValue: { expirationDate: before.expirationDate }, newValue: { expirationDate: after.expirationDate } });
    if (before.purchasedSeats !== after.purchasedSeats || before.assignedSeats !== after.assignedSeats || before.seatTracking !== after.seatTracking) events.push({ action: "SEATS_CHANGED", previousValue: { purchasedSeats: before.purchasedSeats, assignedSeats: before.assignedSeats, seatTracking: before.seatTracking }, newValue: { purchasedSeats: after.purchasedSeats, assignedSeats: after.assignedSeats, seatTracking: after.seatTracking } });
    if (before.annualCostMinor !== after.annualCostMinor || before.currency !== after.currency) events.push({ action: "COST_CHANGED", previousValue: { annualCostMinor: before.annualCostMinor, currency: before.currency }, newValue: { annualCostMinor: after.annualCostMinor, currency: after.currency } });
    if (clearKey || licenseKey) events.push({ action: "KEY_CHANGED", previousValue: { keyStored: Boolean(before.encryptedKey) }, newValue: { keyStored: Boolean(after.encryptedKey) } });
    await tx.auditLog.createMany({ data: events.map(event => ({ ...event, licenseId: id, productName: after.productName, userId: actor.id })) });
    // Old renewal-cycle reminders remain in history, but no longer count as unread.
    if (before.expirationDate !== after.expirationDate) await tx.notification.updateMany({ where: { licenseId: id, readAt: null }, data: { readAt: new Date() } });
    return { id: after.id };
  });
}

export async function deleteLicense(id: string, expectedVersion: number) {
  const actor = await currentActor();
  await db.$transaction(async tx => {
    const license = await tx.license.findUniqueOrThrow({ where: { id } });
    if (license.version !== expectedVersion) throw new Error("This license changed. Reload before deleting.");
    await tx.auditLog.create({ data: { licenseId: id, productName: license.productName, action: "DELETED", userId: actor.id, previousValue: snapshot(license) } });
    await tx.notification.updateMany({ where: { licenseId: id, readAt: null }, data: { readAt: new Date() } });
    await tx.license.delete({ where: { id, version: expectedVersion } });
  });
}

export async function revealLicenseKey(id: string) {
  const actor = await currentActor();
  return db.$transaction(async tx => {
    const license = await tx.license.findUniqueOrThrow({ where: { id } });
    const key = license.encryptedKey ? decryptKey(license.encryptedKey) : null;
    if (key) await tx.auditLog.create({ data: { licenseId: id, productName: license.productName, action: "KEY_REVEALED", userId: actor.id } });
    return key;
  });
}

const relations = { vendor: true, department: true, responsibleUser: true } as const;
const safeOmit = { encryptedKey: true } as const;
export async function getLicense(id: string) {
  const license = await db.license.findUnique({ where: { id }, include: relations, omit: safeOmit });
  if (!license) return null;
  const days = daysRemaining(license.expirationDate, await organizationToday());
  return { ...license, days, status: licenseStatus(days), usage: utilization(license.purchasedSeats, license.assignedSeats, license.seatTracking) };
}
export type LicenseView = NonNullable<Awaited<ReturnType<typeof getLicense>>>;

export async function duplicateLicense(id: string) {
  const original = await getLicense(id);
  if (!original) throw new Error("License not found");
  return { ...original, id: undefined, productName: `${original.productName} (copy)`, keySuffix: null, contractNumber: "", assignedSeats: 0 };
}

export type LicenseFilters = Record<string, string | undefined>;
export function licenseWhere(filters: LicenseFilters, today: string): Prisma.LicenseWhereInput {
  const AND: Prisma.LicenseWhereInput[] = [];
  if (filters.q) AND.push({ OR: [...["productName", "supplier", "contractNumber", "notes", "id"].map(field => ({ [field]: { contains: filters.q!.slice(0, 200) } })),
    { vendor: { name: { contains: filters.q.slice(0, 200) } } },
    { department: { name: { contains: filters.q.slice(0, 200) } } },
    { responsibleUser: { name: { contains: filters.q.slice(0, 200) } } },
  ] });
  if (filters.vendor) AND.push({ vendorId: filters.vendor });
  if (filters.department) AND.push({ departmentId: filters.department });
  if (filters.owner) AND.push({ responsibleUserId: filters.owner });
  if (filters.type) AND.push({ licenseType: filters.type });
  const dateConditions: Record<string, Prisma.StringFilter> = {
    Active: { gt: addDays(today, 60) },
    "Expiring Soon": { gte: addDays(today, 31), lte: addDays(today, 60) },
    Expiring: { gte: today, lte: addDays(today, 30) },
    Expired: { lt: today },
  };
  if (filters.status && dateConditions[filters.status]) AND.push({ expirationDate: dateConditions[filters.status] });
  if (filters.period === "expired") AND.push({ expirationDate: { lt: today } });
  else if (["7", "30", "60", "90"].includes(filters.period ?? "")) AND.push({ expirationDate: { gte: today, lte: addDays(today, Number(filters.period)) } });
  else if (filters.period === "later") AND.push({ expirationDate: { gt: addDays(today, 90) } });
  return { AND };
}

export async function listLicenses(filters: LicenseFilters = {}, paginate = true) {
  const today = await organizationToday();
  const where = licenseWhere(filters, today);
  const sort = filters.sort ?? "productName";
  const direction = filters.direction === "desc" ? "desc" : "asc";
  const sorts: Record<string, Prisma.LicenseOrderByWithRelationInput> = {
    productName: { productName: direction }, vendor: { vendor: { name: direction } },
    department: { department: { name: direction } }, expirationDate: { expirationDate: direction },
    annualCostMinor: { annualCostMinor: direction }, purchasedSeats: { purchasedSeats: direction }, assignedSeats: { assignedSeats: direction },
  };
  const total = await db.license.count({ where });
  const pageSize = 10;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(pages, Math.max(1, Math.trunc(Number(filters.page)) || 1));
  const licenses = await db.license.findMany({ where, include: relations, omit: safeOmit, orderBy: [sorts[sort] ?? sorts.productName, { id: "asc" }], ...(paginate ? { skip: (page - 1) * pageSize, take: pageSize } : {}) });
  return { licenses: licenses.map(license => {
    const days = daysRemaining(license.expirationDate, today);
    return { ...license, days, status: licenseStatus(days), usage: utilization(license.purchasedSeats, license.assignedSeats, license.seatTracking) };
  }), total, page, pages, pageSize };
}

export async function lookups() {
  const [vendors, departments, users] = await Promise.all([
    db.vendor.findMany({ orderBy: { name: "asc" } }), db.department.findMany({ orderBy: { name: "asc" } }), db.user.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { vendors, departments, users };
}
