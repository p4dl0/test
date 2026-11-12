import { z } from "zod";
import { CSV_COLUMNS, CsvImportError, csvError, csvHeaderKey, readCsv, type CsvColumn, type CsvIssue } from "@/lib/license-csv";

export const MAPPING_FIELDS = [...CSV_COLUMNS, "available_seats"] as const;
export type MappingField = typeof MAPPING_FIELDS[number];
export const importOptionsSchema = z.object({
  mapping: z.partialRecord(z.enum(MAPPING_FIELDS), z.number().int().min(0).max(99)),
  defaults: z.partialRecord(z.enum(CSV_COLUMNS), z.string().max(5000)),
  dateOrder: z.enum(["ISO", "DMY", "MDY"]),
}).strict();
export type CsvImportOptions = z.infer<typeof importOptionsSchema>;

const aliases: Partial<Record<MappingField, string[]>> = {
  product_name: ["Product name", "Product name (includes custom names)", "Product", "Name", "License name", "Subscription name"],
  purchased_seats: ["Purchased quantity", "Total licenses", "Purchased licenses", "Licenses purchased", "Total quantity", "Quantity"],
  assigned_seats: ["Assigned licenses", "Licenses assigned", "Used licenses", "Consumed units"],
  available_seats: ["Available licenses", "Licenses available", "Remaining licenses"],
  expiration_date: ["Renewal or expiration date", "Renewal or expiration", "Renewal or expiry date", "Expiration date", "Expiry date", "Subscription end date", "End date"],
  purchase_date: ["Purchase date", "Date purchased"],
  start_date: ["Start date", "Subscription start date"],
  renewal_date: ["Renewal date", "Next renewal date"],
  auto_renewal: ["Recurring billing", "Auto renew", "Auto renewal"],
  contract_number: ["Subscription ID", "Subscription identifier", "Contract number"],
  supplier: ["Purchase channel", "Reseller", "Partner name"],
  vendor: ["Publisher", "Vendor"],
  annual_cost: ["Annual cost", "Yearly cost"],
  // Monthly/unit prices and billing frequency are deliberately not annual cost.
};

export function inspectLicenseCsv(source: string) {
  const { headers, rows } = readCsv(source);
  const keys = headers.map(csvHeaderKey);
  if (keys.some(key => ["userprincipalname", "username", "displayname"].includes(key)) && !keys.includes("purchasedquantity") && !keys.includes("totallicenses")) {
    csvError(1, "header", "This appears to be a user or usage report. Export Billing → Your products to import subscription quantities and renewal dates.");
  }
  const mapping: CsvImportOptions["mapping"] = {};
  for (const field of MAPPING_FIELDS) {
    const names = [field, ...(aliases[field] ?? [])].map(csvHeaderKey);
    const matches = keys.flatMap((key, index) => names.includes(key) ? [index] : []);
    // Ambiguous aliases are left unmapped for an explicit choice.
    if (matches.length === 1) mapping[field] = matches[0];
  }
  const microsoft = keys.some(key => ["purchasedquantity", "assignedlicenses", "availablelicenses", "subscriptionstatus", "purchasechannel"].includes(key));
  const isTemplate = keys.every(key => CSV_COLUMNS.some(column => csvHeaderKey(column) === key)) && CSV_COLUMNS.slice(0, 10).every(column => keys.includes(csvHeaderKey(column)));
  return { headers, mapping, rowCount: rows.length, isTemplate, format: microsoft ? "Microsoft 365 products" : "CSV", ignoredColumns: headers.filter((_, index) => !Object.values(mapping).includes(index)) };
}
export type CsvInspection = ReturnType<typeof inspectLicenseCsv>;

