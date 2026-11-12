"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { Download, Upload, CheckCircle2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { previewLicenseImportAction, importLicensesAction } from "@/actions/license-import";
import { CSV_MAX_BYTES, type CsvIssue, type ImportPreview } from "@/lib/license-csv";
import { money } from "@/lib/calculations";

export function LicenseImport({ template }: { template: string }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [page, setPage] = useState(0);
  const [issues, setIssues] = useState<CsvIssue[]>([]);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  function downloadTemplate() {
    const url = URL.createObjectURL(new Blob([template], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = "license-import-template.csv";
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function submit(commit: boolean) {
    if (!file || pending) return;
    setError(""); setIssues([]);
    const form = new FormData(); form.set("file", file);
    startTransition(async () => {
      try {
        if (commit) {
          const result = await importLicensesAction(form);
          setPreview(null);
          if (!result.success) { setError(result.error); setIssues(result.issues); return; }
          setImported(result.data.count); setFile(null);
          if (input.current) input.current.value = "";
        } else {
          const result = await previewLicenseImportAction(form);
          if (!result.success) { setPreview(null); setError(result.error); setIssues(result.issues); return; }
          setPreview(result.data); setPage(0);
        }
      } catch {
        setPreview(null);
        setError("Could not reach the server. Preview again to check whether the licenses were saved before retrying.");
      }
    });
  }
  return <div className="stack">
    {imported !== null && <section className="panel p-6" role="status"><h2 className="flex items-center gap-2"><CheckCircle2 size={20} />Imported {imported} {imported === 1 ? "license" : "licenses"}</h2><p className="muted mt-2 mb-4">Your licenses are saved and their creation is recorded in the audit log.</p><Button asChild><Link href="/licenses">View licenses</Link></Button></section>}
    <section className="panel p-6">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-4"><h2>1. Prepare your file</h2><Button variant="outline" onClick={downloadTemplate}><Download size={16} />Download CSV template</Button></div>
      <p className="text-sm muted">Replace the example row with your licenses. Use existing vendor and department names, and the responsible person’s email. Matching ignores capitalization. <Link className="text-link" href="/vendors">Manage vendors</Link> · <Link className="text-link" href="/departments">Manage departments</Link></p>
      <details className="mt-4 text-sm"><summary className="cursor-pointer font-medium">CSV format and defaults</summary><div className="mt-3 space-y-3 muted">
        <p>UTF-8 CSV, comma or semicolon separated; up to 500 licenses and 512 KiB. Quoted fields can contain commas, quotes, or line breaks.</p>
        <p>Required columns: <code className="break-words">product_name, vendor, department, owner_email, license_type, purchase_date, start_date, expiration_date, annual_cost, currency</code>.</p>
        <p>Dates: YYYY-MM-DD. Annual cost: 1200.50 (no currency symbols or thousands separators). Currency: EUR, USD, GBP, CAD, AUD, CHF, SEK, NOK, DKK, or JPY. License type: Subscription, Perpetual maintenance, Volume, OEM, or Trial.</p>
        <p>Optional columns: license_key, seat_tracking, purchased_seats, assigned_seats, renewal_date, auto_renewal, supplier, contract_number, notes. Seat tracking defaults to true, purchased seats to 1 (0 when tracking is off), assigned seats to 0, and auto-renewal to false. Other optional values stay empty. Boolean values accept true/false, yes/no, or 1/0.</p>
        <p>This creates new licenses. An agreement with the same product, vendor, department, and contract number is treated as a duplicate. Correct every error before importing; the whole file saves together. License keys are encrypted and are not shown in the preview.</p>
      </div></details>
    </section>
    <section className="panel p-6">
      <h2 className="mb-4">2. Upload and check</h2>
      <label className="form-field" htmlFor="license-csv">CSV file</label>
      <input ref={input} id="license-csv" type="file" accept=".csv,text/csv" disabled={pending} className="field-input h-auto py-3 w-full" onChange={event => {
        const chosen = event.target.files?.[0] ?? null;
        setPreview(null); setIssues([]); setError(""); setImported(null); setFile(null);
        if (chosen && (!chosen.name.toLowerCase().endsWith(".csv") || chosen.size > CSV_MAX_BYTES)) { setError("Choose a .csv file no larger than 512 KiB."); return; }
        setFile(chosen);
      }} />
      <Button className="mt-4" onClick={() => submit(false)} disabled={!file || pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Upload size={16} />}Preview CSV</Button>
      {error && <div role="alert" className="form-error-banner mt-4"><p>{error}</p>{issues.length > 0 && <><p className="mt-2">CSV record numbers include the header as row 1. Showing up to 100 errors.</p><ul className="list-disc pl-5 mt-2 space-y-1">{issues.map((issue, i) => <li key={i}>Row {issue.row} · {issue.field}: {issue.message}</li>)}</ul></>}</div>}
    </section>
    {preview && <section className="panel">
      <div className="panel-header"><div><h2>3. Review and import</h2><p>{preview.rows.length} {preview.rows.length === 1 ? "license is" : "licenses are"} ready. Nothing has been saved yet.</p></div></div>
      <div className="table-scroll"><table className="data-table"><thead><tr>{["Row", "Product", "Vendor", "Department", "Owner", "Type", "Expires", "Annual cost", "Seats assigned / purchased", "License key"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{preview.rows.slice(page * 20, (page + 1) * 20).map(row => <tr key={row.row}><td>{row.row}</td><td>{row.productName}</td><td>{row.vendor}</td><td>{row.department}</td><td>{row.ownerEmail}</td><td>{row.licenseType}</td><td>{row.expirationDate}</td><td>{money(row.annualCostMinor, row.currency)} {row.currency}</td><td>{row.assignedSeats} / {row.purchasedSeats}</td><td>{row.keyStored ? "Provided · hidden" : "None"}</td></tr>)}</tbody></table></div>
      <div className="p-6 flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3 text-sm"><Button variant="outline" disabled={page === 0 || pending} onClick={() => setPage(page - 1)}>Previous</Button><span>Page {page + 1} of {Math.ceil(preview.rows.length / 20)}</span><Button variant="outline" disabled={(page + 1) * 20 >= preview.rows.length || pending} onClick={() => setPage(page + 1)}>Next</Button></div><Button onClick={() => submit(true)} disabled={pending}>{pending && <LoaderCircle size={16} className="animate-spin" />}Import {preview.rows.length} {preview.rows.length === 1 ? "license" : "licenses"}</Button></div>
    </section>}
  </div>;
}
