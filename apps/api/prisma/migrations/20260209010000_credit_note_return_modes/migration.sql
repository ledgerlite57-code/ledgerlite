ALTER TABLE "CreditNote"
  ADD COLUMN "returnInventory" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "InvoiceLine"
  ADD COLUMN "inventoryUnitCost" DECIMAL(18, 6);

ALTER TABLE "CreditNoteLine"
  ADD COLUMN "sourceInvoiceLineId" TEXT;

ALTER TABLE "CreditNoteLine"
  ADD CONSTRAINT "CreditNoteLine_sourceInvoiceLineId_fkey"
  FOREIGN KEY ("sourceInvoiceLineId") REFERENCES "InvoiceLine"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "CreditNoteLine_sourceInvoiceLineId_idx"
  ON "CreditNoteLine"("sourceInvoiceLineId");
