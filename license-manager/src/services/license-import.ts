import "server-only";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/actor";
import { licenseSchema, type LicenseInput } from "@/lib/validation/license";
import { CURRENCIES, LICENSE_TYPES } from "@/lib/calculations";
import { CsvImportError, parseLicenseCsv, type CsvIssue, type ImportPreview } from "@/lib/license-csv";
import { insertLicense } from "@/services/licenses";
import type { Prisma } from "@/generated/prisma/client";

const normalize = (value: string) => value.trim().toLowerCase();
function identity(data: { productName: string; vendorId: string; departmentId: string; contractNumber: string }) {
  return JSON.stringify([normalize(data.productName), data.vendorId, data.departmentId, normalize(data.contractNumber)]);
}

async function prepare(source: string, client: Prisma.TransactionClient) {
  const rows = parseLicenseCsv(source);
  const [vendors, departments, users] = await Promise.all([
    client.vendor.findMany({ select: { id: true, name: true } }),
    client.department.findMany({ select: { id: true, name: true } }),
    client.user.findMany({ select: { id: true, email: true } }),
  ]);
  const issues: CsvIssue[] = [];
  const prepared: { row: number; data: LicenseInput; vendor: string; department: string; ownerEmail: string }[] = [];
  const seen = new Set<string>();
  for (const { row, values } of rows) {
    const issue = (field: string, message: string) => { issues.push({ row, field, message }); };
    const resolve = (records: { id: string; label: string }[], value: string | undefined, field: string) => {
      const matches = records.filter(record => normalize(record.label) === normalize(value ?? ""));
      if (matches.length !== 1) issue(field, matches.length ? "More than one directory entry matches this value. Rename the ambiguous entries first." : "No matching directory entry. Add it to the workspace or correct this value.");
      return matches[0];
    };
    const vendor = resolve(vendors.map(v => ({ id: v.id, label: v.name })), values.vendor, "vendor");
    const department = resolve(departments.map(d => ({ id: d.id, label: d.name })), values.department, "department");
    const owner = resolve(users.map(u => ({ id: u.id, label: u.email })), values.owner_email, "owner_email");
    const integer = (field: "purchased_seats" | "assigned_seats", fallback: number) => {
      const value = values[field];
      if (!value) return fallback;
      if (!/^\d+$/.test(value)) { issue(field, "Use a whole, non-negative number."); return NaN; }
      return Number(value);
    };
    const bool = (field: "seat_tracking" | "auto_renewal", fallback: boolean) => {
      const value = values[field]?.toLowerCase();
      if (!value) return fallback;
      if (["true", "yes", "1"].includes(value)) return true;
      if (["false", "no", "0"].includes(value)) return false;
      issue(field, "Use true/false, yes/no, or 1/0.");
      return fallback;
    };
    const cost = values.annual_cost ?? "";
    let annualCostMinor = NaN;
    if (!/^\d+(\.\d{1,2})?$/.test(cost)) issue("annual_cost", "Use a non-negative amount with a decimal point and up to two decimals, such as 1200.50. Do not include currency symbols or thousands separators.");
    else {
      const [whole, fraction = ""] = cost.split(".");
      annualCostMinor = Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
    }
    const seatTracking = bool("seat_tracking", true);
    const parsed = licenseSchema.safeParse({
      productName: values.product_name ?? "", vendorId: vendor?.id ?? "", departmentId: department?.id ?? "", responsibleUserId: owner?.id ?? "",
      licenseType: LICENSE_TYPES.find(type => normalize(type) === normalize(values.license_type ?? "")),
      purchaseDate: values.purchase_date ?? "", startDate: values.start_date ?? "", expirationDate: values.expiration_date ?? "",
      annualCostMinor, currency: (values.currency ?? "").toUpperCase(), licenseKey: values.license_key ?? "", clearKey: false,
      seatTracking, purchasedSeats: integer("purchased_seats", seatTracking ? 1 : 0), assignedSeats: integer("assigned_seats", 0),
      renewalDate: values.renewal_date ?? "", autoRenewal: bool("auto_renewal", false), supplier: values.supplier ?? "", contractNumber: values.contract_number ?? "", notes: values.notes ?? "",
    });
    if (!parsed.success) {
      const names: Record<string, string> = { vendorId: "vendor", departmentId: "department", responsibleUserId: "owner_email" };
      for (const problem of parsed.error.issues) {
        const key = String(problem.path[0]);
        const field = names[key] ?? key.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`).replace("annual_cost_minor", "annual_cost");
        if (!issues.some(item => item.row === row && item.field === field)) issue(field, key === "licenseType" ? `Use one of: ${LICENSE_TYPES.join(", ")}.` : key === "currency" ? `Use one of: ${CURRENCIES.join(", ")}.` : problem.message);
      }
      continue;
    }
    const data = parsed.data;
    const key = identity(data);
    if (seen.has(key)) issue("product_name", "Duplicate agreement in this file (same product, vendor, department, and contract number).");
    seen.add(key);
    prepared.push({ row, data, vendor: vendor!.label, department: department!.label, ownerEmail: owner!.label });
  }
  // Read only identity fields; no keys or confidential notes enter the preview.
  const existing = await client.license.findMany({ select: { productName: true, vendorId: true, departmentId: true, contractNumber: true } });
  const identities = new Set(existing.map(identity));
  for (const item of prepared) if (identities.has(identity(item.data))) issues.push({ row: item.row, field: "product_name", message: "This agreement already exists (same product, vendor, department, and contract number)." });
  if (issues.length) throw new CsvImportError(issues.slice(0, 100));
  return prepared;
}

export async function previewLicenseImport(source: string): Promise<ImportPreview> {
  await currentActor();
  const prepared = await prepare(source, db);
  return { rows: prepared.map(({ row, data, vendor, department, ownerEmail }) => ({ row, productName: data.productName, vendor, department, ownerEmail, licenseType: data.licenseType, expirationDate: data.expirationDate, annualCostMinor: data.annualCostMinor, currency: data.currency, purchasedSeats: data.purchasedSeats, assignedSeats: data.assignedSeats, keyStored: Boolean(data.licenseKey) })) };
}

export async function importLicenses(source: string) {
  const actor = await currentActor();
  return db.$transaction(async tx => {
    // Revalidate on commit: the preview and caller-supplied data are not trusted.
    const prepared = await prepare(source, tx);
    for (const { data } of prepared) await insertLicense(tx, data, actor.id);
    return { count: prepared.length };
  }, { timeout: 30_000 });
}
