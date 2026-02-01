import type { ApiEnvelope, ApiError } from "@ledgerlite/shared";
import { env } from "../env";
import { getAccessToken, setAccessToken } from "./auth";

export const apiBaseUrl = env.NEXT_PUBLIC_API_BASE_URL;

const getCookieValue = (name: string) => {
  if (typeof document === "undefined") {
    return undefined;
  }
  const match = document.cookie.match(new RegExp(`(?:^|; )${name.replace(/[-[\]/{}()*+?.\\^$|]/g, "\\$&")}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : undefined;
};

export async function refreshAccessToken() {
  const csrfToken = getCookieValue("csrf_token");
  const response = await fetch(`${apiBaseUrl}/auth/refresh`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
    },
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
  const attachAuthHeader = !path.startsWith("/auth/") || path === "/auth/me";
  const csrfToken = path.startsWith("/auth/") ? getCookieValue("csrf_token") : undefined;
  let token = getAccessToken();

  if (!token && canRefresh) {
    token = await refreshAccessToken();
  }

  const doFetch = (authToken: string | null) =>
    fetch(`${apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(attachAuthHeader && authToken ? { Authorization: `Bearer ${authToken}` } : {}),
        ...(csrfToken ? { "x-csrf-token": csrfToken } : {}),
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
    throw buildApiError(payload);
  }

  if (typeof payload === "object" && payload && "ok" in payload) {
    if (payload.ok) {
      return payload.data as T;
    }
    throw buildApiError(payload);
  }

  return payload as T;
}

type ApiClientError = Error & { code?: string; hint?: string; details?: unknown };

const buildApiError = (payload: ApiEnvelope<unknown> | unknown) => {
  let message = "Request failed";
  let hint: string | undefined;
  let code: string | undefined;
  let details: unknown;

  if (typeof payload === "object" && payload && "ok" in payload && !payload.ok) {
    const apiError = payload as ApiError;
    message = apiError.error?.message ?? message;
    hint = apiError.error?.hint;
    code = apiError.error?.code;
    details = apiError.error?.details;
  } else if (typeof payload === "object" && payload && "message" in payload) {
    message = String((payload as { message?: string }).message ?? message);
  }

  const error = new Error(message) as ApiClientError;
  if (hint) {
    error.hint = hint;
  }
  if (code) {
    error.code = code;
  }
  if (details !== undefined) {
    error.details = details;
  }
  return error;
};
