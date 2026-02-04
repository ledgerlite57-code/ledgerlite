import { expect, test } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test("landing page supports mobile layout and theme switching", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByText("Simple Accounting. Clear Numbers. Full Control.")).toBeVisible();

  const themeToggle = page.getByRole("button", { name: "Switch to dark mode" });
  await expect(themeToggle).toBeVisible();
  await themeToggle.click();
  await expect(page.locator("html")).toHaveClass(/dark/);
});

test("protected shell opens mobile navigation drawer", async ({ page, request }) => {
  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email: "owner@ledgerlite.local", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();
  const payload = (await loginRes.json()) as { data?: { accessToken?: string } };
  const accessToken = payload?.data?.accessToken;
  expect(accessToken).toBeTruthy();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken as string);

  await page.goto("/invoices");

  const navToggle = page.getByRole("button", { name: "Open navigation menu" });
  await expect(navToggle).toBeVisible();
  await expect(page.locator(".sidebar")).not.toHaveClass(/open/);

  await navToggle.click();
  await expect(page.locator(".sidebar")).toHaveClass(/open/);
  await expect(page.getByRole("link", { name: "Invoices" })).toBeVisible();
});
