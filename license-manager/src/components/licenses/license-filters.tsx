"use client";
import Link from "next/link";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LICENSE_TYPES, STATUSES } from "@/lib/calculations";
import type { LicenseFilters, lookups } from "@/services/licenses";

export function LicenseFiltersBar({ options, filters }: { options: Awaited<ReturnType<typeof lookups>>; filters: LicenseFilters }) {
  const active = ["q", "vendor", "status", "department", "owner", "period", "type"].some(key => Boolean(filters[key]));
  function select(name: string, label: string, items: { id: string; name: string }[]) {
    return <select name={name} aria-label={label} defaultValue={filters[name] ?? ""} onChange={event => event.currentTarget.form?.requestSubmit()} className="filter-select"><option value="">{label}</option>{items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
  }
  return <form action="/licenses" className="filter-bar" key={JSON.stringify(filters)}><div className="filter-main"><div className="table-search"><Search size={16} /><input name="q" aria-label="Search licenses" defaultValue={filters.q ?? ""} placeholder="Search licenses, vendors, owners…" /></div><Button type="submit" variant="outline" size="sm"><Search size={14} />Search</Button><span className="filter-label"><SlidersHorizontal size={15} />Filters</span></div><div className="filter-options">
    {select("vendor", "All vendors", options.vendors)}
    {select("status", "All statuses", STATUSES.map(name => ({ id: name, name })))}
    {select("department", "All departments", options.departments)}
    {select("owner", "All owners", options.users)}
    {select("period", "Any expiration", [{ id: "expired", name: "Already expired" }, ...[7, 30, 60, 90].map(days => ({ id: String(days), name: `Within ${days} days` })), { id: "later", name: "After 90 days" }])}
    {select("type", "All license types", LICENSE_TYPES.map(name => ({ id: name, name })))}
    {filters.sort && <input type="hidden" name="sort" value={filters.sort} />}{filters.direction && <input type="hidden" name="direction" value={filters.direction} />}
    {active && <Link href="/licenses" className="clear-filters"><X size={13} />Clear</Link>}
  </div></form>;
}
