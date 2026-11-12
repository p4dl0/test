"use server";

import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { CsvImportError, CSV_MAX_BYTES, csvError, decodeCsvFile, type ImportPreview, type ImportResult } from "@/lib/license-csv";
import { importLicenses, previewLicenseImport } from "@/services/license-import";
import { inspectLicenseCsv, type CsvInspection } from "@/lib/csv-mapping";

async function readFile(form: FormData) {
  const file = form.get("file");
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".csv")) csvError(1, "file", "Choose a .csv file.");
  if (file.size > CSV_MAX_BYTES) csvError(1, "file", "The file must be 512 KiB or smaller.");
  return decodeCsvFile(new Uint8Array(await file.arrayBuffer()));
}
function readOptions(form: FormData): unknown {
  const value = form.get("options");
  if (value === null) return undefined;
  if (typeof value !== "string" || value.length > 64_000) csvError(1, "mapping", "Invalid column mapping. Detect the columns again.");
  try { return JSON.parse(value); }
  catch { return csvError(1, "mapping", "Invalid column mapping. Detect the columns again."); }
}
function failure(error: unknown): ImportResult<never> {
  if (error instanceof CsvImportError) return { success: false, error: error.message, issues: error.issues };
  return { success: false, error: "The import could not be completed. No licenses were saved. Preview the file again and retry.", issues: [] };
}
export async function previewLicenseImportAction(form: FormData): Promise<ImportResult<ImportPreview>> {
  await currentActor();
  try { return { success: true, data: await previewLicenseImport(await readFile(form), readOptions(form)) }; }
  catch (error) { return failure(error); }
}
export async function importLicensesAction(form: FormData): Promise<ImportResult<{ count: number }>> {
  await currentActor();
  let data;
  try { data = await importLicenses(await readFile(form), readOptions(form)); }
  catch (error) { return failure(error); }
  revalidatePath("/", "layout");
  return { success: true, data };
}

export async function inspectLicenseCsvAction(form: FormData): Promise<ImportResult<CsvInspection>> {
  await currentActor();
  try { return { success: true, data: inspectLicenseCsv(await readFile(form)) }; }
  catch (error) { return failure(error); }
}
