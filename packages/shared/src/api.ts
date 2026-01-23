import type { ErrorCode } from "./errors";

export type ApiSuccess<T> = {
  ok: true;
  data: T;
  requestId?: string;
};

export type ApiError = {
  ok: false;
  error: {
    code: ErrorCode;
    message: string;
    details?: unknown;
    hint?: string;
  };
  requestId?: string;
};

export type ApiEnvelope<T> = ApiSuccess<T> | ApiError;
