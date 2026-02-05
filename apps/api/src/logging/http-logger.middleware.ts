import pinoHttp from "pino-http";
import type { Request, Response } from "express";
import { getApiEnv } from "../common/env";
import { RequestContext } from "./request-context";

function resolveRouteLabel(req: Request) {
  const routePath = typeof req.route?.path === "string" ? req.route.path : undefined;
  if (routePath) {
    const base = typeof req.baseUrl === "string" ? req.baseUrl : "";
    return `${base}${routePath}`;
  }

  const rawPath = req.originalUrl?.split("?")[0] ?? req.url ?? "/";
  const withLeadingSlash = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  return withLeadingSlash.length > 0 ? withLeadingSlash : "/";
}

function isProductionEnvironment(environment: string) {
  const normalized = environment.trim().toLowerCase();
  return normalized === "production" || normalized === "prod";
}

function isStagingEnvironment(environment: string) {
  const normalized = environment.trim().toLowerCase();
  return normalized === "staging" || normalized === "stage";
}

function resolveBaseLogLevel(environment: string) {
  return isProductionEnvironment(environment) ? "info" : "debug";
}

export const httpLogger = pinoHttp<Request, Response>({
  level: resolveBaseLogLevel(getApiEnv().SENTRY_ENVIRONMENT),
  redact: {
    paths: ["req.headers.authorization", "req.body.password", "req.body.refreshToken"],
    censor: "[REDACTED]",
  },
  customAttributeKeys: {
    req: "request",
    res: "response",
    err: "error",
    responseTime: "durationMs",
  },
  autoLogging: {
    ignore: (req) => req.url?.startsWith("/metrics") ?? false,
  },
  customLogLevel: (_req, res, err) => {
    const environment = getApiEnv().SENTRY_ENVIRONMENT;
    if (err || res.statusCode >= 500) {
      return "error";
    }
    if (res.statusCode >= 400) {
      return "warn";
    }
    if (isProductionEnvironment(environment)) {
      return "silent";
    }
    if (isStagingEnvironment(environment)) {
      return "info";
    }
    return "debug";
  },
  customProps: (req, res) => {
    const context = RequestContext.get();
    const apiEnv = getApiEnv();
    return {
      env: apiEnv.SENTRY_ENVIRONMENT,
      service: "api",
      requestId: context?.requestId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      userId: context?.userId,
      orgId: context?.orgId,
      route: resolveRouteLabel(req),
      statusCode: res.statusCode,
    };
  },
});
