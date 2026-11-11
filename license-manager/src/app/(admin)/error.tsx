"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) { return <div className="empty-state"><h1>Unable to load this page</h1><p>Please try again. If the issue persists, check the database connection.</p><Button onClick={reset}>Try again</Button></div>; }
