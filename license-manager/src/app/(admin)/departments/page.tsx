import Link from "next/link";
import { Users } from "lucide-react";
import { PageHeader, EmptyState } from "@/components/shared";
import { DirectoryEditor } from "@/components/directory-editor";
import { db } from "@/lib/db";
import { currencyTotals, money } from "@/lib/calculations";
export const metadata = { title: "Departments" };
export default async function DepartmentsPage() {
  const departments = await db.department.findMany({ include: { licenses: { select: { currency: true, annualCostMinor: true } } }, orderBy: { name: "asc" } });
  return <><PageHeader eyebrow="ORGANIZATION" title="Departments" description="Understand software ownership and spending across your teams."><DirectoryEditor kind="department" /></PageHeader><div className="directory-grid">{departments.map(department => <section className="panel directory-card" key={department.id}><div className="directory-card-top"><span className="product-icon generic"><Users size={20} /></span><DirectoryEditor kind="department" record={department} /></div><h2>{department.name}</h2><p>{department.description || "No description added"}</p><div className="directory-metrics"><div><small>Licenses</small><strong>{department.licenses.length}</strong></div><div className="text-right"><small>Annual commitment</small>{Object.entries(currencyTotals(department.licenses)).map(([currency, total]) => <strong className="block" key={currency}>{money(total, currency, true)}</strong>)}{!department.licenses.length && <strong>—</strong>}</div></div><Link href={`/licenses?department=${department.id}`} className="directory-link">View licenses →</Link></section>)}</div>{!departments.length && <EmptyState title="No departments yet" description="Add a department to assign ownership of your software." />}</>;
}
