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

function LoginPageInner() {
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const allowDefaultCredentials = process.env.NODE_ENV !== "production";
  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    mode: "onChange",
    defaultValues: {
      email: allowDefaultCredentials ? "owner@ledgerlite.local" : "",
      password: allowDefaultCredentials ? "Password123!" : "",
    },
  });
  const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

  const submit = async (values: LoginInput) => {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setAccessToken(result.accessToken);
      router.replace("/home");
    } catch (err) {
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
