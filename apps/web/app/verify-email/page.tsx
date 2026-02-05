"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "../../src/lib/api";
import { setAccessToken } from "../../src/lib/auth";
import { AuthLayout } from "../../src/features/auth/auth-layout";
import { ErrorBanner } from "../../src/lib/ui-error-banner";
import { Button } from "../../src/lib/ui-button";

type VerifyStatus = "idle" | "verifying" | "success" | "error";

function VerifyEmailPageInner() {
  const [status, setStatus] = useState<VerifyStatus>("idle");
  const [error, setError] = useState<unknown>(null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setError(new Error("Missing verification token."));
      return;
    }

    let active = true;
    const verify = async () => {
      setStatus("verifying");
      setError(null);
      try {
        const result = await apiFetch<{ accessToken: string }>("/auth/verify-email", {
          method: "POST",
          body: JSON.stringify({ token }),
        });
        if (!active) {
          return;
        }
        setAccessToken(result.accessToken);
        setStatus("success");
        router.replace("/home");
      } catch (err) {
        if (!active) {
          return;
        }
        setError(err instanceof Error ? err : new Error("Unable to verify email."));
        setStatus("error");
      }
    };

    verify();
    return () => {
      active = false;
    };
  }, [router, token]);

  return (
    <AuthLayout
      title="Verify your email"
      subtitle="Confirming your account and preparing your workspace."
      footer={
        <p className="muted">
          Already verified? <Link href="/login">Sign in</Link>
        </p>
      }
    >
      {status === "verifying" ? <p className="muted">Verifying your email...</p> : null}
      {status === "error" ? (
        <>
          <ErrorBanner error={error} title="Verification failed" />
          <div style={{ height: 12 }} />
          <Button asChild>
            <Link href="/signup">Create account again</Link>
          </Button>
        </>
      ) : null}
    </AuthLayout>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="card">Loading verification...</div>}>
      <VerifyEmailPageInner />
    </Suspense>
  );
}
