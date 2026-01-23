-- CreateTable
CREATE TABLE "UnitOfMeasure" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "baseUnitId" TEXT,
    "conversionRate" DECIMAL(18,6),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "UnitOfMeasure_pkey" PRIMARY KEY ("id")
);

-- Add columns to Item
ALTER TABLE "Item" ADD COLUMN "unitOfMeasureId" TEXT;
ALTER TABLE "Item" ADD COLUMN "allowFractionalQty" BOOLEAN NOT NULL DEFAULT true;

-- Add unitOfMeasureId to InvoiceLine and BillLine
ALTER TABLE "InvoiceLine" ADD COLUMN "unitOfMeasureId" TEXT;
ALTER TABLE "BillLine" ADD COLUMN "unitOfMeasureId" TEXT;

-- Indexes
CREATE UNIQUE INDEX "UnitOfMeasure_orgId_name_key" ON "UnitOfMeasure"("orgId", "name");
CREATE INDEX "UnitOfMeasure_orgId_isActive_idx" ON "UnitOfMeasure"("orgId", "isActive");
CREATE INDEX "UnitOfMeasure_baseUnitId_idx" ON "UnitOfMeasure"("baseUnitId");
CREATE INDEX "Item_unitOfMeasureId_idx" ON "Item"("unitOfMeasureId");
CREATE INDEX "InvoiceLine_unitOfMeasureId_idx" ON "InvoiceLine"("unitOfMeasureId");
CREATE INDEX "BillLine_unitOfMeasureId_idx" ON "BillLine"("unitOfMeasureId");

-- Foreign keys
ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_orgId_fkey"
  FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UnitOfMeasure" ADD CONSTRAINT "UnitOfMeasure_baseUnitId_fkey"
  FOREIGN KEY ("baseUnitId") REFERENCES "UnitOfMeasure"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Item" ADD CONSTRAINT "Item_unitOfMeasureId_fkey"
  FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InvoiceLine" ADD CONSTRAINT "InvoiceLine_unitOfMeasureId_fkey"
  FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "BillLine" ADD CONSTRAINT "BillLine_unitOfMeasureId_fkey"
  FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;
