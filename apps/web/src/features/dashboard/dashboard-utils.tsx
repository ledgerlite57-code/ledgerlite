"use client";

type FieldErrorLike = { message?: string };

export const renderFieldError = (error?: FieldErrorLike, fallback?: string) =>
  error ? <p className="form-error">{fallback ?? error.message ?? "This field is required."}</p> : null;

export const formatLabel = (value: string) =>
  value
    .split("_")
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(" ");
