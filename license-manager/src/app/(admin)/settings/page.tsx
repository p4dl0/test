import { PageHeader, Card } from "@/components/shared";
import { SettingsForm } from "@/components/settings-form";
import { getSettings } from "@/services/licenses";
import { currentActor } from "@/lib/actor";
export const metadata = { title: "Settings" };
export default async function SettingsPage() {
  const [settings, actor] = await Promise.all([getSettings(), currentActor()]);
  return <><PageHeader eyebrow="WORKSPACE" title="Settings" description="Manage your organization’s defaults and reminder preferences." /><div className="settings-grid"><SettingsForm settings={settings} /><div className="stack"><Card title="Your workspace"><dl className="details-list"><div><dt>Administrator</dt><dd>{actor.name}</dd></div><div><dt>Email</dt><dd>{actor.email}</dd></div><div><dt>Access</dt><dd>Local demonstration</dd></div><div><dt>Database</dt><dd>SQLite · persistent local storage</dd></div></dl></Card><Card title="Reminder delivery"><div className="panel-body settings-note"><p>Reminders are stored in this application and checked when the workspace is opened. Your administrator can schedule daily checks to generate reminders while the app is closed.</p><p className="mt-3">The current version delivers in-app reminders. Email delivery can be added through the notification channel interface.</p></div></Card></div></div></>;
}
