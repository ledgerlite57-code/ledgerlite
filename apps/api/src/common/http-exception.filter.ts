import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from "@nestjs/common";
import { ApiError, ErrorCode, ErrorCodes } from "@ledgerlite/shared";
import type { Response } from "express";
import { RequestContext } from "../logging/request-context";

@Catch()
export class HttpErrorFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const requestId = RequestContext.get()?.requestId;

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = ErrorCodes.INTERNAL_SERVER_ERROR;
    let message = "Internal server error";
    let details: unknown = undefined;

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

    const body: ApiError = {
      ok: false,
      error: {
        code,
        message,
        details,
      },
      requestId,
    };

    if (status === HttpStatus.INTERNAL_SERVER_ERROR) {
      console.error("Unhandled exception", exception);
    }

    response.status(status).json(body);
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
}
