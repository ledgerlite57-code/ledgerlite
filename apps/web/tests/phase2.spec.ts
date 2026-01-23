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

test("journal balancing UI disables post when unbalanced", async ({ page, request }) => {
  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email: "owner@ledgerlite.local", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginPayload = (await loginRes.json()) as { data?: { accessToken?: string } };
  const accessToken = loginPayload?.data?.accessToken;
  expect(accessToken).toBeTruthy();

  const debitName = `Journal Debit ${Date.now()}`;
  const creditName = `Journal Credit ${Date.now()}`;
  await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `J${Date.now()}`, name: debitName, type: "ASSET" },
  });
  await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: `K${Date.now()}`, name: creditName, type: "ASSET" },
  });

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken as string);

  await page.goto("/journals/new");
  await expect(page.getByRole("heading", { name: "New Journal" })).toBeVisible();

  await page.getByRole("button", { name: "Add Line" }).click();

  const accountSelects = page.getByLabel("Account");
  await accountSelects.nth(0).click();
  await page.getByRole("option", { name: new RegExp(debitName) }).click();
  await accountSelects.nth(1).click();
  await page.getByRole("option", { name: new RegExp(creditName) }).click();

  const rows = page.locator("table tbody tr");
  await rows.nth(0).locator("input[type=\"number\"]").nth(0).fill("100");
  await rows.nth(0).locator("input[type=\"number\"]").nth(1).fill("25");
  await expect(page.getByText("Enter either a debit or credit.")).toBeVisible();

  await rows.nth(0).locator("input[type=\"number\"]").nth(1).fill("0");
  await rows.nth(1).locator("input[type=\"number\"]").nth(1).fill("50");

  await page.getByRole("button", { name: "Create Draft" }).click();
  await expect(page).toHaveURL(/\/journals\/.+/);
  await expect(page.getByText(/Unbalanced by/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Post Journal" })).toBeDisabled();

  const updatedRows = page.locator("table tbody tr");
  await updatedRows.nth(1).locator("input[type=\"number\"]").nth(1).fill("100");
  await expect(page.getByText("Balanced")).toBeVisible();
  await expect(page.getByRole("button", { name: "Post Journal" })).toBeEnabled();
});

test("payment allocations show remaining and over-allocation guidance", async ({ page, request }) => {
  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email: "owner@ledgerlite.local", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginPayload = (await loginRes.json()) as { data?: { accessToken?: string } };
  const accessToken = loginPayload?.data?.accessToken;
  expect(accessToken).toBeTruthy();

  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const customersRes = await request.get(`${apiBase}/customers`, { headers: authHeaders });
  expect(customersRes.ok()).toBeTruthy();
  const customersPayload = (await customersRes.json()) as { data?: { data?: { id: string; name: string }[] } };
  let customer = customersPayload.data?.data?.[0];
  if (!customer) {
    const createdCustomer = await request.post(`${apiBase}/customers`, {
      headers: authHeaders,
      data: { name: `Phase2 Customer ${Date.now()}` },
    });
    const createdCustomerPayload = (await createdCustomer.json()) as { data?: { id?: string; name?: string } };
    customer = {
      id: createdCustomerPayload.data?.id ?? "",
      name: createdCustomerPayload.data?.name ?? "Phase2 Customer",
    };
  }

  const itemsRes = await request.get(`${apiBase}/items?isActive=true`, { headers: authHeaders });
  expect(itemsRes.ok()).toBeTruthy();
  const itemsPayload = (await itemsRes.json()) as { data?: { id: string; name: string; salePrice?: number }[] };
  let item = itemsPayload.data?.[0];
  if (!item) {
    const incomeAccountRes = await request.post(`${apiBase}/accounts`, {
      headers: authHeaders,
      data: { code: `I${Date.now()}`, name: "Test Income", type: "INCOME" },
    });
    const incomePayload = (await incomeAccountRes.json()) as { data?: { id?: string } };
    const expenseAccountRes = await request.post(`${apiBase}/accounts`, {
      headers: authHeaders,
      data: { code: `E${Date.now()}`, name: "Test Expense", type: "EXPENSE" },
    });
    const expensePayload = (await expenseAccountRes.json()) as { data?: { id?: string } };

    const itemRes = await request.post(`${apiBase}/items`, {
      headers: authHeaders,
      data: {
        name: `Phase2 Item ${Date.now()}`,
        type: "SERVICE",
        salePrice: 120,
        incomeAccountId: incomePayload.data?.id,
        expenseAccountId: expensePayload.data?.id,
      },
    });
    const itemPayload = (await itemRes.json()) as { data?: { id?: string; name?: string } };
    item = { id: itemPayload.data?.id ?? "", name: itemPayload.data?.name ?? "Phase2 Item" };
  }

  const invoiceDate = new Date().toISOString();
  const invoiceRes = await request.post(`${apiBase}/invoices`, {
    headers: authHeaders,
    data: {
      customerId: customer.id,
      invoiceDate,
      dueDate: invoiceDate,
      currency: "AED",
      lines: [
        {
          itemId: item.id,
          description: "Phase2 Allocation Test",
          qty: 1,
          unitPrice: 120,
          discountAmount: 0,
        },
      ],
    },
  });
  expect(invoiceRes.ok()).toBeTruthy();
  const invoicePayload = (await invoiceRes.json()) as { data?: { id?: string } };
  const invoiceId = invoicePayload.data?.id;
  expect(invoiceId).toBeTruthy();

  const postRes = await request.post(`${apiBase}/invoices/${invoiceId}/post`, {
    headers: { ...authHeaders, "Idempotency-Key": `phase2-${Date.now()}` },
  });
  expect(postRes.ok()).toBeTruthy();
  const postPayload = (await postRes.json()) as { data?: { invoice?: { number?: string; total?: string | number } } };
  const invoiceNumber = postPayload.data?.invoice?.number ?? "Draft";
  const invoiceTotal = Number(postPayload.data?.invoice?.total ?? 0) || 0;

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken as string);

  await page.goto("/payments-received/new");
  await page.getByRole("combobox", { name: "Customer" }).click();
  await page.getByRole("option", { name: customer.name }).click();

  await expect(page.getByText(/Remaining to allocate/)).toBeVisible();

  await page.getByRole("combobox", { name: "Invoice" }).click();
  await page.getByRole("option", { name: invoiceNumber }).click();

  const rows = page.locator("table tbody tr");
  await rows.nth(0).locator("input[type=\"number\"]").fill(String(invoiceTotal + 10));
  await expect(page.getByText(/Exceeds outstanding by/)).toBeVisible();
});
