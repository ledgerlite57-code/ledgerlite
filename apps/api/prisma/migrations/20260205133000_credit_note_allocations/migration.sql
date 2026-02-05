CREATE TABLE "CreditNoteAllocation" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "orgId" UUID NOT NULL,
  "creditNoteId" UUID NOT NULL,
  "invoiceId" UUID NOT NULL,
  "amount" DECIMAL(18, 2) NOT NULL,
  "createdByUserId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "CreditNoteAllocation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CreditNoteAllocation_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreditNoteAllocation_creditNoteId_fkey" FOREIGN KEY ("creditNoteId") REFERENCES "CreditNote"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "CreditNoteAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "CreditNoteAllocation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "CreditNoteAllocation_creditNoteId_invoiceId_key"
ON "CreditNoteAllocation"("creditNoteId", "invoiceId");

CREATE INDEX "CreditNoteAllocation_orgId_creditNoteId_idx"
ON "CreditNoteAllocation"("orgId", "creditNoteId");

CREATE INDEX "CreditNoteAllocation_orgId_invoiceId_idx"
ON "CreditNoteAllocation"("orgId", "invoiceId");
