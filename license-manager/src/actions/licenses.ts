"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createLicense, updateLicense, deleteLicense, revealLicenseKey } from "@/services/licenses";
import type { ActionResult } from "@/lib/action-result";

function invalidate(id?: string) {
  for (const path of ["/", "/licenses", "/expirations", "/reports", "/vendors", "/departments", "/audit-log", "/notifications"]) revalidatePath(path);
  if (id) revalidatePath(`/licenses/${id}`);
}
function failure(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return { success: false, error: "Please correct the highlighted fields.", fields: z.flattenError(error).fieldErrors as Record<string, string[]> };
  if (error instanceof Error && error.message.includes("changed")) return { success: false, error: error.message };
  console.error("License operation failed:", error instanceof Error ? error.name : "Unknown error");
  return { success: false, error: "The operation could not be completed. Check the selected records and try again." };
}
export async function saveLicenseAction(input: unknown, id?: string, version?: number): Promise<ActionResult> {
  try {
    const data = id ? await updateLicense(id, z.number().int().positive().parse(version), input) : await createLicense(input);
    invalidate(data.id);
    return { success: true, data };
  } catch (error) { return failure(error); }
}
export async function deleteLicenseAction(id: string, version: number): Promise<ActionResult> {
  try {
    await deleteLicense(z.string().min(1).parse(id), z.number().int().positive().parse(version));
    invalidate(id);
    return { success: true, data: { id } };
  } catch (error) { return failure(error); }
}
export async function revealLicenseKeyAction(id: string): Promise<ActionResult<string | null>> {
  try {
    const data = await revealLicenseKey(z.string().min(1).parse(id));
    revalidatePath("/audit-log");
    return { success: true, data };
  } catch (error) { return failure(error); }
}
