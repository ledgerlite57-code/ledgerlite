import { test, expect } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

test("phase 1 flow: dashboard loads, adds account, invites user", async ({ page, request }) => {
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

  await page.goto("/dashboard?tab=accounts");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chart of Accounts" })).toBeVisible();

  const accountCode = `T${Date.now()}`;
  await page.getByRole("button", { name: "New Account" }).click();
  await expect(page.getByRole("heading", { name: "Create account" })).toBeVisible();
  await page.getByLabel("Code *").fill(accountCode);
  await page.getByLabel("Name *").fill("Phase1 Test Account");

  const accountRes = await request.post(`${apiBase}/accounts`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { code: accountCode, name: "Phase1 Test Account", type: "ASSET" },
  });
  expect(accountRes.ok()).toBeTruthy();

  await page.reload();
  await expect(page.getByRole("cell", { name: accountCode })).toBeVisible({ timeout: 10000 });

  const rolesRes = await request.get(`${apiBase}/orgs/roles`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const rolesPayload = (await rolesRes.json()) as { data?: { id: string; name: string }[] };
  const roleId = rolesPayload.data?.find((role) => role.name === "Viewer")?.id ?? rolesPayload.data?.[0]?.id;
  expect(roleId).toBeTruthy();

  const inviteEmail = `invite-${Date.now()}@ledgerlite.local`;
  const inviteRes = await request.post(`${apiBase}/orgs/users/invite`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    data: { email: inviteEmail, roleId },
  });
  const invitePayload = (await inviteRes.json()) as { data?: { token?: string } };
  const token = invitePayload.data?.token;
  expect(token).toBeTruthy();

  const acceptRes = await request.post(`${apiBase}/orgs/users/invite/accept`, {
    data: { token, password: "Password123!" },
  });
  expect(acceptRes.ok()).toBeTruthy();

  await page.goto("/dashboard?tab=users");
  await expect(page.getByText(inviteEmail)).toBeVisible();
});
