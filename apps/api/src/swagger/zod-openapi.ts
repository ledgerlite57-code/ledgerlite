import { RequestMethod, type INestApplication } from "@nestjs/common";
import { METHOD_METADATA, PATH_METADATA, PIPES_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { z } from "zod";
import { ZodValidationPipe } from "../common/zod-validation.pipe";

type SwaggerDocument = Record<string, unknown> & {
  paths?: Record<string, unknown>;
};

type MethodKey = "get" | "post" | "put" | "delete" | "patch" | "options" | "head" | "search" | "all";

type RouteSchemaBundle = {
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
  params?: Record<string, unknown>;
};

type RouteParamKinds = {
  hasBody: boolean;
  hasQuery: boolean;
  hasParam: boolean;
};

const METHOD_MAP: Partial<Record<RequestMethod, MethodKey>> = {
  [RequestMethod.GET]: "get",
  [RequestMethod.POST]: "post",
  [RequestMethod.PUT]: "put",
  [RequestMethod.DELETE]: "delete",
  [RequestMethod.PATCH]: "patch",
  [RequestMethod.OPTIONS]: "options",
  [RequestMethod.HEAD]: "head",
  [RequestMethod.SEARCH]: "search",
  [RequestMethod.ALL]: "all",
};

function stripJsonSchemaKeyword(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map((entry) => stripJsonSchemaKeyword(entry));
  }

  if (input && typeof input === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      if (key === "$schema") {
        continue;
      }
      result[key] = stripJsonSchemaKeyword(value);
    }
    return result;
  }

  return input;
}

function resolveParamType(metadataKey: string, recordType: unknown) {
  if (typeof recordType === "number") {
    return Number.isFinite(recordType) ? recordType : undefined;
  }
  if (typeof recordType === "string") {
    const parsed = Number.parseInt(recordType.split(":")[0] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  const parsedFromKey = Number.parseInt(metadataKey.split(":")[0] ?? "", 10);
  return Number.isFinite(parsedFromKey) ? parsedFromKey : undefined;
}

function normalizePath(path?: string) {
  if (!path || path.trim().length === 0) {
    return "";
  }
  const withSlash = path.startsWith("/") ? path : `/${path}`;
  return withSlash.replace(/\/{2,}/g, "/").replace(/\/$/, "");
}

function toSwaggerPath(controllerPath: string, methodPath?: string) {
  const fullPath = `${normalizePath(controllerPath)}${normalizePath(methodPath)}` || "/";
  const normalized = fullPath.replace(/\/{2,}/g, "/");
  return normalized.replace(/:([A-Za-z0-9_]+)/g, "{$1}");
}

function extractRouteSchemas(argsMetadata: Record<string, unknown> | undefined): RouteSchemaBundle {
  if (!argsMetadata) {
    return {};
  }

  const result: RouteSchemaBundle = {};
  for (const [metadataKey, entry] of Object.entries(argsMetadata)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as { type?: unknown; pipes?: unknown[] };
    const paramType = resolveParamType(metadataKey, record.type);
    if (paramType === undefined) {
      continue;
    }

    const pipes = Array.isArray(record.pipes) ? record.pipes : [];
    const zodPipe = pipes.find((pipe) => {
      if (!pipe || typeof pipe !== "object") {
        return false;
      }
      const candidate = pipe as { constructor?: { name?: string } };
      return candidate.constructor?.name === ZodValidationPipe.name && "schema" in candidate;
    }) as { schema?: unknown } | undefined;

    const zodSchema = zodPipe?.schema;
    if (!zodSchema) {
      continue;
    }

    const jsonSchema = stripJsonSchemaKeyword(
      z.toJSONSchema(zodSchema as Parameters<typeof z.toJSONSchema>[0], { unrepresentable: "any" }),
    ) as
      | Record<string, unknown>
      | undefined;
    if (!jsonSchema) {
      continue;
    }

    if (paramType === RouteParamtypes.BODY) {
      result.body = jsonSchema;
    }
    if (paramType === RouteParamtypes.QUERY) {
      result.query = jsonSchema;
    }
    if (paramType === RouteParamtypes.PARAM) {
      result.params = jsonSchema;
    }
  }

  return result;
}

function getRouteParamKinds(argsMetadata: Record<string, unknown> | undefined): RouteParamKinds {
  const kinds: RouteParamKinds = {
    hasBody: false,
    hasQuery: false,
    hasParam: false,
  };

  if (!argsMetadata) {
    return kinds;
  }

  for (const [metadataKey, entry] of Object.entries(argsMetadata)) {
    if (!entry || typeof entry !== "object") {
      continue;
    }

    const record = entry as { type?: unknown };
    const paramType = resolveParamType(metadataKey, record.type);
    if (paramType === undefined) {
      continue;
    }

    if (paramType === RouteParamtypes.BODY) {
      kinds.hasBody = true;
    }
    if (paramType === RouteParamtypes.QUERY) {
      kinds.hasQuery = true;
    }
    if (paramType === RouteParamtypes.PARAM) {
      kinds.hasParam = true;
    }
  }

  return kinds;
}

function extractFirstSchemaFromPipes(pipes: unknown[] | undefined) {
  if (!pipes || pipes.length === 0) {
    return undefined;
  }

  for (const pipe of pipes) {
    if (!pipe || typeof pipe !== "object") {
      continue;
    }
    const candidate = pipe as { constructor?: { name?: string }; schema?: unknown };
    if (candidate.constructor?.name !== ZodValidationPipe.name || !candidate.schema) {
      continue;
    }
    return stripJsonSchemaKeyword(
      z.toJSONSchema(candidate.schema as Parameters<typeof z.toJSONSchema>[0], { unrepresentable: "any" }),
    ) as Record<string, unknown>;
  }

  return undefined;
}

function buildQueryParameters(schema: Record<string, unknown>) {
  const properties = (schema.properties as Record<string, unknown> | undefined) ?? {};
  const requiredSet = new Set((schema.required as string[] | undefined) ?? []);

  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: "query",
    required: requiredSet.has(name),
    schema: propertySchema,
  }));
}

