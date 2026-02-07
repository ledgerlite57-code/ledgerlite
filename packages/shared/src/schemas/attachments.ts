import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(emptyToUndefined, z.string().optional());

export const attachmentCreateSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.coerce.number().int().min(1),
  storageKey: z.string().min(1),
  description: optionalString,
});

export const attachmentListSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
});

export const attachmentUploadSchema = z.object({
  entityType: z.string().min(1),
  entityId: z.string().uuid(),
  description: optionalString,
});

export type AttachmentCreateInput = z.infer<typeof attachmentCreateSchema>;
export type AttachmentListInput = z.infer<typeof attachmentListSchema>;
export type AttachmentUploadInput = z.infer<typeof attachmentUploadSchema>;
