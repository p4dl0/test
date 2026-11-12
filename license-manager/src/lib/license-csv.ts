export const CSV_MAX_BYTES = 512 * 1024;
export const CSV_MAX_ROWS = 500;
export const CSV_COLUMNS = ["product_name", "vendor", "department", "owner_email", "license_type", "purchase_date", "start_date", "expiration_date", "annual_cost", "currency", "license_key", "seat_tracking", "purchased_seats", "assigned_seats", "renewal_date", "auto_renewal", "supplier", "contract_number", "notes"] as const;
const requiredColumns = CSV_COLUMNS.slice(0, 10);
export type CsvColumn = typeof CSV_COLUMNS[number];
export type CsvIssue = { row: number; field: string; message: string };
export class CsvImportError extends Error {
  constructor(public issues: CsvIssue[]) { super("Correct the CSV errors and preview again."); }
}
export function csvError(row: number, field: string, message: string): never {
  throw new CsvImportError([{ row, field, message }]);
}

// RFC-style quoted fields, including escaped quotes and embedded line breaks.
// A row number denotes a CSV record (header = 1), not a physical text line.
export function parseLicenseCsv(source: string) {
  if (new TextEncoder().encode(source).length > CSV_MAX_BYTES) csvError(1, "file", "The file must be 512 KiB or smaller.");
  const text = source.replace(/^\uFEFF/, "");
  if (!text.trim()) csvError(1, "file", "The file is empty.");
  if (text.includes("\0")) csvError(1, "file", "Save the file as UTF-8 CSV.");
  const firstLine = text.split(/\r?\n/, 1)[0];
  const delimiter = firstLine.includes(";") && !firstLine.includes(",") ? ";" : ",";
  const records: string[][] = [];
  let record: string[] = [], value = "", state: "start" | "plain" | "quoted" | "closed" = "start";
  const field = () => { record.push(value); value = ""; state = "start"; };
  const row = () => {
    field();
    records.push(record); record = [];
    if (records.length > CSV_MAX_ROWS + 1) csvError(records.length, "file", `Import at most ${CSV_MAX_ROWS} licenses at a time.`);
  };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (state === "quoted") {
      if (char === '"') {
        if (text[i + 1] === '"') { value += '"'; i++; } else state = "closed";
      } else value += char;
    } else if (char === delimiter) field();
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row();
    } else if (char === '"' && state === "start") state = "quoted";
    else if (char === '"' || state === "closed") csvError(records.length + 1, "file", "Malformed quoting. Quote the entire field and escape quotes by doubling them.");
    else { value += char; state = "plain"; }
    if (record.length > CSV_COLUMNS.length) csvError(records.length + 1, "file", "Too many columns. Use the CSV template.");
  }
  if (state === "quoted") csvError(records.length + 1, "file", "A quoted field is missing its closing quote.");
  if (value || record.length || state !== "start") row();
  const headers = records.shift()!.map(header => header.trim().toLowerCase().replace(/[\s-]+/g, "_"));
  if (new Set(headers).size !== headers.length) csvError(1, "header", "Column names must be unique.");
  if (headers.some(header => !(CSV_COLUMNS as readonly string[]).includes(header))) csvError(1, "header", "Unknown column name. Use the column names from the template.");
  const missing = requiredColumns.filter(column => !headers.includes(column));
  if (missing.length) csvError(1, "header", `Missing columns: ${missing.join(", ")}.`);
  const rows = records.flatMap((cells, index) => {
    if (cells.every(cell => !cell.trim())) return [];
    if (cells.length !== headers.length) csvError(index + 2, "file", `Expected ${headers.length} columns; found ${cells.length}.`);
    return [{ row: index + 2, values: Object.fromEntries(headers.map((header, i) => [header, cells[i].trim()])) as Partial<Record<CsvColumn, string>> }];
  });
  if (!rows.length) csvError(2, "file", "Add at least one license below the header.");
  return rows;
}

export function licenseCsvTemplate(example: { vendor: string; department: string; ownerEmail: string; today: string; currency: string }) {
  const values = ["Example software", example.vendor, example.department, example.ownerEmail, "Subscription", example.today, example.today, `${Number(example.today.slice(0, 4)) + 1}-12-31`, "1200.00", example.currency, "", "true", "10", "0", "", "false", "", "EXAMPLE-001", "Replace this example with your licenses"];
  const escape = (value: string) => {
    // Directory names are untrusted spreadsheet input, even in a template.
    const safe = /^[=+\-@\t\r\n]/.test(value) ? `'${value}` : value;
    return `"${safe.replaceAll('"', '""')}"`;
  };
  return "\uFEFF" + CSV_COLUMNS.join(",") + "\r\n" + values.map(escape).join(",") + "\r\n";
}

export type ImportPreview = { rows: { row: number; productName: string; vendor: string; department: string; ownerEmail: string; licenseType: string; expirationDate: string; annualCostMinor: number; currency: string; purchasedSeats: number; assignedSeats: number; keyStored: boolean }[] };
export type ImportResult<T> = { success: true; data: T } | { success: false; error: string; issues: CsvIssue[] };
