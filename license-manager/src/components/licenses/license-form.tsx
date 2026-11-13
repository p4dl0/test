"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { LoaderCircle, LockKeyhole, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CURRENCIES, LICENSE_TYPES } from "@/lib/calculations";
import { licenseSchema, licenseEditSchema } from "@/lib/validation/license";
import { saveLicenseAction } from "@/actions/licenses";
import type { LicenseView, lookups } from "@/services/licenses";

type Initial = Partial<Omit<LicenseView, "id">> & { id?: string };
type Lookups = Awaited<ReturnType<typeof lookups>>;
export function LicenseForm({ initial, options, today, currency }: { initial?: Initial; options: Lookups; today: string; currency: string }) {
  const touched = useRef(new Set<string>());
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string[]>>({});
  const [tracking, setTracking] = useState(initial?.seatTracking ?? true);
  const [annual, setAnnual] = useState(initial?.annualCostMinor == null ? "" : String(initial.annualCostMinor / 100));
  const [monthly, setMonthly] = useState(initial?.annualCostMinor == null ? "" : (initial.annualCostMinor / 1200).toFixed(2));
  const router = useRouter();
  const edit = Boolean(initial?.id);
  function field(name: string, label: string, children: React.ReactNode, hint?: string) {
    const optional = ["purchasedSeats", "assignedSeats", "departmentId", "responsibleUserId", "purchaseDate", "startDate", "expirationDate", "annualCostMinor"].includes(name);
    return <div className="form-field"><label htmlFor={name}>{edit && optional ? label.replace(" *", "") : label}</label>{children}{hint && <small>{hint}</small>}{fields[name] && <span className="field-error" id={`${name}-error`}>{fields[name][0]}</span>}</div>;
  }
  function input(name: string, label: string, value: string | number = "", type = "text", required = false, hint?: string) {
    return field(name, label, <input className="field-input" id={name} name={name} type={type} defaultValue={value} required={required} aria-invalid={Boolean(fields[name])} aria-describedby={fields[name] ? `${name}-error` : undefined} {...(type === "number" ? { min: 0, max: 1000000, step: 1 } : {})} />, hint);
  }
  return <form className="license-form" onChange={event => {
    const target = event.target;
    if (!(target instanceof HTMLInputElement || target instanceof HTMLSelectElement || target instanceof HTMLTextAreaElement)) return;
    const name = target.name || target.id;
    touched.current.add(name === "monthlyCost" ? "annualCostMinor" : name);
  }} onSubmit={event => {
    event.preventDefault(); setError(""); setFields({});
    const form = new FormData(event.currentTarget);
    const values = Object.fromEntries(form);
    const quantity = (value: FormDataEntryValue | undefined) => {
      if (value === "" || value === undefined) return null;
      const number = Number(value);
      return !tracking && Number.isFinite(number) ? 0 : number;
    };
    const input = { ...values, seatTracking: tracking, purchasedSeats: quantity(values.purchasedSeats), assignedSeats: quantity(values.assignedSeats), annualCostMinor: annual === "" ? null : Math.round(Number(annual) * 100), autoRenewal: form.has("autoRenewal"), clearKey: form.has("clearKey") };
    const parsed = (edit ? licenseEditSchema : licenseSchema).safeParse(input);
    if (!parsed.success) {
      const errors: Record<string, string[]> = {};
      for (const issue of parsed.error.issues) (errors[String(issue.path[0])] ??= []).push(issue.message);
      setFields(errors); setError("Please correct the highlighted fields."); return;
    }
    startTransition(async () => {
      // Disabling tracking also changes known counts, even when their inputs were untouched.
      const changes = edit ? Object.fromEntries(Object.entries(parsed.data).filter(([name]) =>
        touched.current.has(name) || (!tracking && ["purchasedSeats", "assignedSeats"].includes(name))
      )) : parsed.data;
      const result = await saveLicenseAction(changes, initial?.id, initial?.version);
      if (!result.success) { setError(result.error); setFields(result.fields ?? {}); return; }
      router.push(`/licenses/${result.data.id}`); router.refresh();
    });
  }}>
    {error && <div role="alert" className="form-error-banner">{error}</div>}
    <fieldset disabled={pending} className="form-sections">
      <section className="panel form-section"><div className="section-heading"><span>01</span><div><h2>Product information</h2><p>The software and the agreement behind it.</p></div></div><div className="form-grid">
        {input("productName", "Product name *", initial?.productName, "text", true)}
        {field("vendorId", "Vendor *", <select className="field-input" id="vendorId" name="vendorId" defaultValue={initial?.vendorId ?? ""} required><option value="" disabled>Select vendor</option>{options.vendors.map(vendor => <option key={vendor.id} value={vendor.id}>{vendor.name}</option>)}</select>)}
        {field("licenseType", "License type *", <select className="field-input" id="licenseType" name="licenseType" defaultValue={initial?.licenseType ?? "Subscription"}>{LICENSE_TYPES.map(type => <option key={type}>{type}</option>)}</select>)}
        {field("licenseKey", edit ? "Replace license key" : "License key or identifier", <input className="field-input font-mono" id="licenseKey" name="licenseKey" type="password" autoComplete="new-password" maxLength={1000} placeholder={initial?.keySuffix ? `Stored: XXXXX-XXXXX-XXXXX-${initial.keySuffix}` : "Optional identifier"} />, edit ? "Leave blank to keep the stored key." : "Encrypted at rest and masked in the inventory.")}
        {edit && initial?.keySuffix && <label className="checkbox-label"><input type="checkbox" name="clearKey" />Remove the stored license key</label>}
      </div></section>
      <section className="panel form-section"><div className="section-heading"><span>02</span><div><h2>Seats & ownership</h2><p>Track allocation and keep responsibilities clear.</p></div></div><label className="checkbox-label mb-5"><input type="checkbox" name="seatTracking" checked={tracking} onChange={event => setTracking(event.target.checked)} />Track purchased and assigned seats</label><div className="form-grid">
        {input("purchasedSeats", "Purchased seats *", initial ? initial.purchasedSeats ?? "" : 1, "number", !edit)}
        {input("assignedSeats", "Assigned seats *", initial ? initial.assignedSeats ?? "" : 0, "number", !edit)}
        {field("departmentId", "Department *", <select className="field-input" id="departmentId" name="departmentId" defaultValue={initial?.departmentId ?? ""} required={!edit}><option value="" disabled={!edit}>Select department</option>{options.departments.map(department => <option key={department.id} value={department.id}>{department.name}</option>)}</select>)}
        {field("responsibleUserId", "Responsible person *", <select className="field-input" id="responsibleUserId" name="responsibleUserId" defaultValue={initial?.responsibleUserId ?? ""} required={!edit}><option value="" disabled={!edit}>Select person</option>{options.users.map(user => <option key={user.id} value={user.id}>{user.name}</option>)}</select>)}
      </div></section>
      <section className="panel form-section"><div className="section-heading"><span>03</span><div><h2>Dates & renewal</h2><p>Expiration status is calculated automatically.</p></div></div><div className="form-grid">
        {input("purchaseDate", "Purchase date *", initial ? initial.purchaseDate ?? "" : today, "date", !edit)}
        {input("startDate", "Start date *", initial ? initial.startDate ?? "" : today, "date", !edit)}
        {input("expirationDate", "Expiration date *", initial?.expirationDate ?? "", "date", !edit)}
        {input("renewalDate", "Renewal date", initial?.renewalDate ?? "", "date")}
      </div><label className="checkbox-label mt-5"><input name="autoRenewal" type="checkbox" defaultChecked={initial?.autoRenewal ?? false} />This license renews automatically</label></section>
      <section className="panel form-section"><div className="section-heading"><span>04</span><div><h2>Financial & contract information</h2><p>Enter an annual commitment or its monthly equivalent.</p></div></div><div className="form-grid">
        {field("annualCostMinor", "Annual cost *", <input className="field-input" id="annualCostMinor" type="number" min="0" max="20000000" step="0.01" required={!edit} value={annual} onChange={event => { setAnnual(event.target.value); setMonthly(event.target.value === "" ? "" : (Number(event.target.value) / 12).toFixed(2)); }} />)}
        {field("monthlyCost", "Monthly equivalent", <input className="field-input" id="monthlyCost" type="number" min="0" step="0.01" required={!edit} value={monthly} onChange={event => { setMonthly(event.target.value); setAnnual(event.target.value === "" ? "" : (Number(event.target.value) * 12).toFixed(2)); }} />, "Annual cost ÷ 12. This is not invoice history.")}
        {field("currency", "Currency *", <select className="field-input" id="currency" name="currency" defaultValue={initial?.currency ?? currency}>{CURRENCIES.map(code => <option key={code}>{code}</option>)}</select>)}
        {input("supplier", "Supplier / reseller", initial?.supplier)}
        {input("contractNumber", "Contract number", initial?.contractNumber)}
      </div></section>
      <section className="panel form-section"><div className="section-heading"><span>05</span><div><h2>Additional notes</h2><p>Renewal instructions, internal context, or procurement details.</p></div></div>{field("notes", "Notes", <textarea className="field-input" id="notes" name="notes" rows={4} maxLength={5000} defaultValue={initial?.notes ?? ""} placeholder="Add any information your team should know…" />)}</section>
    </fieldset>
    <div className="form-footer"><span><LockKeyhole size={15} />Keys are encrypted. Changes are recorded.</span><div><Button variant="outline" asChild><Link href={initial?.id ? `/licenses/${initial.id}` : "/licenses"}>Cancel</Link></Button><Button type="submit" disabled={pending}>{pending ? <LoaderCircle size={16} className="animate-spin" /> : <Save size={16} />}{pending ? "Saving…" : edit ? "Save changes" : "Create license"}</Button></div></div>
  </form>;
}
