import { test } from "node:test";
import assert from "node:assert/strict";
import { CsvImportError, CSV_MAX_BYTES, parseLicenseCsv, licenseCsvTemplate } from "../src/lib/license-csv";
import { csvFixture } from "./csv-fixture";

test("CSV supports BOM, CRLF, quotes, delimiters, Unicode, and multiline notes", () => {
  for (const delimiter of [",", ";"]) {
    const notes = 'First line, with "quotes"; and more\r\nSecond line: Rīga';
    const rows = parseLicenseCsv(csvFixture([{ product_name: 'Design, "Pro"', notes }, { product_name: "Other" }], delimiter));
    assert.equal(rows.length, 2);
    assert.equal(rows[0].values.notes, notes);
    assert.equal(rows[0].values.product_name, 'Design, "Pro"');
    assert.equal(rows[1].row, 3);
  }
});

test("CSV rejects missing, repeated, or unknown columns and malformed records", () => {
  const valid = csvFixture([{}]);
  for (const text of ["", "product_name\nOnly product", valid.replace("vendor,", "product_name,"), valid.replace("owner_email,", "password,"), valid.replace('"CSV agreement"', '"CSV agreement'), valid.replace('"CSV agreement"', '"CSV"agreement'), valid.replace('"CSV agreement",', ""), valid + '\0']) {
    assert.throws(() => parseLicenseCsv(text), CsvImportError);
  }
  assert.equal(parseLicenseCsv(valid.replace("product_name", "Product Name")).length, 1);
  assert.equal(parseLicenseCsv(valid + "\r\n").length, 1);
});

test("CSV enforces file and record limits", () => {
  assert.throws(() => parseLicenseCsv("a".repeat(CSV_MAX_BYTES + 1)), CsvImportError);
  assert.throws(() => parseLicenseCsv(csvFixture(Array.from({ length: 501 }, () => ({})))), CsvImportError);
  assert.equal(parseLicenseCsv(csvFixture(Array.from({ length: 500 }, () => ({})))).length, 500);
});

test("template uses current directory entries, has no keys, and escapes spreadsheet formulas", () => {
  const template = licenseCsvTemplate({ vendor: 'Vendor, "Pro"', department: "IT", ownerEmail: "admin@example.test", today: "2026-11-12", currency: "EUR" });
  const row = parseLicenseCsv(template)[0].values;
  assert.equal(row.vendor, 'Vendor, "Pro"');
  assert.equal(row.owner_email, "admin@example.test");
  assert.equal(row.license_key, "");
  const dangerous = licenseCsvTemplate({ vendor: '=HYPERLINK("https://example.test")', department: "IT", ownerEmail: "admin@example.test", today: "2026-11-12", currency: "EUR" });
  assert.ok(parseLicenseCsv(dangerous)[0].values.vendor!.startsWith("'="));
});
