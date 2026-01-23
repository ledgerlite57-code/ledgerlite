import { test, expect } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test("phase 5 error banner shows hint", async ({ page, request }) => {
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

  await page.goto("/invoices/not-a-real-id");

  await expect(page.getByText(/Hint:/)).toBeVisible();
  await expect(page.getByText(/Check the link or refresh/)).toBeVisible();
});
