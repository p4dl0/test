import { currentActor } from "@/lib/actor";
import Link from "next/link";
import { CalendarClock } from "lucide-react";
import { PageHeader, ProductIcon, StatusBadge, ExpirationLabel, EmptyState } from "@/components/shared";
import { listLicenses } from "@/services/licenses";
import { displayDate, expirationGroup, money } from "@/lib/calculations";
export const metadata = { title: "Expirations" };
const groups = ["Expired", "Next 7 days", "Next 30 days", "Next 60 days", "Next 90 days", "Later", "Unknown expiration"];
export default async function ExpirationsPage() {
  await currentActor();
  const { licenses } = await listLicenses({ sort: "expirationDate" }, false);
  return <><PageHeader eyebrow="RENEWAL PLANNING" title="Expirations" description="Stay ahead of deadlines and keep your organization covered." /><div className="expirations-tabs">{groups.map((group, index) => <a className="panel expiration-tab" href={`#group-${index}`} key={group}><span>{group}</span><strong className={index === 0 ? "text-red" : index <= 2 ? "text-orange" : ""}>{licenses.filter(license => expirationGroup(license.days) === group).length}</strong></a>)}</div><div className="stack">{groups.map((group, index) => {
    const items = licenses.filter(license => expirationGroup(license.days) === group);
    return <section className="panel expiration-group" id={`group-${index}`} key={group}><div className="panel-header"><h2><CalendarClock size={16} className="muted" />{group}<span className="count-badge">{items.length}</span></h2><span className="muted text-[10px]">{index === 0 ? "Before today" : index === 1 ? "Today through day 7" : index === 2 ? "Days 8–30" : index === 3 ? "Days 31–60" : index === 4 ? "Days 61–90" : index === 6 ? "No expiration recorded" : "After 90 days"}</span></div>{items.length ? items.map(license => <div className="expiration-row" key={license.id}><div className="product-cell"><ProductIcon name={license.vendor.name} /><div><Link className="product-name" href={`/licenses/${license.id}`}>{license.productName}</Link><span>{(license.department?.name ?? "Not assigned")} · {(license.responsibleUser?.name ?? "Not assigned")}</span></div></div><StatusBadge status={license.status} /><div className="date-cell"><strong>{displayDate(license.expirationDate)}</strong><ExpirationLabel days={license.days} /></div><span className="expiration-cost">{money(license.annualCostMinor, license.currency)}<small className="cell-sub">annual commitment</small></span><Link href={`/licenses/${license.id}`} className="text-link">Review →</Link></div>) : <div className="py-7 px-6 text-xs muted">No licenses in this period.</div>}</section>;
  })}</div>{!licenses.length && <EmptyState title="No expirations to track" description="Add your first license to start planning renewals." />}</>;
}
