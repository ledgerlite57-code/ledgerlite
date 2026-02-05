"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { type ApiEnvelope, type PermissionCode } from "@ledgerlite/shared";
import { apiBaseUrl, ensureAccessToken } from "../../lib/api";
import { clearAccessToken } from "../../lib/auth";

type AuthMeResponse = {
  user: { id: string; email: string; isInternal?: boolean; internalRole?: string | null };
  org: { id: string; name: string; vatEnabled?: boolean; baseCurrency?: string } | null;
  onboardingSetupStatus: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | null;
  permissions: PermissionCode[];
};

type PermissionsStatus = "loading" | "ready" | "unauthenticated" | "error";

type PermissionsContextValue = {
  status: PermissionsStatus;
  user: AuthMeResponse["user"] | null;
  org: AuthMeResponse["org"];
  onboardingSetupStatus: AuthMeResponse["onboardingSetupStatus"];
  permissions: PermissionCode[];
  error: string | null;
  refresh: () => Promise<void>;
  hasPermission: (permission: PermissionCode) => boolean;
  hasAnyPermission: (...permissions: PermissionCode[]) => boolean;
};

const PermissionsContext = createContext<PermissionsContextValue | undefined>(undefined);

const parseApiEnvelope = <T,>(payload: ApiEnvelope<T> | T) => {
  if (typeof payload === "object" && payload && "ok" in payload) {
    if (payload.ok) {
      return payload.data as T;
    }
    throw new Error(payload.error?.message ?? "Request failed");
  }
  return payload as T;
};

export function PermissionsProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<PermissionsStatus>("loading");
  const [user, setUser] = useState<AuthMeResponse["user"] | null>(null);
  const [org, setOrg] = useState<AuthMeResponse["org"]>(null);
  const [onboardingSetupStatus, setOnboardingSetupStatus] = useState<AuthMeResponse["onboardingSetupStatus"]>(null);
  const [permissions, setPermissions] = useState<PermissionCode[]>([]);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setStatus("loading");
    setError(null);

    try {
      const token = await ensureAccessToken();
      if (!token) {
        clearAccessToken();
        setPermissions([]);
        setUser(null);
        setOrg(null);
        setOnboardingSetupStatus(null);
        setStatus("unauthenticated");
        return;
      }

      const response = await fetch(`${apiBaseUrl}/auth/me`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        credentials: "include",
      });

      if (response.status === 401 || response.status === 403) {
        clearAccessToken();
        setPermissions([]);
        setUser(null);
        setOrg(null);
        setOnboardingSetupStatus(null);
        setStatus("unauthenticated");
        return;
      }

      const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<AuthMeResponse> | AuthMeResponse;
      if (!response.ok) {
        if (typeof payload === "object" && payload && "ok" in payload && !payload.ok) {
          throw new Error(payload.error?.message ?? "Request failed");
        }
        throw new Error("Request failed");
      }

      const data = parseApiEnvelope(payload);
      setUser(data.user ?? null);
      setOrg(data.org ?? null);
      setOnboardingSetupStatus(data.onboardingSetupStatus ?? null);
      setPermissions(Array.isArray(data.permissions) ? data.permissions : []);
      setStatus("ready");
    } catch (err) {
      setPermissions([]);
      setUser(null);
      setOrg(null);
      setOnboardingSetupStatus(null);
      setStatus("error");
      setError(err instanceof Error ? err.message : "Unable to load session");
    }
  }, []);

  const hasPermission = useCallback(
    (permission: PermissionCode) => permissions.includes(permission),
    [permissions],
  );

  const hasAnyPermission = useCallback(
    (...required: PermissionCode[]) => required.some((permission) => permissions.includes(permission)),
    [permissions],
  );

  const value = useMemo(
    () => ({
      status,
      user,
      org,
      onboardingSetupStatus,
      permissions,
      error,
      refresh,
      hasPermission,
      hasAnyPermission,
    }),
    [status, user, org, onboardingSetupStatus, permissions, error, refresh, hasPermission, hasAnyPermission],
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  return <PermissionsContext.Provider value={value}>{children}</PermissionsContext.Provider>;
}

export function usePermissions() {
  const context = useContext(PermissionsContext);
  if (!context) {
    throw new Error("usePermissions must be used within PermissionsProvider");
  }
  return context;
}
