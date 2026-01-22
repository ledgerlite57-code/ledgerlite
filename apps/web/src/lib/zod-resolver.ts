import { toNestErrors, validateFieldsNatively } from "@hookform/resolvers";
import type { FieldError, FieldErrors, FieldValues, ResolverOptions, ResolverResult } from "react-hook-form";
import type { ZodIssue, ZodSchema } from "zod";

type ZodResolverOptions = {
  mode?: "sync" | "async";
  raw?: boolean;
};

type ZodResolver = <T extends ZodSchema<unknown>>(
  schema: T,
  schemaOptions?: unknown,
  resolverOptions?: ZodResolverOptions,
) => <TFieldValues extends FieldValues, TContext>(
  values: TFieldValues,
  context: TContext | undefined,
  options: ResolverOptions<TFieldValues>,
) => Promise<ResolverResult<TFieldValues>>;

const buildErrors = (issues: ZodIssue[]) => {
  const errors: Record<string, FieldError> = {};
  for (const issue of issues) {
    const path = issue.path.join(".");
    if (!errors[path]) {
      errors[path] = { type: issue.code, message: issue.message };
    }
  }
  return errors as FieldErrors;
};

export const zodResolver: ZodResolver =
  (schema, schemaOptions, resolverOptions = {}) =>
  async (values, _context, options) => {
    const result =
      resolverOptions.mode === "sync"
        ? schema.safeParse(values, schemaOptions as never)
        : await schema.safeParseAsync(values, schemaOptions as never);

    if (result.success) {
      if (options.shouldUseNativeValidation) {
        validateFieldsNatively({}, options);
      }
      return {
        values: resolverOptions.raw ? values : (result.data as typeof values),
        errors: {} as Record<string, never>,
      };
    }

    const fieldErrors = buildErrors(result.error.issues);
    return {
      values: {} as Record<string, never>,
      errors: toNestErrors(fieldErrors, options),
    };
  };
