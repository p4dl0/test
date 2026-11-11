"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Search, LoaderCircle } from "lucide-react";

type Result = { id: string; productName: string; vendor: string };
export function GlobalSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const abort = new AbortController();
    const timer = setTimeout(async () => {
      if (!query.trim()) { setResults([]); setLoading(false); return; }
      setLoading(true); setError(false);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, { signal: abort.signal });
        if (!response.ok) throw new Error("Search unavailable");
        setResults(await response.json());
      } catch (error) { if (!abort.signal.aborted) { setResults([]); setError(true); } void error; }
      finally { if (!abort.signal.aborted) setLoading(false); }
    }, 200);
    return () => { clearTimeout(timer); abort.abort(); };
  }, [query]);
  useEffect(() => {
    const outside = (event: MouseEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", outside);
    return () => document.removeEventListener("mousedown", outside);
  }, []);
  return <div className="global-search" ref={root}><Search size={16} /><form action="/licenses"><input aria-label="Global search" placeholder="Search anything..." name="q" autoComplete="off" value={query} onFocus={() => setOpen(true)} onChange={event => { setQuery(event.target.value); setOpen(true); }} onKeyDown={event => { if (event.key === "Escape") setOpen(false); }} /></form>{open && query.trim() && <div className="search-results">{loading ? <div className="search-state"><LoaderCircle size={15} className="animate-spin" />Searching…</div> : error ? <div className="search-state">Search is unavailable. Try again.</div> : results.length ? results.map(result => <Link key={result.id} href={`/licenses/${result.id}`} onClick={() => { setOpen(false); setQuery(""); }}><strong>{result.productName}</strong><small>{result.vendor}</small></Link>) : <div className="search-state">No matching licenses</div>}<Link className="search-all" href={`/licenses?q=${encodeURIComponent(query)}`} onClick={() => setOpen(false)}>View all search results →</Link></div>}</div>;
}
