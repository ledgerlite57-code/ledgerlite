"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useForm } from "react-hook-form";
import { registerSchema, type RegisterInput } from "@ledgerlite/shared";
import { zodResolver } from "../../src/lib/zod-resolver";
import { apiFetch } from "../../src/lib/api";
import { AuthLayout } from "../../src/features/auth/auth-layout";
import { ErrorBanner } from "../../src/lib/ui-error-banner";
import { Button } from "../../src/lib/ui-button";
import { Input } from "../../src/lib/ui-input";

function SignupPageInner() {
  const [error, setError] = useState<unknown>(null);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const form = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    mode: "onChange",
    defaultValues: {
      email: "",
      password: "",
    },
  });

  const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

  const submit = async (values: RegisterInput) => {
    setError(null);
    setVerificationEmail(null);
    setLoading(true);
    try {
      const result = await apiFetch<{ email: string; verificationRequired: boolean }>("/auth/register", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setVerificationEmail(result.email);
      form.reset();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign up failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Create your free account"
      subtitle="Create your account, verify your email, and continue to setup."
      footer={
        <p className="muted">
          Already have an account? <Link href="/login">Sign in</Link>
        </p>
      }
    >
      {error ? (
        <>
          <ErrorBanner error={error} title="Unable to create account" />
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {verificationEmail ? (
        <>
          <div className="onboarding-callout">
            Verification email sent to <strong>{verificationEmail}</strong>. Open your inbox and use the link to
            activate your account.
          </div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      <form onSubmit={form.handleSubmit(submit)}>
        <ul className="auth-support-points">
          <li>No credit card required.</li>
        </ul>
        <div style={{ height: 12 }} />
        <label>
          Email
          <Input type="email" autoFocus placeholder="you@company.com" {...form.register("email")} />
          {renderFieldError(form.formState.errors.email?.message)}
        </label>
        <div style={{ height: 12 }} />
        <label>
          Password
          <Input type="password" placeholder="Create a strong password" {...form.register("password")} />
          {renderFieldError(form.formState.errors.password?.message)}
          {!form.formState.errors.password ? (
            <p className="muted">Use 8+ chars with uppercase, lowercase, number, and symbol.</p>
          ) : null}
        </label>
        <p className="auth-trust-note">Secure signup: your account details are encrypted in transit and at rest.</p>
        <div style={{ height: 16 }} />
        <Button type="submit" disabled={loading}>
          {loading ? "Creating..." : "Create Free Account"}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={<div className="card">Loading sign up...</div>}>
      <SignupPageInner />
    </Suspense>
  );
}
