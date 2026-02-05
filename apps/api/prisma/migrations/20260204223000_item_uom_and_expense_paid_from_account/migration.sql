-- AlterTable
ALTER TABLE "Item" ALTER COLUMN "reorderPoint" TYPE DECIMAL(18,4);

-- Backfill existing item thresholds/opening quantities into base UOM storage.
UPDATE "Item" AS i
SET
  "reorderPoint" = CASE
    WHEN i."reorderPoint" IS NULL THEN NULL
    ELSE ROUND((i."reorderPoint" * COALESCE(u."conversionRate", 1))::numeric, 4)
  END,
  "openingQty" = CASE
    WHEN i."openingQty" IS NULL THEN NULL
    ELSE ROUND((i."openingQty" * COALESCE(u."conversionRate", 1))::numeric, 4)
  END
FROM "UnitOfMeasure" AS u
WHERE i."unitOfMeasureId" = u."id"
  AND u."baseUnitId" IS NOT NULL;

-- AlterTable
ALTER TABLE "Expense" ADD COLUMN "paymentAccountId" TEXT;
ALTER TABLE "Expense" ALTER COLUMN "bankAccountId" DROP NOT NULL;

-- Backfill payment account from existing bank account mapping.
UPDATE "Expense" AS e
SET "paymentAccountId" = b."glAccountId"
FROM "BankAccount" AS b
WHERE e."paymentAccountId" IS NULL
  AND e."bankAccountId" = b."id";

-- Redefine foreign keys for nullable bank account and new paid-from account.
ALTER TABLE "Expense" DROP CONSTRAINT "Expense_bankAccountId_fkey";
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_bankAccountId_fkey"
  FOREIGN KEY ("bankAccountId") REFERENCES "BankAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Expense" ADD CONSTRAINT "Expense_paymentAccountId_fkey"
  FOREIGN KEY ("paymentAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "Expense_orgId_paymentAccountId_expenseDate_idx" ON "Expense"("orgId", "paymentAccountId", "expenseDate");
