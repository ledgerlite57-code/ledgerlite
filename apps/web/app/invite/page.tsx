"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "../../src/lib/zod-resolver";
import { inviteAcceptSchema, type InviteAcceptInput } from "@ledgerlite/shared";
import { apiFetch } from "../../src/lib/api";
import { Button } from "../../src/lib/ui-button";
import { Input } from "../../src/lib/ui-input";
import { ErrorBanner } from "../../src/lib/ui-error-banner";
import { AuthLayout } from "../../src/features/auth/auth-layout";

function InvitePageInner() {
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [missingToken, setMissingToken] = useState(false);
  const [prefilledToken, setPrefilledToken] = useState(false);
  const searchParams = useSearchParams();

  const form = useForm<InviteAcceptInput>({
    resolver: zodResolver(inviteAcceptSchema),
    defaultValues: {
      token: "",
      password: "",
    },
  });

  const renderFieldError = (message?: string) => (message ? <p className="form-error">{message}</p> : null);

  useEffect(() => {
    const token = searchParams.get("token");
    if (token) {
      form.setValue("token", token);
      setPrefilledToken(true);
      setMissingToken(false);
    } else {
      setPrefilledToken(false);
      setMissingToken(true);
    }
  }, [searchParams, form]);

  const tokenValue = form.watch("token");

  useEffect(() => {
    if (tokenValue?.trim()) {
      setMissingToken(false);
    } else if (!prefilledToken) {
      setMissingToken(true);
    }
  }, [tokenValue, prefilledToken]);

  const submit = async (values: InviteAcceptInput) => {
    setLoading(true);
    setError(null);
    setActionMessage(null);
    try {
      await apiFetch("/orgs/users/invite/accept", {
        method: "POST",
        body: JSON.stringify(values),
      });
      setActionMessage("Invite accepted. You can now sign in.");
      form.reset({ token: values.token, password: "" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invite acceptance failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      title="Accept invite"
      subtitle="Set a password to activate your account."
      footer={
        <p className="muted">
          <Link href="/login">Back to login</Link>
        </p>
      }
    >
      {missingToken ? (
        <>
          <ErrorBanner error="Invite token missing. Paste the token from your invite email." title="Invite token required" />
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {error ? (
        <>
          <ErrorBanner error={error} title="Unable to accept invite" />
          <div style={{ height: 12 }} />
        </>
      ) : null}
      {actionMessage ? (
        <>
          <div className="onboarding-callout">{actionMessage}</div>
          <div style={{ height: 12 }} />
        </>
      ) : null}
      <form onSubmit={form.handleSubmit(submit)}>
        <label>
          Invite Token
          <Input
            {...form.register("token")}
            readOnly={prefilledToken}
            aria-readonly={prefilledToken}
            aria-invalid={missingToken}
            className={missingToken ? "border-destructive focus-visible:ring-destructive/60" : undefined}
            autoFocus={!prefilledToken}
          />
          {renderFieldError(form.formState.errors.token?.message)}
        </label>
        <div style={{ height: 12 }} />
        <label>
          Set Password
          <Input type="password" {...form.register("password")} />
          {renderFieldError(form.formState.errors.password?.message)}
        </label>
        <div style={{ height: 16 }} />
        <Button type="submit" disabled={loading}>
          {loading ? "Accepting..." : "Accept Invite"}
        </Button>
      </form>
    </AuthLayout>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="card">Loading invite...</div>}>
      <InvitePageInner />
    </Suspense>
  );
}
