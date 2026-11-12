"use server";
import { currentActor } from "@/lib/actor";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { saveDirectory, deleteDirectory, saveSettings } from "@/services/directories";
import { generateNotifications, markNotificationsRead } from "@/services/notifications";
import type { ActionResult } from "@/lib/action-result";

function failure(error: unknown): ActionResult<never> {
  if (error instanceof z.ZodError) return { success: false, error: error.issues.map(issue => issue.message).join(". ") };
  if (error instanceof Error && error.message.startsWith("Reassign")) return { success: false, error: error.message };
  return { success: false, error: "Unable to save. Names must be unique and referenced records must exist." };
}
export async function saveDirectoryAction(kind: "vendor" | "department", input: unknown, id?: string): Promise<ActionResult> {
  await currentActor();
  try { z.enum(["vendor", "department"]).parse(kind); const data = await saveDirectory(kind, input, id); revalidatePath("/", "layout"); return { success: true, data: { id: data.id } }; }
  catch (error) { return failure(error); }
}
export async function deleteDirectoryAction(kind: "vendor" | "department", id: string): Promise<ActionResult> {
  await currentActor();
  try { z.enum(["vendor", "department"]).parse(kind); await deleteDirectory(kind, id); revalidatePath("/", "layout"); return { success: true, data: { id } }; }
  catch (error) { return failure(error); }
}
export async function saveSettingsAction(input: unknown): Promise<ActionResult> {
  await currentActor();
  try { await saveSettings(input); revalidatePath("/", "layout"); return { success: true, data: { id: "organization" } }; }
  catch (error) { return failure(error); }
}
export async function markReadAction(id?: string): Promise<ActionResult> {
  await currentActor();
  try { await markNotificationsRead(id); revalidatePath("/", "layout"); return { success: true, data: { id: id ?? "all" } }; }
  catch (error) { return failure(error); }
}
export async function checkNotificationsAction(): Promise<ActionResult> {
  await currentActor();
  try { await generateNotifications(); revalidatePath("/", "layout"); return { success: true, data: { id: "checked" } }; }
  catch (error) { return failure(error); }
}
