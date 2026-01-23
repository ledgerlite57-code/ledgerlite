-- AlterTable
ALTER TABLE "Item"
ADD COLUMN "trackInventory" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "reorderPoint" INTEGER,
ADD COLUMN "openingQty" DECIMAL(18, 4),
ADD COLUMN "openingValue" DECIMAL(18, 2);

-- AlterTable
ALTER TABLE "Invoice"
ADD COLUMN "reference" TEXT;

-- AlterTable
ALTER TABLE "Bill"
ADD COLUMN "reference" TEXT;

-- AlterTable
ALTER TABLE "InvoiceLine"
ADD COLUMN "incomeAccountId" TEXT;

-- CreateIndex
CREATE INDEX "Item_orgId_sku_idx" ON "Item"("orgId", "sku");

-- AddForeignKey
ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_incomeAccountId_fkey"
FOREIGN KEY ("incomeAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
