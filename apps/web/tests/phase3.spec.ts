import { test, expect } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test("phase 3 flow: create and post an invoice", async ({ page, request }) => {
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

  const arAccount = await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `11${Date.now()}`, name: "Accounts Receivable", type: "ASSET", subtype: "AR" },
  });
  expect(arAccount.ok()).toBeTruthy();

  const vatAccount = await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `21${Date.now()}`, name: "VAT Payable", type: "LIABILITY", subtype: "VAT_PAYABLE" },
  });
  expect(vatAccount.ok()).toBeTruthy();

  const incomeAccountRes = await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `41${Date.now()}`, name: "Services Revenue", type: "INCOME" },
  });
  expect(incomeAccountRes.ok()).toBeTruthy();
  const incomeAccount = (await incomeAccountRes.json()) as { data?: { id?: string } };

  const expenseAccountRes = await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `51${Date.now()}`, name: "Operating Expenses", type: "EXPENSE" },
  });
  expect(expenseAccountRes.ok()).toBeTruthy();
  const expenseAccount = (await expenseAccountRes.json()) as { data?: { id?: string } };

  const customerRes = await request.post(`${apiBase}/customers`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: "Playwright Customer", paymentTermsDays: 7 },
  });
  expect(customerRes.ok()).toBeTruthy();
  const customer = (await customerRes.json()) as { data?: { id?: string } };

  const taxRes = await request.post(`${apiBase}/tax-codes`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { name: `VAT 5% ${Date.now()}`, rate: 5, type: "STANDARD" },
  });
  expect(taxRes.ok()).toBeTruthy();
  const taxCode = (await taxRes.json()) as { data?: { id?: string } };

  const itemRes = await request.post(`${apiBase}/items`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: {
      name: `Consulting ${Date.now()}`,
      type: "SERVICE",
      salePrice: 250,
      incomeAccountId: incomeAccount.data?.id,
      expenseAccountId: expenseAccount.data?.id,
      defaultTaxCodeId: taxCode.data?.id,
    },
  });
  expect(itemRes.ok()).toBeTruthy();
  const item = (await itemRes.json()) as { data?: { id?: string; name?: string } };
  expect(item.data?.name).toBeTruthy();

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken as string);

  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();
  await page.getByRole("link", { name: "New Invoice" }).click();

  await expect(page.getByRole("combobox", { name: "Customer" })).toBeVisible();
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: "Playwright Customer" }).click();

  await page.getByRole("combobox", { name: "Item" }).click();
  await page.getByRole("option", { name: item.data?.name ?? "" }).click();

  await page.getByRole("button", { name: "Create Draft" }).click();

  await expect(page.getByText("Status: DRAFT")).toBeVisible();

  await page.getByRole("button", { name: "Post Invoice" }).click();
  await page.getByRole("button", { name: "Confirm Post" }).click();
  await expect(page.getByText("Status: POSTED")).toBeVisible();
});
