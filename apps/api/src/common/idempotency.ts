import { createHash } from "crypto";

export function hashRequestBody(body: unknown) {
  const payload = JSON.stringify(body ?? {});
  return createHash("sha256").update(payload).digest("hex");
}
