import "server-only";
import { parseMicrosoftDate } from "@/lib/microsoft-date";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/actor";
import { CSV_MAX_ROWS, csvHeaderKey, readCsv, CsvImportError, type CsvIssue } from "@/lib/license-csv";
import type { Prisma } from "@/generated/prisma/client";

import { MICROSOFT_COLUMNS } from "@/lib/microsoft-csv";
export { MICROSOFT_COLUMNS } from "@/lib/microsoft-csv";
const key = (name: string) => name.trim().normalize("NFKC").toLowerCase();
export type MicrosoftRow = { row: number; productName: string; assigned: number | null; purchased: number | null; available: number | null; status: string | null; date: string | null; billingProfile: string | null; action: "create" | "update"; issues: string[] };
export type MicrosoftPreview = { rows: MicrosoftRow[]; total: number; created: number; updated: number; invalid: number; skipped: number; token: string };
export type MicrosoftOptions = { departmentId?: string; dateOrder: "ISO" | "DMY" | "MDY" };

async function prepare(source: string, options: MicrosoftOptions, tx: Prisma.TransactionClient): Promise<MicrosoftPreview> {
  if (!options || !["ISO", "DMY", "MDY"].includes(options.dateOrder)) throw new Error("Choose a valid date format.");
  const csv = readCsv(source, 1024, true);
  const headerKey = (header: string) => {
    const normalized = csvHeaderKey(header);
    // Microsoft includes this suffix in Billing → Your products exports.
    return normalized === csvHeaderKey("Product name (includes custom names)") ? csvHeaderKey("Product name") : normalized;
  };
  const headers = csv.headers.map(headerKey);
  const indexes = MICROSOFT_COLUMNS.map(column => headers.indexOf(csvHeaderKey(column)));
  for (const column of MICROSOFT_COLUMNS) if (headers.filter(header => header === csvHeaderKey(column)).length > 1) throw new CsvImportError([{ row: 1, field: column, message: "Required Microsoft column occurs more than once." }]);
  const missing = MICROSOFT_COLUMNS.filter((_, index) => indexes[index] < 0);
  if (missing.length) throw new CsvImportError(missing.map(field => ({ row: 1, field, message: "Required Microsoft column is missing." })));
  const existing = await tx.license.findMany({ where: { OR: [{ microsoftProductKey: { not: null } }, { vendor: { name: { equals: "Microsoft" } } }] }, select: { id: true, productName: true, microsoftProductKey: true, version: true, assignedSeats: true, purchasedSeats: true } });
  // Also support differently capitalized legacy Microsoft vendor names.
  const vendors = await tx.vendor.findMany({ select: { id: true, name: true } });
  const vendorIds = vendors.filter(v => key(v.name) === "microsoft").map(v => v.id);
  const legacy = await tx.license.findMany({ where: { vendorId: { in: vendorIds } }, select: { id: true, productName: true, microsoftProductKey: true, version: true, assignedSeats: true, purchasedSeats: true } });
  const candidates = [...new Map([...existing, ...legacy].map(item => [item.id, item])).values()];
  const seen = new Set<string>();
  const rows = csv.rows.map(({ row, cells }): MicrosoftRow => {
    // Only these seven cells are ever read; other source values are ignored.
    const [productName, assignedText, purchasedText, availableText, status, dateText, billingProfile] = indexes.map(index => cells[index]);
    const issues: string[] = [];
    const matches = candidates.filter(item => (item.microsoftProductKey ?? key(item.productName)) === key(productName));
    if (productName.length < 1 || productName.length > 160) issues.push("Product name must contain 1–160 characters.");
    if (matches.length > 1) issues.push("Multiple Microsoft licenses have this product name. Resolve them before import.");
    if (seen.has(key(productName))) issues.push("Duplicate product name in this file.");
    seen.add(key(productName));
    const integer = (value: string, field: string) => {
      if (!value) return null;
      const plain = /^\d{1,3}(,\d{3})+$/.test(value) ? value.replaceAll(",", "") : value;
      const number = Number(plain);
      if (!/^\d+$/.test(plain) || !Number.isSafeInteger(number) || number > 1_000_000) { issues.push(`${field} must be an integer between 0 and 1,000,000.`); return null; }
      return number;
    };
    const assigned = integer(assignedText, "Assigned licenses"), purchased = integer(purchasedText, "Purchased quantity"), available = integer(availableText, "Available licenses");
    if (status.length > 200 || billingProfile.length > 200) issues.push("Status and billing profile must be at most 200 characters.");
    let date: string | null = null;
    try { date = parseMicrosoftDate(dateText, options.dateOrder); }
    catch (error) { issues.push(error instanceof Error ? error.message : "Invalid renewal/expiration date."); }
    return { row, productName, assigned, purchased, available, status: status || null, date, billingProfile: billingProfile || null, action: matches.length ? "update" : "create", issues };
  });
  const invalid = rows.filter(row => row.issues.length).length;
  // Optimistic preview binding includes matching records and versions, not ignored CSV cells.
  const token = createHash("sha256").update(JSON.stringify({ rows, options, versions: candidates.map(item => [item.id, item.version]).sort() })).digest("hex");
  return { rows, total: rows.length + csv.skippedRows, created: rows.filter(row => row.action === "create").length, updated: rows.filter(row => row.action === "update").length, invalid, skipped: csv.skippedRows, token };
}

