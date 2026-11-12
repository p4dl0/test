import { CSV_COLUMNS } from "../src/lib/license-csv";

export function csvFixture(rows: Record<string, string>[], delimiter = ",") {
  const defaults: Record<string, string> = {
    product_name: "CSV agreement", vendor: "Test vendor", department: "Test department", owner_email: "admin@example.test",
    license_type: "Subscription", purchase_date: "2026-01-01", start_date: "2026-01-01", expiration_date: "2028-12-31", annual_cost: "1200.50", currency: "EUR",
  };
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  return "\uFEFF" + CSV_COLUMNS.join(delimiter) + "\r\n" + rows.map(row => {
    const data = { ...defaults, ...row };
    return CSV_COLUMNS.map(column => quote(data[column] ?? "")).join(delimiter);
  }).join("\r\n") + "\r\n";
}
