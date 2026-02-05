import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import type { Request } from "express";
import { ApiError, ErrorCode, ErrorCodes } from "@ledgerlite/shared";
import type { Response } from "express";
import { RequestContext } from "../logging/request-context";
import * as Sentry from "@sentry/node";

const capturedErrors = new WeakSet<object>();

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const context = RequestContext.get();
    const requestId = RequestContext.get()?.requestId;

    this.captureException(exception, {
      requestId,
      traceId: context?.traceId,
      spanId: context?.spanId,
      orgId: context?.orgId,
      userId: context?.userId,
      method: request?.method,
      route: request?.originalUrl ?? request?.url,
    });

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCodes.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let details: unknown = undefined;
    let hint: string | undefined;

    const exceptionAny = exception as {
      name?: string;
      message?: string;
      status?: number;
      statusCode?: number;
      response?: Record<string, unknown>;
      getStatus?: () => number;
      getResponse?: () => unknown;
    };

    const isHttpException =
      exception instanceof HttpException ||
      (typeof exceptionAny?.getStatus === "function" && typeof exceptionAny?.getResponse === "function");

    if (isHttpException) {
      status = exceptionAny.getStatus!();
      const payload = exceptionAny.getResponse!();
      if (typeof payload === "string") {
        message = payload;
      } else if (typeof payload === "object" && payload) {
        const body = payload as Record<string, unknown>;
        if (this.isErrorCode(body.code)) {
          code = body.code;
        } else {
          code = this.mapStatusToCode(status);
        }
        if (typeof body.message === "string") {
          message = body.message;
        } else if (Array.isArray(body.message)) {
          message = body.message.filter((item) => typeof item === "string").join(", ") || message;
        }
        if (body.details !== undefined) {
          details = body.details;
        }
        if (typeof body.hint === "string") {
          hint = body.hint;
        }
      }
    } else if (typeof exceptionAny?.status === "number") {
      status = exceptionAny.status;
      code = this.mapStatusToCode(status);
      message = exceptionAny.message ?? message;
    } else if (typeof exceptionAny?.statusCode === "number") {
      status = exceptionAny.statusCode;
      code = this.mapStatusToCode(status);
      message = exceptionAny.message ?? message;
    } else if (exceptionAny?.name === "UnauthorizedException") {
      status = HttpStatus.UNAUTHORIZED;
      code = ErrorCodes.UNAUTHORIZED;
      message = exceptionAny.message ?? "Unauthorized";
    }

    if (status === HttpStatus.UNAUTHORIZED) {
      code = ErrorCodes.UNAUTHORIZED;
      message = message || "Unauthorized";
    }
    if (status === HttpStatus.FORBIDDEN) {
      code = ErrorCodes.FORBIDDEN;
      message = message || "Forbidden";
    }
    if (status === HttpStatus.NOT_FOUND) {
      code = ErrorCodes.NOT_FOUND;
      message = message || "Not found";
    }
    if (status === HttpStatus.CONFLICT) {
      code = ErrorCodes.CONFLICT;
      message = message || "Conflict";
    }
    if (!hint) {
      hint = this.mapStatusToHint(status);
    }

    const body: ApiError = {
      ok: false,
      error: {
        code,
        message,
        details,
        hint,
      },
      requestId,
    };

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error("Unhandled exception", exception);
    }

    response.status(status).json(body);
  }

  private captureException(
    exception: unknown,
    tags: {
      requestId?: string;
      traceId?: string;
      spanId?: string;
      orgId?: string;
      userId?: string;
      method?: string;
      route?: string;
    },
  ) {
    if (typeof exception !== "object" || exception === null) {
      Sentry.captureException(exception);
      return;
    }

    if (capturedErrors.has(exception)) {
      return;
    }

    capturedErrors.add(exception);
    (exception as { __sentryCaptured?: boolean }).__sentryCaptured = true;

    Sentry.withScope((scope) => {
      if (tags.requestId) {
        scope.setTag("requestId", tags.requestId);
      }
      if (tags.traceId) {
        scope.setTag("traceId", tags.traceId);
      }
      if (tags.spanId) {
        scope.setTag("spanId", tags.spanId);
      }
      if (tags.orgId) {
        scope.setTag("orgId", tags.orgId);
      }
      if (tags.userId) {
        scope.setTag("userId", tags.userId);
      }
      if (tags.method) {
        scope.setTag("method", tags.method);
      }
      if (tags.route) {
        scope.setTag("route", tags.route);
      }
      Sentry.captureException(exception);
    });
  }

  private isErrorCode(value: unknown): value is ErrorCode {
    return typeof value === "string" && Object.values(ErrorCodes).includes(value as ErrorCode);
  }

  private mapStatusToCode(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return ErrorCodes.VALIDATION_ERROR;
      case HttpStatus.UNAUTHORIZED:
        return ErrorCodes.UNAUTHORIZED;
      case HttpStatus.FORBIDDEN:
        return ErrorCodes.FORBIDDEN;
      case HttpStatus.NOT_FOUND:
        return ErrorCodes.NOT_FOUND;
      case HttpStatus.CONFLICT:
        return ErrorCodes.CONFLICT;
      default:
        return ErrorCodes.INTERNAL_SERVER_ERROR;
    }
  }

  private mapStatusToHint(status: number) {
    switch (status) {
      case HttpStatus.BAD_REQUEST:
        return "Check the request fields and try again.";
      case HttpStatus.UNAUTHORIZED:
        return "Please sign in again.";
      case HttpStatus.FORBIDDEN:
        return "You do not have access to this action.";
      case HttpStatus.NOT_FOUND:
        return "Check the link or refresh and try again.";
      case HttpStatus.CONFLICT:
        return "Refresh and retry. This may have already been processed.";
      case HttpStatus.INTERNAL_SERVER_ERROR:
      default:
        return "Please try again. If this keeps happening, contact support.";
    }
  }
}
