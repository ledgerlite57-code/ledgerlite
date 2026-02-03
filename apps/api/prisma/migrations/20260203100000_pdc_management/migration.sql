-- CreateEnum
CREATE TYPE "PdcDirection" AS ENUM ('INCOMING', 'OUTGOING');

-- CreateEnum
CREATE TYPE "PdcStatus" AS ENUM ('DRAFT', 'SCHEDULED', 'DEPOSITED', 'CLEARED', 'BOUNCED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "GLSourceType" ADD VALUE IF NOT EXISTS 'PDC_INCOMING';
ALTER TYPE "GLSourceType" ADD VALUE IF NOT EXISTS 'PDC_OUTGOING';

-- CreateTable
CREATE TABLE "Pdc" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "number" TEXT,
  "direction" "PdcDirection" NOT NULL,
  "status" "PdcStatus" NOT NULL DEFAULT 'DRAFT',
  "customerId" TEXT,
  "vendorId" TEXT,
  "bankAccountId" TEXT NOT NULL,
  "chequeNumber" TEXT NOT NULL,
  "chequeDate" TIMESTAMPTZ(6) NOT NULL,
  "expectedClearDate" TIMESTAMPTZ(6) NOT NULL,
  "depositedAt" TIMESTAMPTZ(6),
  "clearedAt" TIMESTAMPTZ(6),
  "bouncedAt" TIMESTAMPTZ(6),
  "cancelledAt" TIMESTAMPTZ(6),
  "currency" TEXT NOT NULL,
  "exchangeRate" DECIMAL(18,6),
  "amountTotal" DECIMAL(18,2) NOT NULL,
  "reference" TEXT,
  "memo" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "Pdc_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PdcAllocation" (
  "id" TEXT NOT NULL,
  "pdcId" TEXT NOT NULL,
  "invoiceId" TEXT,
  "billId" TEXT,
  "amount" DECIMAL(18,2) NOT NULL,
  CONSTRAINT "PdcAllocation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Pdc_orgId_number_key" ON "Pdc"("orgId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Pdc_orgId_direction_bankAccountId_chequeNumber_key" ON "Pdc"("orgId", "direction", "bankAccountId", "chequeNumber");

-- CreateIndex
CREATE INDEX "Pdc_orgId_status_expectedClearDate_idx" ON "Pdc"("orgId", "status", "expectedClearDate");

-- CreateIndex
CREATE INDEX "Pdc_orgId_direction_status_idx" ON "Pdc"("orgId", "direction", "status");

-- CreateIndex
CREATE UNIQUE INDEX "PdcAllocation_pdcId_invoiceId_key" ON "PdcAllocation"("pdcId", "invoiceId");

-- CreateIndex
CREATE UNIQUE INDEX "PdcAllocation_pdcId_billId_key" ON "PdcAllocation"("pdcId", "billId");

-- CreateIndex
CREATE INDEX "PdcAllocation_invoiceId_idx" ON "PdcAllocation"("invoiceId");

-- CreateIndex
CREATE INDEX "PdcAllocation_billId_idx" ON "PdcAllocation"("billId");

-- AddForeignKey
ALTER TABLE "Pdc"
  ADD CONSTRAINT "Pdc_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pdc"
  ADD CONSTRAINT "Pdc_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pdc"
  ADD CONSTRAINT "Pdc_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pdc"
  ADD CONSTRAINT "Pdc_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pdc"
  ADD CONSTRAINT "Pdc_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdcAllocation"
  ADD CONSTRAINT "PdcAllocation_pdcId_fkey" FOREIGN KEY ("pdcId") REFERENCES "Pdc"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdcAllocation"
  ADD CONSTRAINT "PdcAllocation_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PdcAllocation"
  ADD CONSTRAINT "PdcAllocation_billId_fkey" FOREIGN KEY ("billId") REFERENCES "Bill"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
