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

test("home dashboard renders KPI cards", async ({ page, request }) => {
  const accessToken = await loginAsOwner(request);
  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken);

  await page.goto("/home");
  await expect(page.getByRole("heading", { name: "Home" })).toBeVisible();
  await expect(page.getByText("Cash Balance")).toBeVisible();
  await expect(page.getByText("Net Profit")).toBeVisible();
});

test("item combobox search selects a result", async ({ page, request }) => {
  const accessToken = await loginAsOwner(request);
  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken);

  await page.goto("/invoices/new");
  await expect(page.getByRole("heading", { name: "New Invoice" })).toBeVisible();

  const itemTrigger = page.getByRole("button", { name: "Select item" }).first();
  await itemTrigger.click();

  const searchInput = page.getByPlaceholder("Search items...");
  await searchInput.fill("Consulting");

  const itemOption = page.getByRole("button", { name: "Consulting Services" });
  await expect(itemOption).toBeVisible();
  await itemOption.click();

  await expect(page.locator('input[name="lines.0.description"]')).toHaveValue(/Consulting Services/);
});
