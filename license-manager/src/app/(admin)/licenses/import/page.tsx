import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { currentActor } from "@/lib/actor";
import { PageHeader } from "@/components/shared";
import { LicenseImport } from "@/components/licenses/license-import";
import { getSettings, lookups, organizationToday } from "@/services/licenses";
import { licenseCsvTemplate } from "@/lib/license-csv";

export const metadata = { title: "Import licenses" };
export default async function ImportLicensesPage() {
  const actor = await currentActor();
  const [options, today, settings] = await Promise.all([lookups(), organizationToday(), getSettings()]);
  const template = licenseCsvTemplate({ vendor: options.vendors[0]?.name ?? "Your vendor", department: options.departments[0]?.name ?? "Your department", ownerEmail: actor.email, today, currency: settings.defaultCurrency });
  return <><Link href="/licenses" className="back-link"><ArrowLeft size={15} />All licenses</Link><PageHeader title="Import licenses" description="Upload a CSV, check the preview, and add your software agreements in one step." /><LicenseImport template={template} /></>;
}
