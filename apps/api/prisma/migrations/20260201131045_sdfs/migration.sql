-- AlterEnum
ALTER TYPE "GLSourceType" ADD VALUE 'EXPENSE';

-- AlterTable
ALTER TABLE "OrgSettings" ADD COLUMN     "expenseNextNumber" INTEGER,
ADD COLUMN     "expensePrefix" TEXT;

-- CreateTable
CREATE TABLE "Expense" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "number" TEXT,
    "status" "DocumentStatus" NOT NULL DEFAULT 'DRAFT',
    "vendorId" TEXT,
    "bankAccountId" TEXT NOT NULL,
    "expenseDate" TIMESTAMPTZ(6) NOT NULL,
    "currency" TEXT NOT NULL,
    "exchangeRate" DECIMAL(18,6),
    "subTotal" DECIMAL(18,2) NOT NULL,
    "taxTotal" DECIMAL(18,2) NOT NULL,
    "total" DECIMAL(18,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "postedAt" TIMESTAMPTZ(6),
    "voidedAt" TIMESTAMPTZ(6),
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "Expense_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseLine" (
    "id" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "lineNo" INTEGER NOT NULL,
    "expenseAccountId" TEXT NOT NULL,
    "itemId" TEXT,
    "unitOfMeasureId" TEXT,
    "description" TEXT NOT NULL,
    "qty" DECIMAL(18,4) NOT NULL,
    "unitPrice" DECIMAL(18,2) NOT NULL,
    "discountAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "taxCodeId" TEXT,
    "lineSubTotal" DECIMAL(18,2) NOT NULL,
    "lineTax" DECIMAL(18,2) NOT NULL,
    "lineTotal" DECIMAL(18,2) NOT NULL,

    CONSTRAINT "ExpenseLine_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Expense_orgId_status_expenseDate_idx" ON "Expense"("orgId", "status", "expenseDate");

-- CreateIndex
CREATE INDEX "Expense_orgId_vendorId_expenseDate_idx" ON "Expense"("orgId", "vendorId", "expenseDate");

-- CreateIndex
CREATE UNIQUE INDEX "Expense_orgId_number_key" ON "Expense"("orgId", "number");

-- CreateIndex
CREATE INDEX "ExpenseLine_expenseId_idx" ON "ExpenseLine"("expenseId");

-- CreateIndex
CREATE INDEX "ExpenseLine_unitOfMeasureId_idx" ON "ExpenseLine"("unitOfMeasureId");

-- CreateIndex
CREATE UNIQUE INDEX "ExpenseLine_expenseId_lineNo_key" ON "ExpenseLine"("expenseId", "lineNo");

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "Expense"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_unitOfMeasureId_fkey" FOREIGN KEY ("unitOfMeasureId") REFERENCES "UnitOfMeasure"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseLine" ADD CONSTRAINT "ExpenseLine_taxCodeId_fkey" FOREIGN KEY ("taxCodeId") REFERENCES "TaxCode"("id") ON DELETE SET NULL ON UPDATE CASCADE;
