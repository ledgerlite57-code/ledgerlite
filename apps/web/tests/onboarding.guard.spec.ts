import { test, expect, type APIRequestContext } from "@playwright/test";

const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

type ApiEnvelope<T> = {
  ok?: boolean;
  data?: T;
};

type RoleRecord = {
  id: string;
  name: string;
};

type OnboardingProgressRecord = {
  steps: Array<{ stepId: string; status: "PENDING" | "COMPLETED" | "NOT_APPLICABLE" }>;
  summary: { pendingSteps: number };
};

async function unwrapResponse<T>(response: Awaited<ReturnType<APIRequestContext["get"]>>): Promise<T> {
  const payload = (await response.json()) as ApiEnvelope<T> | T;
  if (typeof payload === "object" && payload !== null && "ok" in payload) {
    return (payload as ApiEnvelope<T>).data as T;
  }
  return payload as T;
}

async function login(request: APIRequestContext, email: string, password: string, orgId?: string) {
  const response = await request.post(`${apiBase}/auth/login`, {
    data: orgId ? { email, password, orgId } : { email, password },
  });
  expect(response.ok()).toBeTruthy();
  const payload = await unwrapResponse<{ accessToken: string; orgId?: string | null }>(response);
  expect(payload.accessToken).toBeTruthy();
  return payload;
}

test("blocks protected routes until onboarding is complete, then unblocks access", async ({ page, request }) => {
  const ownerLogin = await login(request, "owner@ledgerlite.local", "Password123!");
  const ownerToken = ownerLogin.accessToken;
  const ownerOrgId = ownerLogin.orgId;
  expect(ownerOrgId).toBeTruthy();

  const rolesRes = await request.get(`${apiBase}/orgs/roles`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
  });
  expect(rolesRes.ok()).toBeTruthy();
  const roles = await unwrapResponse<RoleRecord[]>(rolesRes);
  const ownerRoleId = roles.find((role) => role.name === "Owner")?.id ?? roles[0]?.id;
  expect(ownerRoleId).toBeTruthy();

  const inviteEmail = `onboarding-guard-${Date.now()}@ledgerlite.local`;
  const invitePassword = "Password123!";
  const inviteRes = await request.post(`${apiBase}/orgs/users/invite`, {
    headers: { Authorization: `Bearer ${ownerToken}` },
    data: { email: inviteEmail, roleId: ownerRoleId },
  });
  expect(inviteRes.ok()).toBeTruthy();
  const invitePayload = await unwrapResponse<{ token: string }>(inviteRes);
  expect(invitePayload.token).toBeTruthy();

  const acceptRes = await request.post(`${apiBase}/orgs/users/invite/accept`, {
    data: { token: invitePayload.token, password: invitePassword },
  });
  expect(acceptRes.ok()).toBeTruthy();

  const invitedLogin = await login(request, inviteEmail, invitePassword, ownerOrgId ?? undefined);
  const invitedToken = invitedLogin.accessToken;

  const onboardingRes = await request.get(`${apiBase}/orgs/onboarding`, {
    headers: { Authorization: `Bearer ${invitedToken}` },
  });
  expect(onboardingRes.ok()).toBeTruthy();
  const onboarding = await unwrapResponse<OnboardingProgressRecord>(onboardingRes);
  expect(onboarding.steps.length).toBeGreaterThan(0);

  for (const step of onboarding.steps) {
    const pendingRes = await request.patch(`${apiBase}/orgs/onboarding/steps/${encodeURIComponent(step.stepId)}`, {
      headers: { Authorization: `Bearer ${invitedToken}` },
      data: { status: "PENDING" },
    });
    expect(pendingRes.ok()).toBeTruthy();
  }

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, invitedToken);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/settings\/organization\?onboarding=incomplete/);

  for (const step of onboarding.steps) {
    const completeRes = await request.patch(`${apiBase}/orgs/onboarding/steps/${encodeURIComponent(step.stepId)}`, {
      headers: { Authorization: `Bearer ${invitedToken}` },
      data: { status: "COMPLETED" },
    });
    expect(completeRes.ok()).toBeTruthy();
  }
  const markCompleteRes = await request.post(`${apiBase}/orgs/onboarding/complete`, {
    headers: { Authorization: `Bearer ${invitedToken}` },
  });
  expect(markCompleteRes.ok()).toBeTruthy();
  const completed = await unwrapResponse<OnboardingProgressRecord>(markCompleteRes);
  expect(completed.summary.pendingSteps).toBe(0);

  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/dashboard/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});