export async function previewMicrosoftImport(source: string, options: MicrosoftOptions) {
  await currentActor();
  return prepare(source, options, db);
}

export async function saveMicrosoftImport(source: string, options: MicrosoftOptions, token: string, selectedRows?: number[]) {
  const actor = await currentActor();
  return db.$transaction(async tx => {
    const preview = await prepare(source, options, tx);
    if (token !== preview.token) throw new Error("The data changed after preview. Preview again before importing.");
    if (selectedRows !== undefined && (!Array.isArray(selectedRows) || !selectedRows.length || selectedRows.length > CSV_MAX_ROWS || selectedRows.some(row => !Number.isInteger(row) || !preview.rows.some(item => item.row === row)) || new Set(selectedRows).size !== selectedRows.length)) throw new Error("Select at least one valid preview row before saving.");
    const rows = selectedRows === undefined ? preview.rows : preview.rows.filter(row => selectedRows.includes(row.row));
    if (rows.some(row => row.issues.length)) throw new CsvImportError(rows.flatMap(row => row.issues.map(message => ({ row: row.row, field: "Microsoft import", message } satisfies CsvIssue))));
    let vendor = (await tx.vendor.findMany()).find(item => key(item.name) === "microsoft");
    if (!vendor) vendor = await tx.vendor.create({ data: { name: "Microsoft" } });
    const microsoftVendorIds = (await tx.vendor.findMany()).filter(item => key(item.name) === "microsoft").map(item => item.id);
    for (const row of rows) {
      const candidates = await tx.license.findMany({ where: { OR: [{ microsoftProductKey: key(row.productName) }, { vendorId: { in: microsoftVendorIds } }] } });
      const before = candidates.find(item => (item.microsoftProductKey ?? key(item.productName)) === key(row.productName));
      const fields = {
        source: "MICROSOFT_CSV", lastImportedAt: new Date(), productName: row.productName, microsoftProductKey: key(row.productName),
        ...(row.assigned !== null ? { assignedSeats: row.assigned } : {}),
        ...(row.purchased !== null ? { purchasedSeats: row.purchased } : {}),
        ...(row.available !== null ? { microsoftAvailableSeats: row.available } : {}),
        ...(row.status !== null ? { microsoftSubscriptionStatus: row.status } : {}),
        ...(row.billingProfile !== null ? { microsoftBillingProfile: row.billingProfile } : {}),
        ...(row.date !== null ? { expirationDate: row.date, microsoftRenewalDate: row.date } : {}),
      };
      const after = before ? await tx.license.update({ where: { id: before.id, version: before.version }, data: { ...fields, version: { increment: 1 } } }) : await tx.license.create({ data: { ...fields, vendorId: vendor.id, licenseType: "Subscription", departmentId: null, responsibleUserId: null, purchaseDate: null, startDate: null, annualCostMinor: null, purchasedSeats: row.purchased, assignedSeats: row.assigned, expirationDate: row.date } });
      const managed = (item: typeof after) => ({ productName: item.productName, assignedSeats: item.assignedSeats, purchasedSeats: item.purchasedSeats, available: item.microsoftAvailableSeats, status: item.microsoftSubscriptionStatus, renewalExpirationDate: item.microsoftRenewalDate, billingProfile: item.microsoftBillingProfile });
      await tx.auditLog.create({ data: { licenseId: after.id, productName: after.productName, userId: actor.id, action: before ? "MICROSOFT_UPDATED" : "MICROSOFT_CREATED", ...(before ? { previousValue: managed(before) } : {}), newValue: { ...managed(after), changedFields: Object.keys(managed(after)).filter(field => !before || JSON.stringify(managed(before)[field as keyof ReturnType<typeof managed>]) !== JSON.stringify(managed(after)[field as keyof ReturnType<typeof managed>])) } } });
    }
    return { created: rows.filter(row => row.action === "create").length, updated: rows.filter(row => row.action === "update").length };
  }, { timeout: 30_000 });
}
