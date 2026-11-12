"use server";
import { revalidatePath } from "next/cache";
import { currentActor } from "@/lib/actor";
import { CSV_MAX_BYTES, decodeCsvFile, CsvImportError } from "@/lib/license-csv";
import { previewMicrosoftImport, saveMicrosoftImport, type MicrosoftOptions } from "@/services/microsoft-import";

export async function microsoftImportAction(form: FormData) {
  await currentActor();
  try {
    const file = form.get("file");
    if (!(file instanceof File) || file.size > CSV_MAX_BYTES || !file.name.toLowerCase().endsWith(".csv")) throw new Error("Choose a CSV file up to 512 KiB.");
    const source = decodeCsvFile(new Uint8Array(await file.arrayBuffer()));
    const options = { dateOrder: String(form.get("dateOrder") ?? "ISO") } as MicrosoftOptions;
    const token = form.get("token");
    if (typeof token === "string") {
      const selectedRows: unknown = JSON.parse(String(form.get("selectedRows") ?? "null"));
      if (!Array.isArray(selectedRows) || !selectedRows.every(row => typeof row === "number")) throw new Error("Select the licenses to save from the preview.");
      const saved = await saveMicrosoftImport(source, options, token, selectedRows);
      revalidatePath("/", "layout");
      return { success: true as const, saved };
    }
    return { success: true as const, preview: await previewMicrosoftImport(source, options) };
  } catch (error) {
    return { success: false as const, error: error instanceof CsvImportError ? error.issues.slice(0, 20).map(issue => `Row ${issue.row}: ${issue.field}: ${issue.message}`).join("\n") : error instanceof Error ? error.message : "Import failed. No rows were saved." };
  }
}
