import Link from "next/link";
export default function NotFound() { return <div className="empty-state"><h1>Page not found</h1><p>The requested page or license is no longer available.</p><Link href="/licenses" className="text-link">Return to licenses →</Link></div>; }
