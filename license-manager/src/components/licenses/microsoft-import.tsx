"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { microsoftImportAction } from "@/actions/microsoft-import";
import type { MicrosoftPreview } from "@/services/microsoft-import";

import { MICROSOFT_COLUMNS, licenseCsvTemplate } from "@/lib/microsoft-csv";

function downloadTemplate() {
  const url = URL.createObjectURL(new Blob([licenseCsvTemplate()], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url; link.download = "license-import-template.csv";
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function MicrosoftImport() {
  const [file, setFile] = useState<File | null>(null);
  const [dateOrder, setDateOrder] = useState("ISO");
  const [preview, setPreview] = useState<MicrosoftPreview | null>(null);
  const [selectedRows, setSelectedRows] = useState<number[]>([]);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");
  const [pending, startTransition] = useTransition();
  function run(save: boolean) {
    if (!file) return;
    const form = new FormData(); form.set("file", file); form.set("dateOrder", dateOrder);
    if (save && preview) { form.set("token", preview.token); form.set("selectedRows", JSON.stringify(selectedRows)); }
    setSaved(false);
    startTransition(async () => {
      try {
        const result = await microsoftImportAction(form);
        if (!result.success) { setMessage(result.error); setPreview(null); }
        else if (result.preview) { setPreview(result.preview); setSelectedRows(result.preview.rows.filter(row => !row.issues.length).map(row => row.row)); setMessage(""); }
        else if (result.saved) { setPreview(null); setSaved(true); setMessage(`Imported: ${result.saved.created} new products, ${result.saved.updated} updated products.`); }
      } catch { setMessage("Request failed. Preview again before retrying."); setPreview(null); }
    });
  }
  return <section className="panel p-6 space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-4"><h2>Microsoft CSV import</h2><Button variant="outline" onClick={downloadTemplate}>Download CSV template</Button></div>
    <p className="text-sm muted">The UTF-8 template contains the seven required Microsoft columns and one fictional row marked EXAMPLE ONLY. Replace or remove that example before importing your own products. Preview before saving.</p>
    <p>Import only the seven Microsoft product columns below. All other columns are ignored. Existing products are matched by name and updated; internal notes, ownership, department, costs, and other manual fields are preserved.</p>
    <p className="muted text-sm">Only Product name needs a value. Quantities and renewal/expiration date may be blank. Blank cells preserve existing values; new products store missing information as unknown. Manual ownership, dates and costs are never fabricated.</p>
    <label className="block">Microsoft CSV file<input aria-label="Microsoft CSV file" className="field-input" type="file" accept=".csv" disabled={pending} onChange={event => { setFile(event.target.files?.[0] ?? null); setPreview(null); setSaved(false); setMessage(""); }} /></label>

    <label className="block">CSV date format<select aria-label="Microsoft CSV date format" className="field-input" disabled={pending} value={dateOrder} onChange={event => { setDateOrder(event.target.value); setPreview(null); }}><option value="ISO">YYYY-MM-DD</option><option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option></select></label>
    <Button disabled={!file || pending} onClick={() => run(false)}>Preview Microsoft CSV</Button>
    {message && <p role="status" className="whitespace-pre-wrap">{message}</p>}
    {saved && <Button asChild><Link href="/licenses">View saved licenses</Link></Button>}
    {preview && <>
      <p role="status">Rows detected: {preview.total} · New products: {preview.created} · Existing products to update: {preview.updated} · Skipped rows: {preview.skipped} · Rows with errors: {preview.invalid}</p>
      <p className="text-sm muted">Review the licenses below and check the rows to save. New licenses will be added to your system; matching licenses will be updated. Rows with errors cannot be selected.</p>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2"><input type="checkbox" disabled={pending || preview.rows.every(row => row.issues.length > 0)} checked={selectedRows.length > 0 && selectedRows.length === preview.rows.filter(row => !row.issues.length).length} onChange={event => setSelectedRows(event.target.checked ? preview.rows.filter(row => !row.issues.length).map(row => row.row) : [])} />Select all valid licenses</label>
        <span>{selectedRows.length} selected · {preview.rows.filter(row => selectedRows.includes(row.row) && row.action === "create").length} to add · {preview.rows.filter(row => selectedRows.includes(row.row) && row.action === "update").length} to update</span>
      </div>
      <div className="table-scroll"><table className="data-table"><thead><tr><th scope="col">Save</th>{[...MICROSOFT_COLUMNS, "Operation", "Validation errors"].map(column => <th key={column}>{column}</th>)}</tr></thead><tbody>{preview.rows.map(row => <tr key={row.row}>
        <td><input type="checkbox" aria-label={`Save row ${row.row}: ${row.productName}`} disabled={pending || row.issues.length > 0} checked={selectedRows.includes(row.row)} onChange={event => setSelectedRows(current => event.target.checked ? [...current, row.row] : current.filter(number => number !== row.row))} /></td>
        {[row.productName, row.assigned, row.purchased, row.available, row.status, row.date, row.billingProfile, row.action === "create" ? "Add new license" : "Update existing license", row.issues.join(" ")].map((value, index) => <td key={index}>{value ?? (row.action === "create" ? "Unknown" : "Blank · preserve existing")}</td>)}
      </tr>)}</tbody></table></div>
      <Button disabled={pending || !selectedRows.length} onClick={() => run(true)}>{pending ? "Saving licenses…" : "Save selected licenses"}</Button>
    </>}
  </section>;
}
