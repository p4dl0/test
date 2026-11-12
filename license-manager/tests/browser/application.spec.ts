import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { csvFixture } from "../csv-fixture";

async function signIn(page: Page) {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill(process.env.TEST_ADMIN_PASSWORD!);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL("/");
}

test.describe("authenticated workspace", () => {
  test.beforeEach(async ({ page }) => { await signIn(page); });

test("main pages, charts, global search, filtering, and responsive navigation", async ({ page }) => {
  const request = page.request;
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  expect((await request.get("/api/health")).ok()).toBeTruthy();
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Dashboard", exact: true })).toBeVisible();
  await expect(page.locator(".summary-card")).toHaveCount(6);
  await expect(page.locator(".recharts-surface")).toHaveCount(4);
  await page.screenshot({ path: "test-results/dashboard-desktop.png", fullPage: true });
  const response = await request.get("/api/search?q=Visio");
  expect(await response.json()).toEqual(expect.arrayContaining([expect.objectContaining({ productName: "Visio Plan 2" })]));
  expect(await response.text()).not.toContain("encryptedKey");
  await page.getByRole("textbox", { name: "Global search" }).fill("Visio");
  await page.locator(".search-results").getByRole("link", { name: /Visio Plan 2/ }).click();
  await expect(page.getByRole("heading", { name: "Visio Plan 2", exact: true })).toBeVisible();
  for (const [route, title] of [["/licenses", "Licenses"], ["/expirations", "Expirations"], ["/vendors", "Vendors"], ["/departments", "Departments"], ["/reports", "Reports"], ["/notifications", "Notifications"], ["/audit-log", "Audit Log"], ["/settings", "Settings"]]) {
    const response = await page.goto(route);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { name: title, exact: true }).first()).toBeVisible();
  }
  await page.goto("/licenses");
  await page.getByRole("combobox", { name: "All statuses" }).selectOption("Expired");
  await expect(page).toHaveURL(/status=Expired/);
  await expect(page.locator("tbody tr")).toHaveCount(2);
  await page.getByRole("link", { name: "Clear", exact: true }).click();
  await expect(page.locator("tbody tr")).toHaveCount(10);
  await page.getByRole("link", { name: "Next page" }).click();
  await expect(page.locator("tbody tr")).toHaveCount(8);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("button", { name: "Open navigation" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "test-results/dashboard-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("dialog").getByRole("link", { name: "Licenses", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Licenses", exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test("create, validate, reveal, edit, duplicate, delete, and inspect retained audit", async ({ page }) => {
  const request = page.request;
  const name = `Browser test ${Date.now()}`;
  const key = "DEMO-BROWSER-SECRET-67890";
  await page.goto("/licenses/new");
  await page.getByLabel("Product name *", { exact: true }).fill(name);
  await page.getByLabel("Vendor *", { exact: true }).selectOption({ label: "Microsoft" });
  await page.getByLabel("License key or identifier", { exact: true }).fill(key);
  await page.getByLabel("Purchased seats *", { exact: true }).fill("10");
  await page.getByLabel("Assigned seats *", { exact: true }).fill("12");
  await page.getByLabel("Department *", { exact: true }).selectOption({ label: "IT Operations" });
  await page.getByLabel("Responsible person *", { exact: true }).selectOption({ label: "Alex Morgan" });
  await page.getByLabel("Expiration date *", { exact: true }).fill("2028-12-31");
  await page.getByLabel("Annual cost *", { exact: true }).fill("1200");
  await page.getByLabel("Contract number", { exact: true }).fill("BROWSER-CONTRACT");
  await page.getByLabel("Notes", { exact: true }).fill("Browser-tested agreement.");
  await page.getByRole("button", { name: "Create license", exact: true }).click();
  await expect(page.getByText("Assigned seats cannot exceed purchased seats")).toBeVisible();
  await page.getByLabel("Assigned seats *", { exact: true }).fill("7");
  await page.getByRole("button", { name: "Create license", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  const originalURL = page.url();
  const originalId = originalURL.split("/").at(-1)!;
  expect(await (await request.get(`/licenses/${originalId}`)).text()).not.toContain(key);
  await expect(page.getByText("XXXXX-XXXXX-XXXXX-67890", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByText(key, { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide", exact: true }).click();
  await expect(page.getByText(key, { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Edit license", exact: true }).click();
  await page.getByLabel("Assigned seats *", { exact: true }).fill("9");
  await page.getByLabel("Expiration date *", { exact: true }).fill("2029-12-31");
  await page.getByLabel("Annual cost *", { exact: true }).fill("2400");
  await page.getByRole("button", { name: "Save changes", exact: true }).click();
  await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
  await expect(page.getByText("90%", { exact: true })).toBeVisible();
  await expect(page.getByText("Seat count changed", { exact: true })).toBeVisible();
  await expect(page.getByText("Cost changed", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("90%", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Duplicate", exact: true }).click();
  await expect(page.getByLabel("Product name *", { exact: true })).toHaveValue(`${name} (copy)`);
  await expect(page.getByLabel("License key or identifier", { exact: true })).toHaveValue("");
  await expect(page.getByLabel("Contract number", { exact: true })).toHaveValue("");
  await page.getByRole("button", { name: "Create license", exact: true }).click();
  await expect(page.getByRole("heading", { name: `${name} (copy)`, exact: true })).toBeVisible();
  await page.getByRole("button", { name: `Actions for ${name} (copy)`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete license", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete license", exact: true }).click();
  await expect(page).toHaveURL(/\/licenses$/);
  await page.goto(originalURL);
  await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
  await page.getByRole("menuitem", { name: "Delete license", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete license", exact: true }).click();
  await expect(page).toHaveURL(/\/licenses$/);
  await page.goto(`/audit-log?q=${encodeURIComponent(name)}&action=DELETED`);
  await expect(page.locator(".timeline-event").getByText("License deleted", { exact: true })).toHaveCount(2);
});

test("directory forms, settings, and notification read actions persist", async ({ page }) => {
  await page.goto("/vendors");
  await page.getByRole("button", { name: "Add vendor", exact: true }).click();
  await page.getByRole("dialog").getByLabel("Name *", { exact: true }).fill("Browser vendor");
  await page.getByRole("button", { name: "Save vendor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Browser vendor", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit Browser vendor", exact: true }).click();
  await page.getByLabel("Contact information", { exact: true }).fill("Procurement team");
  await page.getByRole("button", { name: "Save vendor", exact: true }).click();
  await expect(page.getByText("Procurement team", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Delete Browser vendor", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Delete vendor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Browser vendor", exact: true })).toHaveCount(0);
  await page.goto("/settings");
  await page.getByLabel("Organization name", { exact: true }).fill("Verified Workspace");
  await page.getByRole("button", { name: "Save settings", exact: true }).click();
  await expect(page.getByText("Settings saved.", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Organization name", { exact: true })).toHaveValue("Verified Workspace");
  await page.goto("/notifications");
  await page.getByRole("button", { name: "Mark all read", exact: true }).click();
  await expect(page.locator(".notification-item.unread")).toHaveCount(0);
  await page.getByRole("link", { name: /^Unread/ }).click();
  await expect(page.getByText("You’re all caught up", { exact: true })).toBeVisible();
});

test("CSV upload previews safely, reports errors, imports licenses, and blocks duplicate retries", async ({ page }) => {
  const name = `CSV browser ${Date.now()}`;
  const key = "CSV-BROWSER-SECRET-24680";
  const base = { vendor: "Microsoft", department: "IT Operations", owner_email: "admin@example.test" };
  const source = csvFixture([{ ...base, product_name: name, license_key: key, purchased_seats: "10", assigned_seats: "3" }, { ...base, product_name: `${name} second`, annual_cost: "29.99" }]);
  await page.goto("/licenses");
  await page.getByRole("link", { name: "Import CSV", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Import licenses", exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV template" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("license-import-template.csv");
  expect(await readFile((await download.path())!, "utf8")).toContain("product_name,vendor,department,owner_email");
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "invalid.csv", mimeType: "text/csv", buffer: Buffer.from(csvFixture([{ ...base, vendor: "Missing vendor" }])) });
  await page.getByRole("button", { name: "Preview CSV", exact: true }).click();
  await expect(page.locator(".form-error-banner")).toContainText("Row 2 · vendor");
  await expect(page.getByRole("button", { name: /^Import \d/ })).toHaveCount(0);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "licenses.csv", mimeType: "text/csv", buffer: Buffer.from(source) });
  const responsePromise = page.waitForResponse(response => response.request().method() === "POST" && Boolean(response.request().headers()["next-action"]));
  await page.getByRole("button", { name: "Preview CSV", exact: true }).click();
  expect(await (await responsePromise).text()).not.toContain(key);
  await expect(page.getByText("2 licenses are ready. Nothing has been saved yet.")).toBeVisible();
  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(page.getByText(key, { exact: true })).toHaveCount(0);
  expect(await (await page.request.get(`/api/search?q=${encodeURIComponent(name)}`)).json()).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Import 2 licenses", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Imported 2 licenses", exact: true })).toBeVisible();
  const records = await (await page.request.get(`/api/search?q=${encodeURIComponent(name)}`)).json();
  expect(records).toHaveLength(2);
  await page.getByLabel("CSV file", { exact: true }).setInputFiles({ name: "licenses.csv", mimeType: "text/csv", buffer: Buffer.from(source) });
  await page.getByRole("button", { name: "Preview CSV", exact: true }).click();
  await expect(page.locator(".form-error-banner")).toContainText("already exists");
  await page.goto(`/licenses/${records.find((record: { productName: string }) => record.productName === name).id}`);
  await page.getByRole("button", { name: "Show", exact: true }).click();
  await expect(page.getByText(key, { exact: true })).toBeVisible();
});

});

test("anonymous pages, RSC requests, API search, and forged cookies disclose no workspace data", async ({ page, context }) => {
  for (const path of ["/", "/licenses", "/licenses/import", "/licenses/seed-license-001", "/licenses/seed-license-001/edit", "/licenses/new", "/licenses/new?duplicate=seed-license-001", "/vendors", "/departments", "/reports", "/audit-log", "/notifications", "/expirations", "/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Sign in to License Manager" })).toBeVisible();
  }
  const api = await page.request.get("/api/search?q=Microsoft");
  expect(api.status()).toBe(401);
  expect(await api.json()).toEqual({ error: "Unauthorized" });
  const rsc = await page.request.get("/licenses/seed-license-001", { headers: { RSC: "1" } });
  expect(await rsc.text()).not.toContain("Microsoft 365 E3");
  await context.addCookies([{ name: "license-session", value: "0".repeat(64), url: "http://127.0.0.1:3101" }]);
  expect((await page.request.get("/api/search?q=Microsoft")).status()).toBe(401);
});

test("login rejects bad credentials and logout blocks replay of a key-reveal action and session", async ({ page, context, browser }) => {
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill("admin@example.test");
  await page.getByLabel("Password", { exact: true }).fill("wrong-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.locator("form [role='alert']")).toContainText("Unable to sign in");
  await signIn(page);
  const savedCookies = await context.cookies();
  const session = savedCookies.find(cookie => cookie.name === "license-session")!;
  expect(session.httpOnly).toBe(true);
  expect(session.sameSite).toBe("Strict");
  await page.goto("/licenses/seed-license-001");
  const actionRequest = page.waitForRequest(request => request.method() === "POST" && Boolean(request.headers()["next-action"]));
  await page.getByRole("button", { name: "Show", exact: true }).click();
  const captured = await actionRequest;
  await expect(page.getByText("DEMO-NOTREAL-XXXXX-00001", { exact: true })).toBeVisible();
  await page.locator(".profile-trigger").click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  const anonymous = await browser.newContext();
  try {
    const replay = await anonymous.request.post(captured.url(), {
      headers: { "next-action": captured.headers()["next-action"], "content-type": captured.headers()["content-type"], origin: "http://127.0.0.1:3101" },
      data: captured.postDataBuffer()!, maxRedirects: 0,
    });
    expect(replay.headers()["x-action-redirect"]).toContain("/login");
    expect(await replay.text()).not.toContain("DEMO-NOTREAL-XXXXX-00001");
    await anonymous.addCookies(savedCookies);
    expect((await anonymous.request.get("http://127.0.0.1:3101/api/search?q=Microsoft")).status()).toBe(401);
  } finally { await anonymous.close(); }
});
