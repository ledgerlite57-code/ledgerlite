-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM (
  'DRAFT',
  'SENT',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CLOSED',
  'CANCELLED'
);

-- AlterEnum
ALTER TYPE "InventorySourceType" ADD VALUE IF NOT EXISTS 'PURCHASE_ORDER_RECEIPT';

-- AlterTable
ALTER TABLE "Bill"
ADD COLUMN "purchaseOrderId" TEXT;

-- AlterTable
ALTER TABLE "BillLine"
ADD COLUMN "purchaseOrderLineId" TEXT;

-- CreateTable
CREATE TABLE "PurchaseOrder" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "vendorId" TEXT NOT NULL,
  "poNumber" TEXT,
  "systemNumber" TEXT,
  "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'DRAFT',
  "poDate" TIMESTAMPTZ(6) NOT NULL,
  "expectedDeliveryDate" TIMESTAMPTZ(6),
  "currency" TEXT NOT NULL,
  "exchangeRate" DECIMAL(18, 6),
  "subTotal" DECIMAL(18, 2) NOT NULL,
  "taxTotal" DECIMAL(18, 2) NOT NULL,
  "total" DECIMAL(18, 2) NOT NULL,
  "billedAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "reference" TEXT,
  "notes" TEXT,
  "sentAt" TIMESTAMPTZ(6),
  "receivedAt" TIMESTAMPTZ(6),
  "closedAt" TIMESTAMPTZ(6),
  "cancelledAt" TIMESTAMPTZ(6),
  "createdByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "PurchaseOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseOrderLine" (
  "id" TEXT NOT NULL,
  "purchaseOrderId" TEXT NOT NULL,
  "lineNo" INTEGER NOT NULL,
  "expenseAccountId" TEXT NOT NULL,
  "itemId" TEXT,
  "unitOfMeasureId" TEXT,
  "description" TEXT NOT NULL,
  "qtyOrdered" DECIMAL(18, 4) NOT NULL,
  "qtyReceived" DECIMAL(18, 4) NOT NULL DEFAULT 0,
  "qtyBilled" DECIMAL(18, 4) NOT NULL DEFAULT 0,
  "unitPrice" DECIMAL(18, 2) NOT NULL,
  "discountAmount" DECIMAL(18, 2) NOT NULL DEFAULT 0,
  "taxCodeId" TEXT,
  "lineSubTotal" DECIMAL(18, 2) NOT NULL,
  "lineTax" DECIMAL(18, 2) NOT NULL,
  "lineTotal" DECIMAL(18, 2) NOT NULL,
  CONSTRAINT "PurchaseOrderLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrder_orgId_systemNumber_key"
ON "PurchaseOrder"("orgId", "systemNumber");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orgId_status_poDate_idx"
ON "PurchaseOrder"("orgId", "status", "poDate");

-- CreateIndex
CREATE INDEX "PurchaseOrder_orgId_vendorId_poDate_idx"
ON "PurchaseOrder"("orgId", "vendorId", "poDate");

-- CreateIndex
CREATE UNIQUE INDEX "PurchaseOrderLine_purchaseOrderId_lineNo_key"
ON "PurchaseOrderLine"("purchaseOrderId", "lineNo");

-- CreateIndex
CREATE INDEX "PurchaseOrderLine_unitOfMeasureId_idx"
ON "PurchaseOrderLine"("unitOfMeasureId");

-- CreateIndex
CREATE INDEX "Bill_orgId_purchaseOrderId_idx"
ON "Bill"("orgId", "purchaseOrderId");

-- CreateIndex
CREATE INDEX "BillLine_purchaseOrderLineId_idx"
ON "BillLine"("purchaseOrderLineId");

-- AddForeignKey
ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_orgId_fkey"
FOREIGN KEY ("orgId") REFERENCES "Organization"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_vendorId_fkey"
FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrder"
ADD CONSTRAINT "PurchaseOrder_createdByUserId_fkey"
FOREIGN KEY ("createdByUserId") REFERENCES "User"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine"
ADD CONSTRAINT "PurchaseOrderLine_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine"
ADD CONSTRAINT "PurchaseOrderLine_expenseAccountId_fkey"
FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine"
ADD CONSTRAINT "PurchaseOrderLine_itemId_fkey"
FOREIGN KEY ("itemId") REFERENCES "Item"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine"
ADD CONSTRAINT "PurchaseOrderLine_unitOfMeasureId_fkey"
FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseOrderLine"
ADD CONSTRAINT "PurchaseOrderLine_taxCodeId_fkey"
FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bill"
ADD CONSTRAINT "Bill_purchaseOrderId_fkey"
FOREIGN KEY ("purchaseOrderId") REFERENCES "PurchaseOrder"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BillLine"
ADD CONSTRAINT "BillLine_purchaseOrderLineId_fkey"
FOREIGN KEY ("purchaseOrderLineId") REFERENCES "PurchaseOrderLine"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
