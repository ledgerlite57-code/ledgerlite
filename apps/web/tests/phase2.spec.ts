import { test, expect } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test("phase 2 flow: manage customers, vendors, items, tax codes", async ({ page, request }) => {
  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email: "owner@ledgerlite.local", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginPayload = (await loginRes.json()) as { data?: { accessToken?: string } };
  const accessToken = loginPayload?.data?.accessToken;
  expect(accessToken).toBeTruthy();

  await request.patch(`${apiBase}/orgs/current`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { vatEnabled: true },
  });
  await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `41${Date.now()}`, name: "Services Revenue", type: "INCOME" },
  });
  await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `51${Date.now()}`, name: "Operating Expenses", type: "EXPENSE" },
  });

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken as string);

  await page.goto("/dashboard?tab=customers");
  await expect(page.getByRole("heading", { name: "Customers" })).toBeVisible();
  await page.getByRole("button", { name: "New Customer" }).click();
  await page.getByLabel("Name *").fill("Acme Customers");
  await page.getByLabel("Email").fill("ap@acme.local");
  await page.getByRole("button", { name: "Create Customer" }).click();
  await expect(page.getByRole("cell", { name: "Acme Customers" })).toBeVisible();

  await page.goto("/dashboard?tab=vendors");
  await expect(page.getByRole("heading", { name: "Vendors" })).toBeVisible();
  await page.getByRole("button", { name: "New Vendor" }).click();
  await page.getByLabel("Name *").fill("Zen Supplies");
  await page.getByLabel("Email").fill("billing@zen.local");
  await page.getByRole("button", { name: "Create Vendor" }).click();
  await expect(page.getByRole("cell", { name: "Zen Supplies" })).toBeVisible();

  await page.goto("/dashboard?tab=taxes");
  await expect(page.getByRole("heading", { name: "Tax Codes" })).toBeVisible();
  await page.getByRole("button", { name: "New Tax Code" }).click();
  await page.getByLabel("Name *").fill("VAT 5%");
  await page.getByLabel("Rate (%) *").fill("5");
  await page.getByRole("combobox", { name: "Tax type" }).click();
  await page.getByRole("option", { name: "Standard" }).click();
  await page.getByRole("button", { name: "Create Tax Code" }).click();
  await expect(page.getByRole("cell", { name: "VAT 5%" })).toBeVisible();

  await page.goto("/dashboard?tab=items");
  await expect(page.getByRole("heading", { name: "Items" })).toBeVisible();
  await page.getByRole("button", { name: "New Item" }).click();
  await page.getByLabel("Name *").fill("Consulting");
  await page.getByLabel("Sale Price *").fill("250");
  await page.getByRole("combobox", { name: "Income account" }).click();
  await page.getByRole("option", { name: "Services Revenue" }).click();
  await page.getByRole("combobox", { name: "Expense account" }).click();
  await page.getByRole("option", { name: "Operating Expenses" }).click();
  await page.getByRole("combobox", { name: "Default tax code" }).click();
  await page.getByRole("option", { name: "VAT 5%" }).click();
  await page.getByRole("button", { name: "Create Item" }).click();
  await expect(page.getByRole("cell", { name: "Consulting" })).toBeVisible();
});
