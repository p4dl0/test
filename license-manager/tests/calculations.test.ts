import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysRemaining, expirationGroup, expirationLabel, licenseStatus, todayInTimezone, utilization, utilizationTone, currencyTotals } from "../src/lib/calculations";
import { licenseSchema } from "../src/lib/validation/license";

test("expiration boundaries are inclusive and calendar-based", () => {
  for (const [days, status] of [[-1, "Expired"], [0, "Expiring"], [30, "Expiring"], [31, "Expiring Soon"], [60, "Expiring Soon"], [61, "Active"]] as const) assert.equal(licenseStatus(days), status);
  assert.equal(daysRemaining("2026-03-30", "2026-03-28"), 2);
  assert.equal(addDays("2028-02-28", 1), "2028-02-29");
  assert.equal(todayInTimezone("Europe/Riga", new Date("2026-01-01T23:00:00Z")), "2026-01-02");
  assert.equal(expirationLabel(0), "Expires today");
  assert.equal(expirationLabel(-12), "Expired 12 days ago");
  assert.equal(expirationLabel(1), "Expires in 1 day");
  assert.equal(expirationGroup(7), "Next 7 days");
  assert.equal(expirationGroup(8), "Next 30 days");
  assert.equal(expirationGroup(91), "Later");
});
test("utilization handles untracked seats and exact thresholds", () => {
  assert.equal(utilization(100, 87), 87);
  assert.equal(utilization(0, 0), null);
  assert.equal(utilization(100, 87, false), null);
  assert.equal(utilizationTone(100, 90), "normal");
  assert.equal(utilizationTone(100, 91), "high");
  assert.equal(utilizationTone(100, 100), "full");
  assert.equal(utilizationTone(100, 69), "low");
});
test("currency totals never combine different currencies", () => {
  assert.deepEqual(currencyTotals([{ currency: "EUR", annualCostMinor: 125 }, { currency: "USD", annualCostMinor: 100 }, { currency: "EUR", annualCostMinor: 225 }]), { EUR: 350, USD: 100 });
});
export const fixture = { productName: "Test product", vendorId: "vendor", licenseType: "Subscription", licenseKey: "FAKE-NOT-REAL-12345", seatTracking: true, purchasedSeats: 10, assignedSeats: 7, purchaseDate: "2026-01-01", startDate: "2026-01-01", expirationDate: "2027-01-01", renewalDate: "2026-12-20", autoRenewal: false, annualCostMinor: 120000, currency: "EUR", departmentId: "dept", responsibleUserId: "admin", supplier: "Test reseller", contractNumber: "TEST-1", notes: "Test only" };
test("validation rejects invalid dates, oversubscription, and invalid amounts", () => {
  assert.equal(licenseSchema.safeParse(fixture).success, true);
  for (const patch of [{ expirationDate: "2026-02-30" }, { expirationDate: "2025-12-31" }, { assignedSeats: 11 }, { purchasedSeats: 0 }, { annualCostMinor: -1 }, { annualCostMinor: 1.5 }, { currency: "INVALID" }, { seatTracking: false }, { clearKey: true }]) assert.equal(licenseSchema.safeParse({ ...fixture, ...patch }).success, false);
});
