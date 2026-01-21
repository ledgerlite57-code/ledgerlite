import { ApiEnvelope } from "@ledgerlite/shared";
import { env } from "../env";
import { getAccessToken } from "./auth";

export const apiBaseUrl = env.NEXT_PUBLIC_API_BASE_URL;

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(getAccessToken() ? { Authorization: `Bearer ${getAccessToken()}` } : {}),
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });

  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T> | T;

  if (!response.ok) {
    if (typeof payload === "object" && payload && "ok" in payload && !payload.ok) {
      throw new Error(payload.error?.message ?? "Request failed");
    }
    throw new Error("Request failed");
  }

  if (typeof payload === "object" && payload && "ok" in payload) {
    if (payload.ok) {
      return payload.data as T;
    }
    throw new Error(payload.error?.message ?? "Request failed");
  }

  return payload as T;
}
