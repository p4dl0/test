import { z } from "zod";
import { CURRENCIES, LICENSE_TYPES } from "@/lib/calculations";

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").refine(value => {
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Use a valid calendar date");
const optionalDate = z.union([date, z.literal(""), z.null()]).transform(value => value || null);
const text = (max: number) => z.string().trim().max(max);

export const licenseSchema = z.object({
  productName: text(160).min(2, "Enter a product name"),
  vendorId: z.string().min(1, "Select a vendor"),
  licenseType: z.enum(LICENSE_TYPES),
  licenseKey: text(1000).optional(),
  clearKey: z.boolean().default(false),
  seatTracking: z.boolean(),
  purchasedSeats: z.number().int().min(0).max(1_000_000),
  assignedSeats: z.number().int().min(0).max(1_000_000),
  purchaseDate: date,
  startDate: date,
  expirationDate: date,
  renewalDate: optionalDate,
  autoRenewal: z.boolean(),
  annualCostMinor: z.number().int().min(0).max(2_000_000_000),
  currency: z.enum(CURRENCIES),
  departmentId: z.string().min(1, "Select a department"),
  responsibleUserId: z.string().min(1, "Select a responsible person"),
  supplier: text(200),
  contractNumber: text(120),
  notes: text(5000),
}).superRefine((value, ctx) => {
  if (value.seatTracking && value.purchasedSeats < 1) ctx.addIssue({ code: "custom", path: ["purchasedSeats"], message: "Purchase at least one seat when tracking seats" });
  if (value.assignedSeats > value.purchasedSeats) ctx.addIssue({ code: "custom", path: ["assignedSeats"], message: "Assigned seats cannot exceed purchased seats" });
  if (!value.seatTracking && (value.purchasedSeats !== 0 || value.assignedSeats !== 0)) ctx.addIssue({ code: "custom", path: ["purchasedSeats"], message: "Set seat counts to zero when seat tracking is disabled" });
  if (value.expirationDate < value.startDate) ctx.addIssue({ code: "custom", path: ["expirationDate"], message: "Expiration must be on or after the start date" });
  if (value.clearKey && value.licenseKey) ctx.addIssue({ code: "custom", path: ["licenseKey"], message: "Choose a new key or clear the existing key" });
});
export type LicenseInput = z.infer<typeof licenseSchema>;

export const vendorSchema = z.object({
  name: text(120).min(2),
  website: z.union([z.literal(""), z.url().refine(value => /^https?:\/\//.test(value), "Use an HTTP or HTTPS URL")]),
  contact: text(200),
});
export const departmentSchema = z.object({ name: text(120).min(2), description: text(500) });
export const settingsSchema = z.object({
  organizationName: text(120).min(2),
  timezone: z.string().refine(value => { try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; } }, "Use a valid IANA timezone"),
  defaultCurrency: z.enum(CURRENCIES),
  notificationsEnabled: z.boolean(),
});
