import "server-only";
import { db } from "@/lib/db";
import { currentActor } from "@/lib/actor";
import { departmentSchema, settingsSchema, vendorSchema } from "@/lib/validation/license";

export async function saveDirectory(kind: "vendor" | "department", input: unknown, id?: string) {
  await currentActor();
  if (kind === "vendor") {
    const data = vendorSchema.parse(input);
    return id ? db.vendor.update({ where: { id }, data }) : db.vendor.create({ data });
  }
  const data = departmentSchema.parse(input);
  return id ? db.department.update({ where: { id }, data }) : db.department.create({ data });
}
export async function deleteDirectory(kind: "vendor" | "department", id: string) {
  await currentActor();
  await db.$transaction(async tx => {
    const used = await tx.license.count({ where: kind === "vendor" ? { vendorId: id } : { departmentId: id } });
    if (used) throw new Error("Reassign this directory’s licenses before deleting it.");
    if (kind === "vendor") await tx.vendor.delete({ where: { id } });
    else await tx.department.delete({ where: { id } });
  });
}
export async function saveSettings(input: unknown) {
  await currentActor();
  return db.appSettings.update({ where: { id: "organization" }, data: settingsSchema.parse(input) });
}
