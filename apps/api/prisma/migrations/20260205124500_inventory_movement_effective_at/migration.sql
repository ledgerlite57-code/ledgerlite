-- Add effectiveAt for inventory cost cutoffs and backdated documents
ALTER TABLE "InventoryMovement"
ADD COLUMN "effectiveAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now();

-- Default to createdAt for all existing rows
UPDATE "InventoryMovement"
SET "effectiveAt" = "createdAt";

-- Backfill document-effective dates
UPDATE "InventoryMovement" im
SET "effectiveAt" = i."invoiceDate"
FROM "Invoice" i
WHERE im."sourceType" = 'INVOICE'
  AND im."sourceId" = i."id";

UPDATE "InventoryMovement" im
SET "effectiveAt" = COALESCE(i."voidedAt", im."createdAt")
FROM "Invoice" i
WHERE im."sourceType" = 'INVOICE_VOID'
  AND im."sourceId" = i."id";

UPDATE "InventoryMovement" im
SET "effectiveAt" = b."billDate"
FROM "Bill" b
WHERE im."sourceType" = 'BILL'
  AND im."sourceId" = b."id";

UPDATE "InventoryMovement" im
SET "effectiveAt" = cn."creditNoteDate"
FROM "CreditNote" cn
WHERE im."sourceType" = 'CREDIT_NOTE'
  AND im."sourceId" = cn."id";

UPDATE "InventoryMovement" im
SET "effectiveAt" = COALESCE(cn."voidedAt", im."createdAt")
FROM "CreditNote" cn
WHERE im."sourceType" = 'CREDIT_NOTE_VOID'
  AND im."sourceId" = cn."id";

CREATE INDEX "InventoryMovement_orgId_itemId_effectiveAt_idx"
ON "InventoryMovement" ("orgId", "itemId", "effectiveAt");
