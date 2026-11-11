import { notFound } from "next/navigation";
import { PageHeader } from "@/components/shared";
import { LicenseForm } from "@/components/licenses/license-form";
import { getLicense, getSettings, lookups, organizationToday } from "@/services/licenses";
export const metadata = { title: "Edit license" };
export default async function EditLicensePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [license, options, today, settings] = await Promise.all([getLicense(id), lookups(), organizationToday(), getSettings()]);
  if (!license) notFound();
  return <><PageHeader title="Edit license" description={license.productName} /><LicenseForm initial={license} options={options} today={today} currency={settings.defaultCurrency} /></>;
}
