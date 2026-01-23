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

test("void invoice flow works", async ({ page, request }) => {
  const accessToken = await loginAsOwner(request);
  const authHeaders = { Authorization: `Bearer ${accessToken}` };

  const customersRes = await request.get(`${apiBase}/customers`, { headers: authHeaders });
  expect(customersRes.ok()).toBeTruthy();
  const customersPayload = (await customersRes.json()) as { data?: { data?: { id: string; name: string }[] } };
  const customer = customersPayload.data?.data?.[0];
  expect(customer).toBeTruthy();

  const itemsRes = await request.get(`${apiBase}/items?isActive=true`, { headers: authHeaders });
  expect(itemsRes.ok()).toBeTruthy();
  const itemsPayload = (await itemsRes.json()) as { data?: { id: string; name: string; salePrice?: number }[] };
  const item = itemsPayload.data?.[0];
  expect(item).toBeTruthy();

  const invoiceDate = new Date().toISOString();
  const invoiceRes = await request.post(`${apiBase}/invoices`, {
    headers: authHeaders,
    data: {
      customerId: customer?.id,
      invoiceDate,
      dueDate: invoiceDate,
      currency: "AED",
      lines: [
        {
          itemId: item?.id,
          description: "Phase8 void test",
          qty: 1,
          unitPrice: item?.salePrice ?? 100,
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
    headers: { ...authHeaders, "Idempotency-Key": `phase8-${Date.now()}` },
  });
  expect(postRes.ok()).toBeTruthy();

  await page.addInitScript((token: string) => {
    sessionStorage.setItem("ledgerlite_access_token", token);
  }, accessToken);

  await page.goto(`/invoices/${invoiceId}`);
  await expect(page.getByRole("button", { name: "Void Invoice" })).toBeVisible();
  await page.getByRole("button", { name: "Void Invoice" }).click();
  await expect(page.getByRole("heading", { name: "Void invoice" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm Void" }).click();
  await expect(page.getByText("VOID")).toBeVisible();
});
