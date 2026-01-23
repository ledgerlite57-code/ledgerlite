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

function InvitePageInner() {
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
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
    }
  }, [searchParams, form]);

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
    <div className="page">
      <header className="header">
        <strong>LedgerLite</strong>
        <Link href="/login">Back to login</Link>
      </header>
      <main className="content" style={{ display: "flex", justifyContent: "center", alignItems: "center" }}>
        <div style={{ width: "100%", maxWidth: 420 }}>
          <div className="card">
            <h1>Accept invite</h1>
            <p className="muted">Set a password to activate your account.</p>
            <form onSubmit={form.handleSubmit(submit)}>
              <label>
                Invite Token
                <Input {...form.register("token")} />
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
              {error ? <p className="form-error">{error}</p> : null}
              {actionMessage ? <p className="muted">{actionMessage}</p> : null}
            </form>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={<div className="card">Loading invite...</div>}>
      <InvitePageInner />
    </Suspense>
  );
}
