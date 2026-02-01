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
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const env = getApiEnv();
  Sentry.init({
    dsn: env.SENTRY_DSN || undefined,
    environment: env.SENTRY_ENVIRONMENT,
  });

  app.use((req: Request, _res: Response, next: NextFunction) => {
    Sentry.getCurrentScope().setTag("path", req.path);
    next();
  });
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.use(httpLogger);
  app.use(helmet());
  app.useGlobalFilters(new HttpErrorFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());
  app.enableCors({
    origin: env.API_CORS_ORIGIN,
    credentials: true,
  });

  if (process.env.NODE_ENV !== "production") {
    const swaggerConfig = new DocumentBuilder()
      .setTitle("LedgerLite API")
      .setDescription("LedgerLite v1.0 API")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("docs", app, document);
  }
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
