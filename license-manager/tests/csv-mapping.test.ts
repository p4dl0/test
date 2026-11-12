import { test } from "node:test";
import assert from "node:assert/strict";
import { CsvImportError, decodeCsvFile, readCsv } from "../src/lib/license-csv";
import { inspectLicenseCsv, mappedLicenseCsv, type CsvImportOptions } from "../src/lib/csv-mapping";

const products = 'Product name,Assigned licenses,Purchased quantity,Available licenses,Subscription status,Renewal or expiration date,Purchase channel,Next invoice date,Purchase date,Billing frequency,Subscription ID,Recurring billing\r\n"Microsoft 365 Business Premium",8,10,2,Active,12/31/2027,Partner,12/01/2026,11/12/2026,Monthly,subscription-123,On\r\n';
const defaults = { vendor: "Microsoft", department: "IT", owner_email: "admin@example.test", license_type: "Subscription", start_date: "2026-11-12", annual_cost: "1200.50", currency: "EUR" };
const options = (): CsvImportOptions => ({ mapping: inspectLicenseCsv(products).mapping, defaults, dateOrder: "MDY" });

test("Your products export maps quantities, dates, subscription IDs and ignores billing metadata", () => {
  const inspection = inspectLicenseCsv(products);
  assert.equal(inspection.format, "Microsoft 365 products");
  assert.equal(inspection.mapping.product_name, 0);
  const customNames = products.replace("Product name", "Product name (includes custom names)");
  assert.equal(inspectLicenseCsv(customNames).mapping.product_name, 0);
  assert.equal(mappedLicenseCsv(customNames, options())[0].values.product_name, "Microsoft 365 Business Premium");
  assert.equal(inspection.mapping.purchased_seats, 2);
  assert.equal(inspection.mapping.assigned_seats, 1);
  assert.equal(inspection.mapping.contract_number, 10);
  assert.equal(inspection.mapping.annual_cost, undefined);
  assert.ok(inspection.ignoredColumns.includes("Next invoice date"));
  const { values } = mappedLicenseCsv(products, options())[0];
  assert.equal(values.product_name, "Microsoft 365 Business Premium");
  assert.equal(values.purchased_seats, "10");
  assert.equal(values.assigned_seats, "8");
  assert.equal(values.purchase_date, "2026-11-12");
  assert.equal(values.expiration_date, "2027-12-31");
  assert.equal(values.contract_number, "subscription-123");
  assert.equal(values.auto_renewal, "true");
  assert.equal(values.annual_cost, "1200.50");
});

test("UTF-16 Microsoft/Excel files, separator directives and tab-separated files decode correctly", () => {
  const source = 'sep=;\r\nProduct name;Purchased quantity;Assigned licenses;Extra\r\n"Rīga, Pro";10;3;metadata\r\n';
  const little = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(source, "utf16le")]);
  const big = Buffer.from(little).swap16();
  for (const bytes of [little, big, Buffer.from('\uFEFF' + source, "utf8")]) {
    const decoded = decodeCsvFile(bytes);
    assert.equal(inspectLicenseCsv(decoded).mapping.purchased_seats, 1);
    const raw = readCsv(decoded);
    assert.equal(raw.rows[0].cells[0], "Rīga, Pro");
    assert.equal(raw.rows[0].row, 3);
  }
  assert.equal(readCsv("Product name\tTotal licenses\tAssigned licenses\nOffice 365 E3\t10\t3\n").headers.length, 3);
  assert.throws(() => decodeCsvFile(Uint8Array.from([0xff, 0xfe, 0x61])), CsvImportError);
});

test("external files never invent missing dates, costs, or quantities and require explicit date order", () => {
  assert.throws(() => mappedLicenseCsv(products, { ...options(), defaults: { ...defaults, annual_cost: "" } }), CsvImportError);
  assert.throws(() => mappedLicenseCsv(products, { ...options(), dateOrder: "ISO" }), CsvImportError);
  const source = 'Name,Assigned licenses,Available licenses,Expired licenses\nMicrosoft 365 E3,5,2,99\n';
  const config = { mapping: inspectLicenseCsv(source).mapping, defaults: { ...defaults, purchase_date: "2026-01-01", expiration_date: "2027-01-01" }, dateOrder: "ISO" };
  assert.equal(mappedLicenseCsv(source, config)[0].values.purchased_seats, "7");
  assert.throws(() => mappedLicenseCsv(source, { ...config, mapping: { product_name: 0, assigned_seats: 1 } }), CsvImportError);
  const localized = products.replace("12/31/2027", "31/12/2027").replace("11/12/2026", "12/11/2026");
  assert.equal(mappedLicenseCsv(localized, { ...options(), dateOrder: "DMY" })[0].values.purchase_date, "2026-11-12");
});

test("manual mapping handles alternate headers but rejects forged or ambiguous mappings", () => {
  const source = 'Software label,Entitlements,Allocated,Comment\nCustom Microsoft plan,25,12,not imported\n';
  const config = { mapping: { product_name: 0, purchased_seats: 1, assigned_seats: 2 }, defaults: { ...defaults, purchase_date: "2026-01-01", expiration_date: "2027-01-01" }, dateOrder: "ISO" };
  assert.equal(mappedLicenseCsv(source, config)[0].values.purchased_seats, "25");
  for (const mapping of [{ product_name: 99 }, { product_name: 0, assigned_seats: 0 }, { product_name: -1 }, { product_name: "0" }, { passwordHash: 0 }]) assert.throws(() => mappedLicenseCsv(source, { ...config, mapping }), CsvImportError);
  assert.throws(() => inspectLicenseCsv("User principal name,Display name,Licenses\nuser@example.test,User,Office 365 E3\n"), /Correct the CSV/);
  const ambiguous = inspectLicenseCsv("Product name,Total licenses,Purchased quantity,Assigned licenses\nOffice 365 E3,10,10,5\n");
  assert.equal(ambiguous.mapping.purchased_seats, undefined);
});
