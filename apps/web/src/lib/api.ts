import type { ApiEnvelope } from "@ledgerlite/shared";
import { env } from "../env";
import { getAccessToken, setAccessToken } from "./auth";

export const apiBaseUrl = env.NEXT_PUBLIC_API_BASE_URL;

export async function refreshAccessToken() {
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
  });

  if (!response.ok) {
    return null;
  }

  const payload = (await response.json().catch(() => ({}))) as
    | ApiEnvelope<{ accessToken?: string }>
    | { accessToken?: string };
  let token: string | null = null;
  if (typeof payload === "object" && payload) {
    if ("ok" in payload) {
      token = payload.ok ? payload.data?.accessToken ?? null : null;
    } else if ("accessToken" in payload) {
      token = payload.accessToken ?? null;
    }
  }

  if (token) {
    setAccessToken(token);
  }

  return token;
}

export async function ensureAccessToken() {
  const token = getAccessToken();
  if (token) {
    return token;
  }
  return refreshAccessToken();
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const canRefresh = !path.startsWith("/auth/") || path === "/auth/me";
  let token = getAccessToken();

  if (!token && canRefresh) {
    token = await refreshAccessToken();
  }

  const doFetch = (authToken: string | null) =>
    fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(init?.headers ?? {}),
      },
      credentials: "include",
    });

  let response = await doFetch(token);
  if (response.status === 401 && canRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed && refreshed !== token) {
      response = await doFetch(refreshed);
    }
  }

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
