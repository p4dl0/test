import Link from "next/link";
import { Plus, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { LicenseFiltersBar } from "@/components/licenses/license-filters";
import { LicenseTable } from "@/components/licenses/license-table";
import { listLicenses, lookups, type LicenseFilters } from "@/services/licenses";
export const metadata = { title: "Licenses" };
export default async function LicensesPage({ searchParams }: { searchParams: Promise<LicenseFilters> }) {
  const filters = await searchParams;
  const [result, options] = await Promise.all([listLicenses(filters), lookups()]);
  return <><PageHeader eyebrow="YOUR SOFTWARE INVENTORY" title="Licenses" description="Every license, owner, and renewal. All in one place."><Button asChild><Link href="/licenses/new"><Plus size={16} />Add license</Link></Button></PageHeader><div className="panel inventory-panel"><div className="inventory-heading"><h2>All licenses <span className="count-badge">{result.total}</span></h2><span><ShieldCheck size={14} />License keys are protected</span></div><LicenseFiltersBar options={options} filters={filters} /><LicenseTable result={result} filters={filters} /></div></>;
}
