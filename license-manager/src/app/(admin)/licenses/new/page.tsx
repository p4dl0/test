import { currentActor } from "@/lib/actor";
import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared";
import { LicenseForm } from "@/components/licenses/license-form";
import { duplicateLicense, getSettings, lookups, organizationToday } from "@/services/licenses";
export const metadata = { title: "Add license" };
export default async function NewLicensePage({ searchParams }: { searchParams: Promise<{ duplicate?: string }> }) {
  await currentActor();
  const { duplicate } = await searchParams;
  const [options, today, settings] = await Promise.all([lookups(), organizationToday(), getSettings()]);
  let initial;
  if (duplicate) { try { initial = await duplicateLicense(duplicate); } catch { notFound(); } }
  return <><PageHeader title={duplicate ? "Duplicate license" : "Add license"} description={duplicate ? "Review this copy before saving. The key, assigned seats, and contract number have been cleared." : "Add a software agreement to your organization’s inventory."} /><LicenseForm initial={initial} options={options} today={today} currency={settings.defaultCurrency} /></>;
}
