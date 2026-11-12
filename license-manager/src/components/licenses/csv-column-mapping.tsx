"use client";

import { CURRENCIES, LICENSE_TYPES } from "@/lib/calculations";
import { MAPPING_FIELDS, type CsvImportOptions, type CsvInspection } from "@/lib/csv-mapping";
import type { CsvColumn } from "@/lib/license-csv";

export type ImportDirectories = { vendors: string[]; departments: string[]; owners: string[] };
export function CsvColumnMapping({ inspection, options, directories, disabled, onChange }: {
  inspection: CsvInspection; options: CsvImportOptions; directories: ImportDirectories; disabled: boolean; onChange: (options: CsvImportOptions) => void;
}) {
  const ignored = inspection.headers.filter((_, index) => !Object.values(options.mapping).includes(index));
  const choices: Partial<Record<CsvColumn, readonly string[]>> = { vendor: directories.vendors, department: directories.departments, owner_email: directories.owners, license_type: LICENSE_TYPES, currency: CURRENCIES, auto_renewal: ["true", "false"], seat_tracking: ["true", "false"] };
  return <section className="panel mt-5">
    <div className="panel-header"><div><h2>{inspection.format} detected · {inspection.rowCount} {inspection.rowCount === 1 ? "row" : "rows"}</h2><p>Review the matches. Fill required fields missing from the export. Fallbacks apply to every blank value in that field.</p></div></div>
    <div className="panel-body text-sm space-y-3">
      <p>Dates, department, owner, and total annual cost may not be exported by Microsoft. Enter the real values; missing prices are not treated as zero. If subscriptions need different values, add those columns to the CSV or import separate files.</p>
      <p>Purchased seats come from purchased quantity, or assigned plus available licenses. Subscription IDs become contract numbers. Monthly prices, unit prices, and invoice dates are not converted into annual cost or expiration dates.</p>
      <label className="block" htmlFor="csv-date-order">Dates in this file<select aria-label="Dates in this file" id="csv-date-order" className="field-input mt-2" disabled={disabled} value={options.dateOrder} onChange={event => onChange({ ...options, dateOrder: event.target.value as CsvImportOptions["dateOrder"] })}><option value="ISO">YYYY-MM-DD (ISO)</option><option value="DMY">DD/MM/YYYY (day first)</option><option value="MDY">MM/DD/YYYY (month first)</option></select></label>
    </div>
    <div className="table-scroll"><table className="data-table"><thead><tr><th>License field</th><th>CSV column</th><th>Fallback when blank</th></tr></thead><tbody>{MAPPING_FIELDS.map(field => {
      const isRequired = ["product_name", "vendor", "department", "owner_email", "license_type", "purchase_date", "start_date", "expiration_date", "annual_cost", "currency"].includes(field);
      const fallback = field === "available_seats" || field === "product_name" || field === "license_key" ? null : field;
      const values = fallback ? choices[fallback] : undefined;
      const setDefault = (value: string) => { if (fallback) onChange({ ...options, defaults: { ...options.defaults, [fallback]: value } }); };
      return <tr key={field}><td>{field.replaceAll("_", " ")}{isRequired ? " *" : ""}</td><td><select className="field-input" aria-label={`CSV column for ${field}`} disabled={disabled} value={options.mapping[field] ?? ""} onChange={event => {
        const mapping = { ...options.mapping };
        if (event.target.value === "") delete mapping[field]; else mapping[field] = Number(event.target.value);
        onChange({ ...options, mapping });
      }}><option value="">Not in file</option>{inspection.headers.map((header, index) => <option value={index} key={index}>{header}</option>)}</select></td><td>{fallback ? values ? <select className="field-input" disabled={disabled} aria-label={`Fallback for ${field}`} value={options.defaults[fallback] ?? ""} onChange={event => setDefault(event.target.value)}><option value="">Choose a value</option>{values.map(value => <option key={value} value={value}>{value}</option>)}</select> : <input className="field-input" disabled={disabled} aria-label={`Fallback for ${field}`} type={fallback.endsWith("_date") ? "date" : fallback.endsWith("_seats") || fallback === "annual_cost" ? "number" : "text"} min={0} step={fallback === "annual_cost" ? "0.01" : "1"} value={options.defaults[fallback] ?? ""} onChange={event => setDefault(event.target.value)} /> : <span className="muted">{field === "available_seats" ? "Used only to calculate purchased seats" : "Read from file only"}</span>}</td></tr>;
    })}</tbody></table></div>
    {ignored.length > 0 && <p className="p-5 text-sm muted break-words">Columns not imported: {ignored.join(", ")}</p>}
  </section>;
}
