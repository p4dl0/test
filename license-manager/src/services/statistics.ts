import "server-only";
import { listLicenses, getSettings, organizationToday } from "@/services/licenses";
import { STATUSES, daysRemaining } from "@/lib/calculations";

export async function statistics(requestedCurrency?: string) {
  const [{ licenses }, settings, today] = await Promise.all([listLicenses({}, false), getSettings(), organizationToday()]);
  const currencies = [...new Set([settings.defaultCurrency, ...licenses.map(license => license.currency)])].sort();
  const currency = currencies.includes(requestedCurrency ?? "") ? requestedCurrency! : settings.defaultCurrency;
  const financial = licenses.filter((license): license is typeof license & { annualCostMinor: number } => license.currency === currency && license.annualCostMinor !== null);
  const annual = financial.reduce((sum, license) => sum + license.annualCostMinor, 0);
  const expiring = licenses.filter(license => license.days >= 0 && license.days <= 60);
  const expired = licenses.filter(license => license.days < 0);
  const tracked = financial.filter((license): license is typeof license & { purchasedSeats: number; assignedSeats: number } => license.seatTracking && license.purchasedSeats !== null && license.assignedSeats !== null);
  const purchased = tracked.reduce((sum, license) => sum + license.purchasedSeats, 0);
  const assigned = tracked.reduce((sum, license) => sum + license.assignedSeats, 0);
  const underutilized = tracked.filter(license => license.purchasedSeats > 0 && license.assignedSeats / license.purchasedSeats < .7);
  const statuses = STATUSES.map(name => ({ name, value: licenses.filter(license => license.status === name).length }));
  const vendors = Object.entries(licenses.reduce<Record<string, number>>((map, license) => { map[license.vendor.name] = (map[license.vendor.name] ?? 0) + 1; return map; }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const vendorChart = vendors.length > 6 ? [...vendors.slice(0, 5), { name: "Other vendors", value: vendors.slice(5).reduce((sum, item) => sum + item.value, 0) }] : vendors;
  const costs = (field: "vendor" | "department") => Object.entries(financial.reduce<Record<string, number>>((map, license) => { const name = (license[field]?.name ?? "Not assigned"); map[name] = (map[name] ?? 0) + license.annualCostMinor; return map; }, {})).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  const monthly = Array.from({ length: 12 }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const start = first.toISOString().slice(0, 10), end = last.toISOString().slice(0, 10);
    const value = financial.reduce((sum, license) => {
      if (!license.startDate || !license.expirationDate) return sum;
      const from = license.startDate > start ? license.startDate : start;
      const to = license.expirationDate < end ? license.expirationDate : end;
      return sum + (to < from ? 0 : license.annualCostMinor / 12 * (daysRemaining(to, from) + 1) / last.getUTCDate());
    }, 0);
    return { name: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(first), period: start.slice(0, 7), value: Math.round(value) };
  });
  const upcoming = Array.from({ length: 6 }, (_, index) => {
    const date = new Date(`${today}T00:00:00Z`);
    const first = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + index, 1));
    const prefix = first.toISOString().slice(0, 7);
    return { name: new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" }).format(first), value: licenses.filter(license => license.days >= 0 && license.expirationDate?.startsWith(prefix)).length };
  });
  return { licenses, financial, currency, currencies, annual, expiring, expired, statuses, vendorChart, monthly, upcoming, vendorCosts: costs("vendor"), departmentCosts: costs("department"), purchased, assigned, underutilized,
    expiringValue: financial.filter(license => license.days >= 0 && license.days <= 90).reduce((sum, license) => sum + license.annualCostMinor, 0),
    unusedValue: underutilized.reduce((sum, license) => sum + license.annualCostMinor * (1 - license.assignedSeats / license.purchasedSeats), 0),
  };
}
