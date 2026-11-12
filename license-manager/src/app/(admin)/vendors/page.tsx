import { currentActor } from "@/lib/actor";
import Link from "next/link";
import { PageHeader, ProductIcon, EmptyState } from "@/components/shared";
import { DirectoryEditor } from "@/components/directory-editor";
import { db } from "@/lib/db";
import { currencyTotals, money } from "@/lib/calculations";
export const metadata = { title: "Vendors" };
export default async function VendorsPage() {
  await currentActor();
  const vendors = await db.vendor.findMany({ include: { licenses: { select: { currency: true, annualCostMinor: true } } }, orderBy: { name: "asc" } });
  return <><PageHeader eyebrow="SOFTWARE PROVIDERS" title="Vendors" description={`${vendors.length} vendors supporting your organization’s software portfolio.`}><DirectoryEditor kind="vendor" /></PageHeader><div className="directory-grid">{vendors.map(vendor => <section className="panel directory-card" key={vendor.id}><div className="directory-card-top"><ProductIcon name={vendor.name} /><DirectoryEditor kind="vendor" record={vendor} /></div><h2>{vendor.name}</h2><p>{vendor.contact || "No contact information added"}</p>{vendor.website && <a className="text-link mt-2" href={vendor.website} target="_blank" rel="noreferrer">Visit website ↗</a>}<div className="directory-metrics"><div><small>Licenses</small><strong>{vendor.licenses.length}</strong></div><div className="text-right"><small>Annual commitment</small>{Object.entries(currencyTotals(vendor.licenses)).map(([currency, total]) => <strong className="block" key={currency}>{money(total, currency, true)}</strong>)}{!vendor.licenses.length && <strong>—</strong>}</div></div><Link href={`/licenses?vendor=${vendor.id}`} className="directory-link">View licenses →</Link></section>)}</div>{!vendors.length && <EmptyState title="No vendors yet" description="Add a software provider to begin organizing licenses." />}</>;
}
