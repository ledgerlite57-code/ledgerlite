import { test, expect } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test("saved views: save and apply filters", async ({ page, request }) => {
  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email: "owner@ledgerlite.local", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();
  const loginPayload = (await loginRes.json()) as { data?: { accessToken?: string } };
  const accessToken = loginPayload?.data?.accessToken;
  expect(accessToken).toBeTruthy();

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken as string);

  await page.goto("/invoices");
  await expect(page.getByRole("heading", { name: "Invoices" })).toBeVisible();

  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Posted" }).click();
  await page.getByRole("button", { name: "Apply Filters" }).click();

  await page.getByRole("combobox", { name: "Saved views" }).click();
  await page.getByRole("option", { name: "Save current view..." }).click();

  await expect(page.getByRole("heading", { name: "Save current view" })).toBeVisible();
  await page.getByLabel("View name").fill("Posted invoices");
  await page.getByRole("button", { name: "Save View" }).click();

  await page.getByRole("combobox", { name: "Status" }).click();
  await page.getByRole("option", { name: "Draft" }).click();
  await page.getByRole("button", { name: "Apply Filters" }).click();

  await page.getByRole("combobox", { name: "Saved views" }).click();
  await page.getByRole("option", { name: "Posted invoices" }).click();

  await expect(page.getByRole("combobox", { name: "Status" })).toContainText("Posted");
  await expect(page).toHaveURL(/status=POSTED/);
});