function dateValue(value: string, order: CsvImportOptions["dateOrder"], row: number, field: string) {
  if (!value || /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const timestamp = /^(\d{4}-\d{2}-\d{2})T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.exec(value);
  if (timestamp) return timestamp[1];
  const numeric = /^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/.exec(value);
  if (numeric && order !== "ISO") {
    const [, first, second, year] = numeric;
    return `${year}-${(order === "MDY" ? first : second).padStart(2, "0")}-${(order === "MDY" ? second : first).padStart(2, "0")}`;
  }
  return csvError(row, field, "Use YYYY-MM-DD, or choose the matching day/month or month/day date format. Dates are never guessed.");
}

export function mappedLicenseCsv(source: string, input: unknown) {
  const parsed = importOptionsSchema.safeParse(input);
  if (!parsed.success) csvError(1, "mapping", "Invalid column mapping or defaults. Detect the columns again.");
  const { mapping, defaults, dateOrder } = parsed.data;
  const { headers, rows } = readCsv(source);
  const selected = Object.values(mapping);
  if (selected.some(index => index >= headers.length) || new Set(selected).size !== selected.length) csvError(1, "mapping", "Map each source column to at most one field and select only columns in this file.");
  if (mapping.product_name === undefined) csvError(1, "product_name", "Select the column containing the product name.");
  const issues: CsvIssue[] = [];
  const result = rows.map(({ row, cells }) => {
    const values: Partial<Record<CsvColumn, string>> = {};
    for (const field of CSV_COLUMNS) {
      const index = mapping[field];
      values[field] = (index === undefined ? "" : cells[index]) || defaults[field]?.trim() || "";
    }
    const issue = (field: string, message: string) => issues.push({ row, field, message });
    const integer = (value: string, field: string) => {
      // Accept conventional grouping in English Microsoft exports, never decimals.
      if (/^\d{1,3}(?:,\d{3})+$/.test(value)) value = value.replaceAll(",", "");
      if (!/^\d+$/.test(value)) { issue(field, "Use a whole, non-negative license quantity."); return undefined; }
      const number = Number(value);
      if (!Number.isSafeInteger(number) || number > 1_000_000) { issue(field, "License quantity must be between 0 and 1,000,000."); return undefined; }
      return number;
    };
    const available = mapping.available_seats === undefined ? undefined : integer(cells[mapping.available_seats], "available_seats");
    let assigned: number | undefined;
    if (values.assigned_seats) {
      assigned = integer(values.assigned_seats, "assigned_seats");
      if (assigned !== undefined) values.assigned_seats = String(assigned);
    }
    if (values.purchased_seats) {
      const purchased = integer(values.purchased_seats, "purchased_seats");
      if (purchased !== undefined) values.purchased_seats = String(purchased);
    } else if (assigned !== undefined && available !== undefined) values.purchased_seats = String(assigned + available);
    // External exports must supply quantities; never default a subscription to one seat.
    const untracked = ["false", "no", "0"].includes(values.seat_tracking?.toLowerCase() ?? "");
    if (!untracked && !values.purchased_seats) issue("purchased_seats", "Map purchased quantity, or both assigned and available licenses, or enter a fallback quantity.");
    if (!untracked && !values.assigned_seats) issue("assigned_seats", "Map assigned licenses or enter a fallback quantity (0 if none are assigned).");
    for (const field of ["purchase_date", "start_date", "expiration_date", "renewal_date"] as const) {
      try { values[field] = dateValue(values[field] ?? "", dateOrder, row, field); }
      catch (error) { if (error instanceof CsvImportError) issues.push(...error.issues); else throw error; }
    }
    const recurring = values.auto_renewal?.toLowerCase();
    if (recurring === "on" || recurring === "enabled") values.auto_renewal = "true";
    if (recurring === "off" || recurring === "disabled") values.auto_renewal = "false";
    for (const field of CSV_COLUMNS.slice(0, 10)) if (!values[field]) issue(field, "Map a source column or enter a fallback for this required field.");
    return { row, values };
  });
  if (issues.length) throw new CsvImportError(issues.slice(0, 100));
  return result;
}
