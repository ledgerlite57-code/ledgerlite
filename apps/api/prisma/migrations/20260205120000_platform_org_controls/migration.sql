-- Platform org controls: activation/deactivation + org-level gating

ALTER TABLE "Organization"
  ADD COLUMN "isActive" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Organization_isActive_idx" ON "Organization" ("isActive");

