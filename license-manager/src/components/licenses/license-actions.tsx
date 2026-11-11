"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Copy, MoreHorizontal, Pencil, Trash2, LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { deleteLicenseAction } from "@/actions/licenses";

export function LicenseActions({ id, name, version, detail = false }: { id: string; name: string; version: number; detail?: boolean }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  function remove() { startTransition(async () => {
    setError("");
    const result = await deleteLicenseAction(id, version);
    if (!result.success) { setError(result.error); return; }
    setOpen(false);
    router.push("/licenses"); router.refresh();
  }); }
  return <>
    {detail && <Button asChild variant="outline"><Link href={`/licenses/new?duplicate=${id}`}><Copy size={15} />Duplicate</Link></Button>}
    {detail && <Button asChild><Link href={`/licenses/${id}/edit`}><Pencil size={15} />Edit license</Link></Button>}
    <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label={`Actions for ${name}`}><MoreHorizontal size={18} /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem asChild><Link href={`/licenses/${id}`}>View details</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={`/licenses/${id}/edit`}><Pencil size={15} />Edit license</Link></DropdownMenuItem><DropdownMenuItem asChild><Link href={`/licenses/new?duplicate=${id}`}><Copy size={15} />Duplicate</Link></DropdownMenuItem><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => setOpen(true)}><Trash2 size={15} />Delete license</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
    <Dialog open={open} onOpenChange={value => { if (!pending) setOpen(value); }}><DialogContent><DialogHeader><DialogTitle>Delete this license?</DialogTitle><DialogDescription>{name} will be removed from your inventory. Its audit history will remain available. This cannot be undone.</DialogDescription></DialogHeader>{error && <p role="alert" className="form-error">{error}</p>}<DialogFooter><Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button><Button variant="destructive" onClick={remove} disabled={pending}>{pending && <LoaderCircle size={15} className="animate-spin" />}Delete license</Button></DialogFooter></DialogContent></Dialog>
  </>;
}
