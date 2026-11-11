export const STATUSES = ["Active", "Expiring Soon", "Expiring", "Expired"] as const;
export type LicenseStatus = (typeof STATUSES)[number];
export const LICENSE_TYPES = ["Subscription", "Perpetual maintenance", "Volume", "OEM", "Trial"] as const;
export const CURRENCIES = ["EUR", "USD", "GBP", "CAD", "AUD", "CHF", "SEK", "NOK", "DKK", "JPY"] as const;
const DAY = 86_400_000;

export function todayInTimezone(timezone = "Europe/Riga", now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10);
}
export function daysRemaining(expirationDate: string, today = todayInTimezone()) {
  return Math.round((Date.parse(`${expirationDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / DAY);
}
export function licenseStatus(days: number): LicenseStatus {
  return days < 0 ? "Expired" : days <= 30 ? "Expiring" : days <= 60 ? "Expiring Soon" : "Active";
}
export function expirationLabel(days: number) {
  if (days === 0) return "Expires today";
  const count = Math.abs(days);
  return days < 0 ? `Expired ${count} day${count === 1 ? "" : "s"} ago` : `Expires in ${count} day${count === 1 ? "" : "s"}`;
}
export function utilization(purchased: number, assigned: number, tracked = true) {
  if (!tracked || purchased <= 0) return null;
  return Math.round(assigned / purchased * 100);
}
export function utilizationTone(purchased: number, assigned: number) {
  const ratio = purchased > 0 ? assigned / purchased : 0;
  return ratio >= 1 ? "full" : ratio > 0.9 ? "high" : ratio < 0.7 ? "low" : "normal";
}
export function expirationGroup(days: number) {
  return days < 0 ? "Expired" : days <= 7 ? "Next 7 days" : days <= 30 ? "Next 30 days" : days <= 60 ? "Next 60 days" : days <= 90 ? "Next 90 days" : "Later";
}
export function money(minor: number, currency = "EUR", compact = false) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency, maximumFractionDigits: compact ? 0 : 2, currencyDisplay: "narrowSymbol" }).format(minor / 100);
}
export function displayDate(date: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(date + "T00:00:00Z"));
}
export function currencyTotals<T extends { currency: string; annualCostMinor: number }>(licenses: T[]) {
  return licenses.reduce<Record<string, number>>((totals, license) => {
    totals[license.currency] = (totals[license.currency] ?? 0) + license.annualCostMinor;
    return totals;
  }, {});
}
