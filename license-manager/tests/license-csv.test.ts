import { test } from "node:test";
import assert from "node:assert/strict";
import { CsvImportError, CSV_MAX_BYTES, parseLicenseCsv, licenseCsvTemplate, readCsv } from "../src/lib/license-csv";
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

test("default Microsoft template has exact ordered headers, one fictional row, and Excel UTF-8 escaping", () => {
  const template = licenseCsvTemplate();
  const bytes = new TextEncoder().encode(template);
  assert.deepEqual(Array.from(bytes.slice(0, 3)), [0xef, 0xbb, 0xbf]);
  const expected = "Product name,Assigned licenses,Purchased quantity,Available licenses,Subscription status,Renewal or expiration date,Billing profile";
  assert.equal(template.slice(1).split("\r\n")[0], expected);
  assert.equal(template.split("\r\n").length, 3);
  const parsed = readCsv(template);
  assert.deepEqual(parsed.headers, expected.split(","));
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].cells[0], 'EXAMPLE ONLY - Fictional "Office, Demo" product');
  assert.equal(parsed.rows[0].cells[6], "EXAMPLE ONLY - Fictional billing profile");
  assert.ok(template.includes('""Office, Demo""'));
});
