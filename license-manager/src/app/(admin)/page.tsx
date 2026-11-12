import { currentActor } from "@/lib/actor";
import Link from "next/link";
import { ArrowRight, CircleCheck, Clock3, CreditCard, Layers, Plus, TriangleAlert, Wallet, XCircle } from "lucide-react";
import { PageHeader, Card, ProductIcon, StatusBadge, UtilizationBar, ExpirationLabel } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { CurrencySelector } from "@/components/currency-selector";
import { CostChart, ExpirationChart, StatusChart, VendorChart } from "@/components/charts/dashboard-charts";
import { statistics } from "@/services/statistics";
import { displayDate, money } from "@/lib/calculations";
export default async function Dashboard({ searchParams }: { searchParams: Promise<{ currency?: string }> }) {
  await currentActor();
  const stats = await statistics((await searchParams).currency);
  const soon = stats.licenses.filter(license => license.days >= 0).sort((a, b) => a.days - b.days).slice(0, 5);
  const cards = [
    { label: "Total Licenses", value: stats.licenses.length, icon: Layers, color: "blue", foot: "Across your organization" },
    { label: "Active Licenses", value: stats.statuses[0].value, icon: CircleCheck, color: "green", foot: "More than 60 days remaining" },
    { label: "Expiring Soon", value: stats.expiring.length, icon: Clock3, color: "amber", foot: "Within the next 60 days" },
    { label: "Expired Licenses", value: stats.expired.length, icon: XCircle, color: "red", foot: "Require your attention" },
    { label: "Monthly Cost", value: money(stats.annual / 12, stats.currency, true), icon: CreditCard, color: "purple", foot: "Normalized inventory cost", financial: true },
    { label: "Annual Cost", value: money(stats.annual, stats.currency, true), icon: Wallet, color: "teal", foot: `${stats.currency} · Annualized inventory cost`, financial: true },
  ];
  return <><PageHeader eyebrow="WORKSPACE OVERVIEW" title="Dashboard" description="A clear view of your licenses, spending, and upcoming renewals."><CurrencySelector currency={stats.currency} currencies={stats.currencies} /><Button asChild><Link href="/licenses/new"><Plus size={16} />Add license</Link></Button></PageHeader>
    <div className="summary-grid">{cards.map(({ label, value, icon: Icon, color, foot, financial }) => <div key={label} className={`panel summary-card ${financial ? "money-card" : ""}`}><div className="summary-card-header"><span>{label}</span><span className={`stat-icon ${color}`}><Icon size={17} strokeWidth={1.7} /></span></div><div className="stat-value">{value}</div><div className="stat-foot">{foot}</div></div>)}</div>
    <div className="attention-banner"><TriangleAlert size={17} /><span><strong>{stats.expiring.length} licenses are approaching expiration.</strong> {stats.expired.length ? `${stats.expired.length} expired licenses also need review.` : "Keep your team working without interruptions."}</span><Link href="/expirations">Review expirations <ArrowRight size={13} /></Link></div>
    <div className="dashboard-charts"><Card title="Monthly license costs" description={`Projected commitments · ${stats.currency} · next 12 months`}><CostChart data={stats.monthly} currency={stats.currency} /><p className="chart-note">Based on recorded terms, prorated by covered days. Future renewals are not assumed.</p></Card><Card title="Licenses by status" description="The health of your software portfolio"><StatusChart data={stats.statuses} /></Card></div>
    <div className="dashboard-charts secondary-charts"><Card title="Licenses by vendor" description="Agreements across your software providers"><VendorChart data={stats.vendorChart} /></Card><Card title="Upcoming expirations" description="Unexpired agreements due over the next 6 months"><ExpirationChart data={stats.upcoming} /></Card></div>
    <Card title="Upcoming renewals" description="Your next agreements to review, ordered by expiration date." href="/expirations"><div className="table-scroll"><table className="data-table"><thead><tr><th>Product / Vendor</th><th>Status</th><th>Utilization</th><th>Expiration date</th><th>Annual cost</th><th>Owner</th></tr></thead><tbody>{soon.map(license => <tr key={license.id}><td><div className="product-cell"><ProductIcon name={license.vendor.name} /><div><Link className="product-name" href={`/licenses/${license.id}`}>{license.productName}</Link><span>{license.vendor.name}</span></div></div></td><td><StatusBadge status={license.status} /></td><td><UtilizationBar purchased={license.purchasedSeats} assigned={license.assignedSeats} tracked={license.seatTracking} /></td><td><div className="date-cell"><strong>{displayDate(license.expirationDate)}</strong><ExpirationLabel days={license.days} /></div></td><td className="cost-cell">{money(license.annualCostMinor, license.currency)}</td><td className="muted">{license.responsibleUser.name}</td></tr>)}</tbody></table>{!soon.length && <p className="p-8 text-center muted">No upcoming renewals.</p>}</div></Card>
  </>;
}
