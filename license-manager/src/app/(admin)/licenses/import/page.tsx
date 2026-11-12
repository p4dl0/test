import { MicrosoftImport } from "@/components/licenses/microsoft-import";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { currentActor } from "@/lib/actor";
import { PageHeader } from "@/components/shared";
import { LicenseImport } from "@/components/licenses/license-import";
import { getSettings, lookups } from "@/services/licenses";

export const metadata = { title: "Import licenses" };
export default async function ImportLicensesPage() {
  const actor = await currentActor();
  const [options, settings] = await Promise.all([lookups(), getSettings()]);
  const directories = { vendors: options.vendors.map(vendor => vendor.name), departments: options.departments.map(department => department.name), owners: options.users.map(user => user.email) };
  const initialDefaults = { vendor: options.vendors.find(vendor => vendor.name.toLowerCase() === "microsoft")?.name ?? "", owner_email: actor.email, license_type: "Subscription", currency: settings.defaultCurrency };
  return <><Link href="/licenses" className="back-link"><ArrowLeft size={15} />All licenses</Link><PageHeader title="Import licenses" description="Upload a CSV, check the preview, and add your software agreements in one step." /><MicrosoftImport /><details className="mt-6"><summary className="cursor-pointer">Other CSV formats / template import</summary><LicenseImport directories={directories} initialDefaults={initialDefaults} /></details></>;
}
