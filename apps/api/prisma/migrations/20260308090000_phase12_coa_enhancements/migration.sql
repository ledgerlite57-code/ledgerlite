-- Create enum
CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');

-- Extend Account
ALTER TABLE "Account" ADD COLUMN "description" TEXT;
ALTER TABLE "Account" ADD COLUMN "parentAccountId" TEXT;
ALTER TABLE "Account" ADD COLUMN "normalBalance" "NormalBalance" NOT NULL DEFAULT 'DEBIT';
ALTER TABLE "Account" ADD COLUMN "isReconcilable" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Account" ADD COLUMN "taxCodeId" TEXT;
ALTER TABLE "Account" ADD COLUMN "externalCode" TEXT;
ALTER TABLE "Account" ADD COLUMN "tags" JSONB;

-- Backfill normal balance
UPDATE "Account" SET "normalBalance" = 'CREDIT'
  WHERE "type" IN ('LIABILITY', 'EQUITY', 'INCOME');

-- Backfill reconcilable accounts
UPDATE "Account" SET "isReconcilable" = true
  WHERE "subtype" IN ('BANK', 'CASH');

-- Indexes
CREATE INDEX "Account_orgId_parentAccountId_idx" ON "Account"("orgId", "parentAccountId");
CREATE INDEX "Account_taxCodeId_idx" ON "Account"("taxCodeId");

-- Foreign keys
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentAccountId_fkey"
  FOREIGN KEY ("parentAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Account" ADD CONSTRAINT "Account_taxCodeId_fkey"
  FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