function buildPathParameters(schema: Record<string, unknown>) {
  const properties = (schema.properties as Record<string, unknown> | undefined) ?? {};
  return Object.entries(properties).map(([name, propertySchema]) => ({
    name,
    in: "path",
    required: true,
    schema: propertySchema,
  }));
}

export function applyZodSchemasToOpenApi(app: INestApplication, document: SwaggerDocument | unknown) {
  const swaggerDocument = document as SwaggerDocument;
  const modulesContainer = (app as unknown as { container?: { getModules: () => Map<string, unknown> } }).container;
  if (!modulesContainer?.getModules || !swaggerDocument.paths) {
    return;
  }

  const modules = modulesContainer.getModules();
  for (const moduleRef of modules.values()) {
    const controllers = (moduleRef as { controllers?: Map<string, unknown> }).controllers;
    if (!controllers) {
      continue;
    }

    for (const wrapper of controllers.values()) {
      const instance = (wrapper as { instance?: object }).instance;
      const metatype = (wrapper as { metatype?: unknown }).metatype;
      const controllerType =
        (typeof metatype === "function" ? (metatype as { prototype: Record<string, unknown> }) : undefined) ??
        (instance?.constructor as { prototype: Record<string, unknown> } | undefined);
      if (!controllerType?.prototype) {
        continue;
      }

      const controllerPath = Reflect.getMetadata(PATH_METADATA, controllerType) as string | undefined;
      const prototype = controllerType.prototype as Record<string, unknown>;
      for (const methodName of Object.getOwnPropertyNames(prototype)) {
        if (methodName === "constructor") {
          continue;
        }

        const handler = prototype[methodName];
        if (typeof handler !== "function") {
          continue;
        }

        const requestMethod = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        const methodPath = Reflect.getMetadata(PATH_METADATA, handler) as string | undefined;
        if (requestMethod === undefined) {
          continue;
        }

        const methodKey = METHOD_MAP[requestMethod];
        if (!methodKey) {
          continue;
        }

        const swaggerPath = toSwaggerPath(controllerPath ?? "", methodPath);
        const pathItem = swaggerDocument.paths[swaggerPath] as Record<string, unknown> | undefined;
        const operation = pathItem?.[methodKey] as Record<string, unknown> | undefined;
        if (!operation) {
          continue;
        }

        const argsMetadata =
          (Reflect.getMetadata(ROUTE_ARGS_METADATA, controllerType, methodName) as Record<string, unknown> | undefined) ??
          (Reflect.getMetadata(ROUTE_ARGS_METADATA, handler) as Record<string, unknown> | undefined);
        const schemas = extractRouteSchemas(argsMetadata);
        const paramKinds = getRouteParamKinds(argsMetadata);

        const controllerPipes = Reflect.getMetadata(PIPES_METADATA, controllerType) as unknown[] | undefined;
        const handlerPipes = Reflect.getMetadata(PIPES_METADATA, handler) as unknown[] | undefined;
        const pipeSchema = extractFirstSchemaFromPipes([...(controllerPipes ?? []), ...(handlerPipes ?? [])]);

        if (!schemas.body && pipeSchema && paramKinds.hasBody) {
          schemas.body = pipeSchema;
        }
        if (!schemas.query && pipeSchema && paramKinds.hasQuery) {
          schemas.query = pipeSchema;
        }
        if (!schemas.params && pipeSchema && paramKinds.hasParam) {
          schemas.params = pipeSchema;
        }
        if (!schemas.body && !schemas.query && !schemas.params && pipeSchema) {
          // Some decorators (e.g. @UsePipes on handler) do not expose parameter-level metadata consistently.
          // Default to request body to keep auth/signup-style routes documented.
          schemas.body = pipeSchema;
        }
        const existingParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
        const mergedParameters = [...existingParameters];

        if (schemas.query) {
          const queryParameters = buildQueryParameters(schemas.query);
          for (const parameter of queryParameters) {
            if (!mergedParameters.some((item) => item?.in === "query" && item?.name === parameter.name)) {
              mergedParameters.push(parameter);
            }
          }
        }

        if (schemas.params) {
          const pathParameters = buildPathParameters(schemas.params);
          for (const parameter of pathParameters) {
            if (!mergedParameters.some((item) => item?.in === "path" && item?.name === parameter.name)) {
              mergedParameters.push(parameter);
            }
          }
        }

        if (mergedParameters.length > 0) {
          operation.parameters = mergedParameters;
        }

        if (schemas.body) {
          operation.requestBody = {
            required: true,
            content: {
              "application/json": {
                schema: schemas.body,
              },
            },
          };
        }
      }
    }
  }
}
