"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { inviteAcceptSchema, loginSchema, type InviteAcceptInput, type LoginInput } from "@ledgerlite/shared";
import { apiFetch } from "../../src/lib/api";
import { setAccessToken } from "../../src/lib/auth";
import { Button } from "../../src/lib/ui-button";
import { Input } from "../../src/lib/ui-input";

function LoginPageInner() {
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);
  const searchParams = useSearchParams();
  const loginForm = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: "owner@ledgerlite.local",
      password: "Password123!",
    },
  });
  const inviteForm = useForm<InviteAcceptInput>({
    resolver: zodResolver(inviteAcceptSchema),
    defaultValues: {
      token: "",
      password: "",
    },
  });

  const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

  useEffect(() => {
    const token = searchParams.get("inviteToken");
    if (token) {
      inviteForm.setValue("token", token);
    }
  }, [searchParams, inviteForm]);

  const submit = async (values: LoginInput) => {
    setError(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ accessToken: string }>("/auth/login", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setAccessToken(result.accessToken);
      window.location.assign("/dashboard");
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
      <main className="content">
        <div className="card" style={{ maxWidth: 420 }}>
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
        </div>
        <div className="card" style={{ maxWidth: 420 }}>
          <h2>Accept Invite</h2>
          <form
            onSubmit={inviteForm.handleSubmit(async (values) => {
              setInviteMessage(null);
              try {
                await apiFetch("/orgs/users/invite/accept", {
                  method: "POST",
                  body: JSON.stringify(values),
                });
                setInviteMessage("Invite accepted. You can now sign in.");
                inviteForm.reset();
              } catch (err) {
                setInviteMessage(err instanceof Error ? err.message : "Invite acceptance failed");
              }
            })}
          >
            <label>
              Invite Token
              <Input {...inviteForm.register("token")} />
              {renderFieldError(inviteForm.formState.errors.token?.message)}
            </label>
            <div style={{ height: 12 }} />
            <label>
              Set Password
              <Input type="password" {...inviteForm.register("password")} />
              {renderFieldError(inviteForm.formState.errors.password?.message)}
            </label>
            <div style={{ height: 16 }} />
            <Button type="submit">
              Accept Invite
            </Button>
            {inviteMessage ? <p className="muted">{inviteMessage}</p> : null}
          </form>
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
