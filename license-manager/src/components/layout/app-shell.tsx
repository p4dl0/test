"use client";

import { logoutAction } from "@/actions/auth";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Activity, Bell, Building2, ChartNoAxesCombined, ChevronDown, CircleHelp, ClipboardList, Clock3, LayoutDashboard, Menu, Settings, ShieldCheck, Users } from "lucide-react";
import { GlobalSearch } from "@/components/layout/global-search";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

const navigation = [
  ["/", "Dashboard", LayoutDashboard], ["/licenses", "Licenses", ClipboardList], ["/expirations", "Expirations", Clock3],
  ["/vendors", "Vendors", Building2], ["/departments", "Departments", Users], ["/reports", "Reports", ChartNoAxesCombined],
  ["/notifications", "Notifications", Bell], ["/audit-log", "Audit Log", Activity], ["/settings", "Settings", Settings],
] as const;

export function AppShell({ children, user, organization, unread }: { children: React.ReactNode; user: { name: string; email: string }; organization: string; unread: number }) {
  const pathname = usePathname();
  const [mobile, setMobile] = useState(false);
  const active = navigation.find(([href]) => href === "/" ? pathname === "/" : pathname.startsWith(href));
  const initials = user.name.split(" ").map(part => part[0]).slice(0, 2).join("");
  const sidebar = <>
    <Link href="/" className="brand" onClick={() => setMobile(false)}><span className="brand-mark"><ShieldCheck size={22} strokeWidth={1.8} /></span><span>License<span className="brand-light">Manager</span></span></Link>
    <div className="workspace"><span className="workspace-avatar">N</span><div><strong>{organization}</strong><small>Organization workspace</small></div></div>
    <div className="nav-label">WORKSPACE</div>
    <nav aria-label="Main navigation" className="main-nav">{navigation.map(([href, label, Icon], index) => <Link key={href} href={href} onClick={() => setMobile(false)} className={`nav-link ${active?.[0] === href ? "active" : ""} ${index === 6 ? "nav-separator" : ""}`} aria-current={active?.[0] === href ? "page" : undefined}><Icon size={18} strokeWidth={1.7} /><span>{label}</span>{label === "Notifications" && unread > 0 && <span className="nav-count">{unread}</span>}</Link>)}</nav>
    <div className="sidebar-bottom"><div className="local-status"><span className="live-dot" />Local workspace<span>v1.0</span></div><Link href="/settings" className="help-link"><CircleHelp size={16} />Workspace settings</Link></div>
  </>;
  return <div className="app-shell">
    <aside className="sidebar">{sidebar}</aside>
    <Sheet open={mobile} onOpenChange={setMobile}><SheetContent side="left" className="mobile-sidebar"><SheetTitle className="sr-only">Navigation</SheetTitle>{sidebar}</SheetContent></Sheet>
    <div className="main-shell">
      <header className="topbar"><div className="topbar-left"><button className="icon-button mobile-menu" aria-label="Open navigation" onClick={() => setMobile(true)}><Menu size={20} /></button><span className="breadcrumb">Workspace <span>/</span> <strong>{active?.[1] ?? "Licenses"}</strong></span></div><div className="topbar-right"><GlobalSearch /><Link href="/notifications" className="icon-button notification-button" aria-label={`Notifications, ${unread} unread`}><Bell size={19} />{unread > 0 && <span className="notification-dot" />}</Link><span className="topbar-divider" /><DropdownMenu><DropdownMenuTrigger className="profile-trigger"><span className="avatar">{initials}</span><span className="profile-name">{user.name}<small>Administrator</small></span><ChevronDown size={14} /></DropdownMenuTrigger><DropdownMenuContent align="end" className="w-60"><div className="px-3 py-2 text-xs text-muted-foreground">{user.email}<br />Administrator</div><DropdownMenuItem asChild><Link href="/settings">Workspace settings</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href="/audit-log">View activity</Link></DropdownMenuItem><form action={logoutAction}><button type="submit" className="px-3 py-2 text-sm w-full text-left">Sign out</button></form></DropdownMenuContent></DropdownMenu></div></header>
      <main id="main-content" className="page-content">{children}</main>
      <footer className="app-footer"><span>License Manager <span className="footer-dot">·</span> Your software, accounted for.</span><span><span className="live-dot" /> Connected to local database</span></footer>
    </div>
  </div>;
}
