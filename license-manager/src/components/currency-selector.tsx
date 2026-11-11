"use client";
import { useRouter, usePathname } from "next/navigation";
export function CurrencySelector({ currency, currencies }: { currency: string; currencies: string[] }) {
  const router = useRouter(), pathname = usePathname();
  return <select className="currency-select" aria-label="Reporting currency" value={currency} onChange={event => router.push(`${pathname}?currency=${event.target.value}`)}>{currencies.map(code => <option key={code} value={code}>{code} · Reporting currency</option>)}</select>;
}
