"use client";

import { Suspense, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "../../src/lib/zod-resolver";
import { loginSchema, type LoginInput } from "@ledgerlite/shared";
import { apiFetch } from "../../src/lib/api";
import { setAccessToken } from "../../src/lib/auth";
import { Button } from "../../src/lib/ui-button";
import { Input } from "../../src/lib/ui-input";
import Link from "next/link";

function LoginPageInner() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const allowDefaultCredentials = process.env.NODE_ENV !== "production";
  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
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
    <div className="page">
      <header className="header">
        <strong>LedgerLite</strong>
      </header>
      <main className="content" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 420, display: "grid", gap: 16 }}>
          <div className="card">
            <h1>Login</h1>
            <form onSubmit={loginForm.handleSubmit(submit)}>
              <label>
                Email
                <Input type="email" {...loginForm.register("email")} />
                {renderFieldError(loginForm.formState.errors.email?.message)}
              </label>
              <div style={{ height: 12 }} />
              <label>
                Password
                <Input type="password" {...loginForm.register("password")} />
                {renderFieldError(loginForm.formState.errors.password?.message)}
              </label>
              <div style={{ height: 16 }} />
              <Button type="submit" disabled={loading}>
                {loading ? "Signing in..." : "Sign in"}
              </Button>
              {error ? <p className="form-error">{error}</p> : null}
            </form>
            <div style={{ height: 12 }} />
            <p className="muted">
              Have an invite? <Link href="/invite">Accept invite</Link>
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="card">Loading login...</div>}>
      <LoginPageInner />
    </Suspense>
  );
}
