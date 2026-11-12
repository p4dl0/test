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

export function decodeCsvFile(bytes: Uint8Array) {
  if (bytes.length > CSV_MAX_BYTES) csvError(1, "file", "The file must be 512 KiB or smaller.");
  let encoding = "utf-8";
  if (bytes[0] === 0xff && bytes[1] === 0xfe) encoding = "utf-16le";
  else if (bytes[0] === 0xfe && bytes[1] === 0xff) encoding = "utf-16be";
  try { return new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { return csvError(1, "file", "The file encoding is invalid. Save as UTF-8 CSV or UTF-16 CSV with a byte-order mark."); }
}

export const csvHeaderKey = (value: string) => value.trim().toLowerCase().replace(/[\s_\-()/]+/g, "");

// Shared CSV reader: preserves source headings and record numbers for mapping.
export function readCsv(source: string, maxColumns = 100, allowDuplicateHeaders = false) {
  if (new TextEncoder().encode(source).length > CSV_MAX_BYTES) csvError(1, "file", "The decoded file must be 512 KiB or smaller.");
  let text = source.replace(/^\uFEFF/, "");
  if (!text.trim()) csvError(1, "file", "The file is empty.");
  if (text.includes("\0")) csvError(1, "file", "Save as UTF-8 CSV or UTF-16 CSV with a byte-order mark.");
  const separator = /^sep=([,;\t])(?:\r\n|\n|\r)/i.exec(text);
  const offset = separator ? 1 : 0;
  if (separator) text = text.slice(separator[0].length);
  let delimiter = separator?.[1] ?? ",";
  if (!separator) {
    const counts: Record<string, number> = { ",": 0, ";": 0, "\t": 0 };
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (char === '"') {
        if (quoted && text[i + 1] === '"') i++; else quoted = !quoted;
      } else if (!quoted && (char === "\r" || char === "\n")) break;
      else if (!quoted && char in counts) counts[char]++;
    }
    delimiter = Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0];
  }
  const records: string[][] = [];
  let record: string[] = [], value = "", state: "start" | "plain" | "quoted" | "closed" = "start";
  const field = () => { record.push(value); value = ""; state = "start"; };
  const row = () => {
    field(); records.push(record); record = [];
    if (records.length > CSV_MAX_ROWS + 1) csvError(records.length + offset, "file", `Import at most ${CSV_MAX_ROWS} licenses at a time.`);
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
    else if (state === "closed" && (char === " " || char === "\t")) continue;
    else if (char === '"' || state === "closed") csvError(records.length + 1 + offset, "file", "Malformed quoting. Quote the entire field and escape quotes by doubling them.");
    else { value += char; state = "plain"; }
    if (record.length > maxColumns) csvError(records.length + 1 + offset, "file", `The file has more than ${maxColumns} columns.`);
  }
  if (state === "quoted") csvError(records.length + 1 + offset, "file", "A quoted field is missing its closing quote.");
  if (value || record.length || state !== "start") row();
  const headers = records.shift()!.map(header => header.trim());
  if (headers.length > maxColumns || headers.some(header => !header || header.length > 160)) csvError(1 + offset, "header", "Use 1–100 non-empty column names, each no longer than 160 characters.");
  if (!allowDuplicateHeaders && new Set(headers.map(csvHeaderKey)).size !== headers.length) csvError(1 + offset, "header", "Column names must be unique.");
  const rows = records.flatMap((cells, index) => {
    if (cells.every(cell => !cell.trim())) return [];
    if (cells.length !== headers.length) csvError(index + 2 + offset, "file", `Expected ${headers.length} columns; found ${cells.length}.`);
    return [{ row: index + 2 + offset, cells: cells.map(cell => cell.trim()) }];
  });
  if (!rows.length) csvError(2 + offset, "file", "Add at least one license below the header.");
  return { headers, rows, skippedRows: records.filter(cells => cells.every(cell => !cell.trim())).length };
}

export function parseLicenseCsv(source: string) {
  const { headers: original, rows } = readCsv(source);
  const headers = original.map(header => header.toLowerCase().replace(/[\s-]+/g, "_"));
  if (headers.some(header => !(CSV_COLUMNS as readonly string[]).includes(header))) csvError(1, "header", "This file uses different columns. Use Detect columns to map them before previewing.");
  const missing = requiredColumns.filter(column => !headers.includes(column));
  if (missing.length) csvError(1, "header", `Missing columns: ${missing.join(", ")}.`);
  return rows.map(({ row, cells }) => ({ row, values: Object.fromEntries(headers.map((header, i) => [header, cells[i]])) as Partial<Record<CsvColumn, string>> }));
}

export { licenseCsvTemplate } from "@/lib/microsoft-csv";

export type ImportPreview = { rows: { row: number; productName: string; vendor: string; department: string; ownerEmail: string; licenseType: string; purchaseDate: string; startDate: string; expirationDate: string; contractNumber: string; annualCostMinor: number; currency: string; purchasedSeats: number; assignedSeats: number; keyStored: boolean }[] };
export type ImportResult<T> = { success: true; data: T } | { success: false; error: string; issues: CsvIssue[] };
