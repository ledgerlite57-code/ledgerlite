import { test, expect } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

async function loginAsOwner(request: import("@playwright/test").APIRequestContext) {
  const loginRes = await request.post(`${apiBase}/auth/login`, {
    data: { email: "owner@ledgerlite.local", password: "Password123!" },
  });
  expect(loginRes.ok()).toBeTruthy();
  const payload = (await loginRes.json()) as { data?: { accessToken?: string } };
  const accessToken = payload?.data?.accessToken;
  expect(accessToken).toBeTruthy();
  return accessToken as string;
}

test("logout returns to login screen", async ({ page, request }) => {
  const accessToken = await loginAsOwner(request);
  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page.getByRole("heading", { name: "Login" })).toBeVisible();
});

test("accept invite flow shows success message", async ({ page, request }) => {
  const accessToken = await loginAsOwner(request);

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

  await page.goto("/login");
  await page.getByLabel("Invite Token").fill(token as string);
  await page.getByLabel("Set Password").fill("Password123!");
  await page.getByRole("button", { name: "Accept Invite" }).click();
  await expect(page.getByText("Invite accepted. You can now sign in.")).toBeVisible();
});
