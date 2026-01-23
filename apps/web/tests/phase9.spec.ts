import { test, expect, type APIRequestContext } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function loginAsOwner(request: APIRequestContext) {
  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email: "owner@ledgerlite.local", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();
  const payload = (await loginRes.json()) as { data?: { accessToken?: string } };
  const accessToken = payload?.data?.accessToken;
  expect(accessToken).toBeTruthy();
  return accessToken as string;
}

test("phase 9: quick-create item and advanced fields persist", async ({ page, request }) => {
  const accessToken = await loginAsOwner(request);
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const customersRes = await request.get(`${apiBase}/customers`, { headers: authHeaders });
  expect(customersRes.ok()).toBeTruthy();
  const customersPayload = (await customersRes.json()) as { data?: { data?: { id: string; name: string }[] } };
  const customer = customersPayload.data?.data?.[0];
  expect(customer).toBeTruthy();

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken);

  await page.goto("/invoices/new");

  await page.getByRole("button", { name: "Select customer" }).click();
  await page.getByRole("option").first().click();

  await page.getByText("Advanced").click();
  await page.getByLabel("Reference / PO").fill("PO-123");

  await page.getByRole("button", { name: "Select item" }).click();
  await page.getByPlaceholder("Search items...").fill("Phase9 Item");
  await page.getByRole("button", { name: 'Create "Phase9 Item"' }).click();

  await page.getByLabel("Name *").fill("Phase9 Item");
  await page.getByLabel("Income account").click();
  await page.getByRole("option").first().click();
  await page.getByLabel("Expense account").click();
  await page.getByRole("option").first().click();
  await page.getByRole("button", { name: "Create Item" }).click();
  await expect(page.getByRole("heading", { name: "Quick create item" })).toBeHidden();

  await expect(page.locator('input[name="lines.0.description"]')).toHaveValue(/Phase9 Item/);

  await page.getByRole("button", { name: "Create Draft" }).click();

  await expect(page.getByLabel("Reference / PO")).toHaveValue("PO-123");
});
