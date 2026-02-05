#!/usr/bin/env node

const swaggerPath = (process.env.SWAGGER_PATH ?? "docs").trim().replace(/^\/+/, "").replace(/\/+$/, "");
const normalizedSwaggerPath = swaggerPath.length > 0 ? swaggerPath : "docs";
const swaggerJsonPath = `${normalizedSwaggerPath}-json`;

const targets = [
  { name: "development", baseUrl: process.env.DEV_API_BASE_URL },
  { name: "staging", baseUrl: process.env.STAGING_API_BASE_URL },
  { name: "production", baseUrl: process.env.PROD_API_BASE_URL },
];

function normalizeBaseUrl(url) {
  if (!url) {
    return "";
  }
  const trimmed = url.trim();
  if (trimmed.length === 0) {
    return "";
  }
  return trimmed.endsWith("/") ? trimmed : `${trimmed}/`;
}

function tokenFor(targetName) {
  if (targetName === "development") {
    return process.env.DEV_SWAGGER_TOKEN?.trim() ?? "";
  }
  if (targetName === "staging") {
    return process.env.STAGING_SWAGGER_TOKEN?.trim() ?? "";
  }
  if (targetName === "production") {
    return process.env.PROD_SWAGGER_TOKEN?.trim() ?? "";
  }
  return "";
}

async function checkSwagger(targetName, baseUrl, token) {
  const url = new URL(swaggerJsonPath, baseUrl).toString();
  const headers = token.length > 0 ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    throw new Error(`${targetName}: ${url} returned HTTP ${response.status}`);
  }

  const body = await response.json();
  const hasOpenApiVersion = typeof body.openapi === "string" && body.openapi.length > 0;
  const hasPaths = body.paths && typeof body.paths === "object";
  if (!hasOpenApiVersion || !hasPaths) {
    throw new Error(`${targetName}: ${url} is missing expected OpenAPI fields`);
  }

  const pathCount = Object.keys(body.paths).length;
  console.log(`[ok] ${targetName} swagger reachable at ${url} (${pathCount} paths)`);
}

async function main() {
  const enabledTargets = targets.filter((target) => normalizeBaseUrl(target.baseUrl).length > 0);
  if (enabledTargets.length === 0) {
    console.error(
      "No API targets configured. Set DEV_API_BASE_URL/STAGING_API_BASE_URL/PROD_API_BASE_URL before running.",
    );
    process.exitCode = 1;
    return;
  }

  let failures = 0;
  for (const target of enabledTargets) {
    const baseUrl = normalizeBaseUrl(target.baseUrl);
    const token = tokenFor(target.name);
    try {
      await checkSwagger(target.name, baseUrl, token);
    } catch (error) {
      failures += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[fail] ${message}`);
    }
  }

  if (failures > 0) {
    process.exitCode = 1;
  }
}

await main();
