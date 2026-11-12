"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { CsvImportError, CSV_MAX_BYTES, csvError, type ImportPreview, type ImportResult } from "@/lib/license-csv";
import { importLicenses, previewLicenseImport } from "@/services/license-import";

async function readFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) csvError(1, "file", "Choose a .csv file.");
  if (file.size > CSV_MAX_BYTES) csvError(1, "file", "The file must be 512 KiB or smaller.");
  try { return new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer()); }
  catch { return csvError(1, "file", "Save the file as UTF-8 CSV."); }
}
function failure(error: unknown): ImportResult<never> {
  if (error instanceof CsvImportError) return { success: false, error: error.message, issues: error.issues };
  return { success: false, error: "The import could not be completed. No licenses were saved. Preview the file again and retry.", issues: [] };
}
export async function previewLicenseImportAction(form: FormData): Promise<ImportResult<ImportPreview>> {
  await currentActor();
  try { return { success: true, data: await previewLicenseImport(await readFile(form)) }; }
  catch (error) { return failure(error); }
}
export async function importLicensesAction(form: FormData): Promise<ImportResult<{ count: number }>> {
  await currentActor();
  let data;
  try { data = await importLicenses(await readFile(form)); }
  catch (error) { return failure(error); }
  revalidatePath("/", "layout");
  return { success: true, data };
}
