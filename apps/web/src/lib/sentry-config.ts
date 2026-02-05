type SentryRuntime = "client" | "server";

function normalizeEnvironment(raw: string | undefined) {
  const value = (raw ?? "").trim().toLowerCase();
  if (!value) {
    return "development";
  }
  if (value === "dev") {
    return "development";
  }
  if (value === "stage") {
    return "staging";
  }
  if (value === "prod") {
    return "production";
  }
  return value;
}

function parseSampleRate(raw: string | undefined, fallback: number) {
  if (!raw) {
    return fallback;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(1, Math.max(0, parsed));
}

function defaultTraceSampleRate(environment: string) {
  if (environment === "production") {
    return 0.05;
  }
  if (environment === "staging") {
    return 0.2;
  }
  return 1;
}

export function getSentryOptions(runtime: SentryRuntime) {
  const environment = normalizeEnvironment(process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT ?? process.env.NODE_ENV);
  const appVersion = (process.env.NEXT_PUBLIC_APP_VERSION ?? "local-dev").trim() || "local-dev";
  const release = (process.env.NEXT_PUBLIC_SENTRY_RELEASE ?? `web@${appVersion}`).trim() || `web@${appVersion}`;
  const tracesSampleRate = parseSampleRate(
    process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE,
    defaultTraceSampleRate(environment),
  );

  return {
    dsn: process.env.NEXT_PUBLIC_SENTRY_DSN || undefined,
    environment,
    release,
    tracesSampleRate,
    initialScope: {
      tags: {
        service: "web",
        runtime,
        appVersion,
      },
    },
  };
}
