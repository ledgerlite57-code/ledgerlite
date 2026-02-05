import type { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import type { NextFunction, Request, Response } from "express";
import type { ApiEnv } from "../common/env";
import { applyZodSchemasToOpenApi } from "./zod-openapi";

type SwaggerSetupResult = {
  enabled: boolean;
  path: string;
  jsonPath: string;
  authRequired: boolean;
};

function normalizeSwaggerPath(path: string) {
  const normalized = path.trim().replace(/^\/+/, "").replace(/\/+$/, "");
  return normalized.length > 0 ? normalized : "docs";
}

function getBearerToken(header: string | undefined) {
  if (!header) {
    return "";
  }
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return token;
}

function createSwaggerAuthMiddleware(expectedToken: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const providedToken = getBearerToken(typeof req.headers.authorization === "string" ? req.headers.authorization : undefined);
    if (providedToken.length > 0 && providedToken === expectedToken) {
      return next();
    }

    res.setHeader("WWW-Authenticate", 'Bearer realm="Swagger"');
    return res.status(401).json({
      ok: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Swagger access requires a valid bearer token.",
      },
    });
  };
}

function matchesSwaggerPath(requestPath: string, path: string, jsonPath: string) {
  const docsPath = `/${path}`;
  const docsAssetsPath = `${docsPath}/`;
  const docsJsonPath = `/${jsonPath}`;
  return (
    requestPath === docsPath ||
    requestPath.startsWith(docsAssetsPath) ||
    requestPath === docsJsonPath ||
    requestPath.startsWith(`${docsJsonPath}/`)
  );
}

export function setupSwagger(app: INestApplication, env: ApiEnv): SwaggerSetupResult {
  if (!env.API_SWAGGER_ENABLED) {
    return { enabled: false, path: "", jsonPath: "", authRequired: false };
  }

  const path = normalizeSwaggerPath(env.API_SWAGGER_PATH);
  const jsonPath = `${path}-json`;
  const token = env.API_SWAGGER_AUTH_TOKEN.trim();
  const authRequired = env.API_SWAGGER_REQUIRE_AUTH;

  if (authRequired && token.length === 0) {
    throw new Error("Invalid API environment configuration: API_SWAGGER_AUTH_TOKEN is required when API_SWAGGER_REQUIRE_AUTH=true");
  }

  if (authRequired) {
    const authMiddleware = createSwaggerAuthMiddleware(token);
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (!matchesSwaggerPath(req.path, path, jsonPath)) {
        return next();
      }
      return authMiddleware(req, res, next);
    });
  }

  const swaggerConfig = new DocumentBuilder()
    .setTitle("LedgerLite API")
    .setDescription("LedgerLite v1.0 API")
    .setVersion("1.0")
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig, { deepScanRoutes: true });
  applyZodSchemasToOpenApi(app, document);
  SwaggerModule.setup(path, app, document, {
    jsonDocumentUrl: `/${jsonPath}`,
  });

  return {
    enabled: true,
    path,
    jsonPath,
    authRequired,
  };
}
