import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { authenticatedActor } from "@/lib/actor";
import { licenseWhere, organizationToday } from "@/services/licenses";
export async function GET(request: NextRequest) {
  if (!(await authenticatedActor())) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const q = request.nextUrl.searchParams.get("q")?.trim().slice(0, 200);
  if (!q) return NextResponse.json([]);
  const records = await db.license.findMany({ where: licenseWhere({ q }, await organizationToday()), select: { id: true, productName: true, vendor: { select: { name: true } } }, take: 6, orderBy: { productName: "asc" } });
  return NextResponse.json(records.map(record => ({ ...record, vendor: record.vendor.name })), { headers: { "Cache-Control": "no-store" } });
}
