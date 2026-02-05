import "reflect-metadata";
import "dotenv/config";
import { NestFactory } from "@nestjs/core";
import helmet from "helmet";
import { AppModule } from "./app.module";
import { requestContextMiddleware } from "./logging/request-context.middleware";
import { httpLogger } from "./logging/http-logger.middleware";
import * as Sentry from "@sentry/node";
import type { NextFunction, Request, Response } from "express";
import cookieParser from "cookie-parser";
import { getApiEnv } from "./common/env";
import { HttpErrorFilter } from "./common/http-exception.filter";
import { ResponseInterceptor } from "./common/response.interceptor";
import { MetricsService } from "./metrics/metrics.service";
import { RequestContext } from "./logging/request-context";
import { setupSwagger } from "./swagger/setup-swagger";

function defaultSentryTraceSampleRate(environment: string) {
  const normalized = environment.trim().toLowerCase();
  if (normalized === "production" || normalized === "prod") {
    return 0.05;
  }
  if (normalized === "staging" || normalized === "stage") {
    return 0.2;
  }
  return 1;
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const env = getApiEnv();
  const sentryRelease = env.SENTRY_RELEASE || `api@${process.env.NEXT_PUBLIC_APP_VERSION ?? "local-dev"}`;
  Sentry.init({
    dsn: env.SENTRY_DSN || undefined,
    environment: env.SENTRY_ENVIRONMENT,
    release: sentryRelease,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE ?? defaultSentryTraceSampleRate(env.SENTRY_ENVIRONMENT),
    profilesSampleRate: env.SENTRY_PROFILES_SAMPLE_RATE ?? 0,
    initialScope: (scope) => {
      scope.setTag("service", "api");
      scope.setTag("release", sentryRelease);
      return scope;
    },
  });

  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.use((req: Request, _res: Response, next: NextFunction) => {
    const context = RequestContext.get();
    const scope = Sentry.getCurrentScope();
    scope.setTag("path", req.path);
    if (context?.requestId) {
      scope.setTag("requestId", context.requestId);
    }
    if (context?.traceId) {
      scope.setTag("traceId", context.traceId);
    }
    next();
  });
  app.use(httpLogger);
  const metricsService = app.get(MetricsService);
  app.use((req: Request, res: Response, next: NextFunction) => {
    const startedAt = process.hrtime.bigint();
    res.on("finish", () => {
      const elapsedNanoseconds = process.hrtime.bigint() - startedAt;
      metricsService.recordHttpRequest({
        method: req.method,
        route: metricsService.resolveRoute(req),
        statusCode: res.statusCode,
        durationSeconds: Number(elapsedNanoseconds) / 1_000_000_000,
      });
    });
    next();
  });
  app.use(helmet());
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({
    origin: env.API_CORS_ORIGIN,
    credentials: true,
  });

  setupSwagger(app, env);
  app.use((err: Error, _req: Request, _res: Response, next: NextFunction) => {
    const alreadyCaptured = (err as { __sentryCaptured?: boolean }).__sentryCaptured;
    if (!alreadyCaptured) {
      Sentry.captureException(err);
    }
    next();
  });

  const port = env.API_PORT;
  await app.listen(port);
}

bootstrap();
