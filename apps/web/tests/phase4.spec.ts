import { test, expect } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test("phase 4 sidebar groups and links render", async ({ page, request }) => {
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

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken as string);

  await page.goto("/invoices");

  const groupTitles = ["Sales", "Purchases", "Banking", "Accounting", "Reports", "Settings"];
  for (const title of groupTitles) {
    await expect(page.locator(".sidebar-group-title", { hasText: title })).toBeVisible();
  }

  const links = [
    "Invoices",
    "Payments Received",
    "Customers",
    "Items",
    "Bills",
    "Vendor Payments",
    "Vendors",
    "Bank Accounts",
    "Bank Import",
    "Reconciliation",
    "Chart of Accounts",
    "Journals",
    "Reports",
    "Trial Balance",
    "Profit & Loss",
    "Balance Sheet",
    "AR Aging",
    "AP Aging",
    "VAT Summary",
    "Organization",
    "Users & Roles",
    "Tax Codes",
    "Audit Log",
  ];

  for (const name of links) {
    await expect(page.getByRole("link", { name })).toBeVisible();
  }
});
