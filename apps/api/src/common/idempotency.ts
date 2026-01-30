import { createHash } from "crypto";

type JsonValue =
  | null
  | string
  | number
  | boolean
  | JsonValue[]
  | { [key: string]: JsonValue };

export type IdempotencyScope = {
  scope: string;
  actorUserId?: string;
  method?: string;
  path?: string;
};

const normalize = (value: unknown): JsonValue => {
  if (value === null || value === undefined) {
    return null;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalize(item));
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort((a, b) => a.localeCompare(b))
      .map((key) => [key, normalize(record[key])] as const);
    return Object.fromEntries(entries) as JsonValue;
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  return value as JsonValue;
};

export function hashRequestBody(body: unknown) {
  const normalized = normalize(body ?? {});
  const payload = JSON.stringify(normalized);
  return createHash("sha256").update(payload).digest("hex");
}

export function buildIdempotencyKey(key?: string, scope?: IdempotencyScope) {
  if (!key) {
    return undefined;
  }
  if (!scope) {
    return key;
  }
  const parts = [scope.scope];
  if (scope.method) {
    parts.push(scope.method.toUpperCase());
  }
  if (scope.path) {
    parts.push(scope.path);
  }
  if (scope.actorUserId) {
    parts.push(scope.actorUserId);
  }
  return `${key}:${parts.join(":")}`;
}
