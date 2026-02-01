"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "../../src/lib/zod-resolver";
import { loginSchema, type LoginInput } from "@ledgerlite/shared";
import { apiFetch } from "../../src/lib/api";
import { setAccessToken } from "../../src/lib/auth";
import { Button } from "../../src/lib/ui-button";
import { Input } from "../../src/lib/ui-input";
import { ErrorBanner } from "../../src/lib/ui-error-banner";
import { AuthLayout } from "../../src/features/auth/auth-layout";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../src/lib/ui-select";

type OrgOption = { id: string; name: string };

const parseOrgOptions = (details: unknown): OrgOption[] | null => {
  if (!details || typeof details !== "object") {
    return null;
  }
  const orgs = (details as { orgs?: unknown }).orgs;
  if (!Array.isArray(orgs)) {
    return null;
  }
  const parsed = orgs
    .map((org) => {
      if (!org || typeof org !== "object") {
        return null;
      }
      const id = (org as { id?: unknown }).id;
      const name = (org as { name?: unknown }).name;
      if (typeof id !== "string" || typeof name !== "string") {
        return null;
      }
      return { id, name };
    })
    .filter((org): org is OrgOption => Boolean(org));
  return parsed.length > 0 ? parsed : null;
};

function LoginPageInner() {
  const [error, setError] = useState<unknown>(null);
  const [orgOptions, setOrgOptions] = useState<OrgOption[] | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const allowDefaultCredentials = process.env.NODE_ENV !== "production";
  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    defaultValues: {
      email: allowDefaultCredentials ? "owner@ledgerlite.local" : "",
      password: allowDefaultCredentials ? "Password123!" : "",
      orgId: undefined,
    },
  });
  const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

  const submit = async (values: LoginInput) => {
    setError(null);
    setLoading(true);
    try {
      if (orgOptions && !values.orgId) {
        loginForm.setError("orgId", { message: "Select an organization." });
        setLoading(false);
        return;
      }
      const result = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setAccessToken(result.accessToken);
      setOrgOptions(null);
      router.replace("/home");
    } catch (err) {
      const apiError = err as Error & { code?: string; details?: unknown };
      const orgs = apiError.code === "CONFLICT" ? parseOrgOptions(apiError.details) : null;
      if (orgs) {
        setOrgOptions(orgs);
        if (!loginForm.getValues("orgId")) {
          loginForm.setValue("orgId", orgs[0]?.id ?? "", { shouldValidate: true });
        }
      }
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to continue to your ledger workspace."
      footer={
        <p className="muted">
          Have an invite? <Link href="/invite">Accept invite</Link>
        </p>
      }
    >
      {error ? <ErrorBanner error={error} title="Unable to sign in" /> : null}
      {error ? <div style={{ height: 12 }} /> : null}
      <form onSubmit={loginForm.handleSubmit(submit)}>
        <input type="hidden" {...loginForm.register("orgId")} />
        <label>
          Email
          <Input type="email" autoFocus {...loginForm.register("email")} />
          {renderFieldError(loginForm.formState.errors.email?.message)}
        </label>
        <div style={{ height: 12 }} />
        <label>
          Password
          <Input type="password" {...loginForm.register("password")} />
          {renderFieldError(loginForm.formState.errors.password?.message)}
        </label>
        {orgOptions ? (
          <>
            <div style={{ height: 12 }} />
            <label>
              Organization
              <Select
                value={loginForm.watch("orgId") ?? ""}
                onValueChange={(value) => {
                  loginForm.setValue("orgId", value, { shouldValidate: true });
                  setError(null);
                }}
              >
                <SelectTrigger aria-label="Organization">
                  <SelectValue placeholder="Select organization" />
                </SelectTrigger>
                <SelectContent>
                  {orgOptions.map((org) => (
                    <SelectItem key={org.id} value={org.id}>
                      {org.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {renderFieldError(loginForm.formState.errors.orgId?.message)}
            </label>
          </>
        ) : null}
        <div style={{ height: 16 }} />
        <Button type="submit" disabled={loading || !loginForm.formState.isValid}>
          {loading ? "Signing in..." : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card">Loading login...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
