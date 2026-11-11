import "dotenv/config";
import { encryptKey } from "../src/lib/security/keys";
import { db } from "../src/lib/db";

const date = (offset: number) => {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Riga" }).format(new Date());
  return new Date(Date.parse(today + "T00:00:00Z") + offset * 86400000).toISOString().slice(0, 10);
};

const products = [
  ["Microsoft 365 E3", "Microsoft", "IT Operations", 100, 87, 240, 43200, "Subscription"],
  ["Microsoft 365 Business Standard", "Microsoft", "Administration", 40, 36, 55, 6000, "Subscription"],
  ["Visio Plan 2", "Microsoft", "IT Operations", 12, 7, 24, 2160, "Subscription"],
  ["Project Plan 3", "Microsoft", "Administration", 8, 5, 90, 2880, "Subscription"],
  ["ESET PROTECT Advanced", "ESET", "IT Operations", 180, 172, 7, 5400, "Subscription"],
  ["FortiClient EMS", "Fortinet", "IT Operations", 120, 120, 14, 3600, "Subscription"],
  ["Planmeca Romexis", "Planmeca", "Clinical", 20, 18, 180, 9600, "Perpetual maintenance"],
  ["DÜRR Dental VistaSoft", "DÜRR Dental", "Clinical", 15, 11, -12, 4200, "Perpetual maintenance"],
  ["Adobe Acrobat Pro", "Adobe", "Administration", 30, 19, 30, 7200, "Subscription"],
  ["TeamViewer Tensor", "TeamViewer", "IT Operations", 10, 6, 1, 2400, "Subscription"],
  ["Adobe Creative Cloud", "Adobe", "Marketing", 6, 6, 65, 5400, "Subscription"],
  ["Microsoft Power BI Pro", "Microsoft", "Finance", 18, 14, 60, 2592, "Subscription"],
  ["Veeam Data Platform", "Veeam", "IT Operations", 10, 8, 120, 4800, "Subscription"],
  ["AutoCAD LT", "Autodesk", "Facilities", 4, 2, -3, 2400, "Subscription"],
  ["Zoom Workplace Business", "Zoom", "Administration", 25, 21, 365, 5400, "Subscription"],
  ["Atlassian Jira Standard", "Atlassian", "IT Operations", 20, 17, 0, 2040, "Subscription"],
  ["Windows Server 2025", "Microsoft", "IT Operations", 0, 0, 400, 1800, "Volume"],
  ["1Password Business", "1Password", "IT Operations", 150, 138, 45, 14400, "Subscription"],
] as const;

async function main() {
  await db.appSettings.upsert({ where: { id: "organization" }, create: {}, update: {} });
  for (const name of [...new Set(products.map(p => p[2]))]) {
    await db.department.upsert({ where: { name }, create: { name, description: `${name} software and services` }, update: {} });
  }
  const it = await db.department.findUniqueOrThrow({ where: { name: "IT Operations" } });
  for (const [name, email] of [["Alex Morgan", "admin@example.test"], ["Sarah Chen", "sarah@example.test"], ["James Wilson", "james@example.test"]]) {
    await db.user.upsert({ where: { email }, create: { name, email, departmentId: it.id }, update: {} });
  }
  const users = await db.user.findMany({ orderBy: { email: "asc" } });
  for (const [index, p] of products.entries()) {
    const [productName, vendorName, departmentName, purchasedSeats, assignedSeats, expires, annualCost, licenseType] = p;
    const vendor = await db.vendor.upsert({ where: { name: vendorName }, create: { name: vendorName }, update: {} });
    const department = await db.department.findUniqueOrThrow({ where: { name: departmentName } });
    const id = `seed-license-${String(index + 1).padStart(3, "0")}`;
    if (await db.license.findUnique({ where: { id } })) continue;
    const key = `DEMO-NOTREAL-XXXXX-${String(index + 1).padStart(5, "0")}`;
    await db.$transaction(async tx => {
      const license = await tx.license.create({ data: {
        id, productName, vendorId: vendor.id, departmentId: department.id,
        responsibleUserId: users[index % users.length].id,
        licenseType, purchasedSeats, assignedSeats, seatTracking: purchasedSeats > 0,
        purchaseDate: date(-300), startDate: date(-290), expirationDate: date(expires),
        renewalDate: date(expires - 7), autoRenewal: index % 3 === 0,
        annualCostMinor: annualCost * 100, currency: "EUR", encryptedKey: encryptKey(key), keySuffix: key.slice(-5),
        supplier: index % 2 ? "Baltic IT Solutions" : "Direct vendor",
        contractNumber: `NHG-${new Date().getUTCFullYear()}-${String(index + 1).padStart(4, "0")}`,
        notes: index % 3 === 0 ? "Review seat allocation with the department owner before renewal." : "Annual agreement. Contact the responsible person for renewal approval.",
      } });
      await tx.auditLog.create({ data: { licenseId: license.id, productName, action: "CREATED", userId: users[0].id, newValue: { productName, source: "Example seed data", annualCostMinor: license.annualCostMinor } } });
    });
  }
  console.log(`Database ready: ${await db.license.count()} licenses, ${await db.vendor.count()} vendors, ${await db.department.count()} departments.`);
}
main().finally(() => db.$disconnect());
