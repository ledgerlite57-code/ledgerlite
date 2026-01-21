-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PARTIAL', 'PAID');

-- AlterTable
ALTER TABLE "Invoice" ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID';
ALTER TABLE "Invoice" ADD COLUMN "amountPaid" DECIMAL(18, 2) NOT NULL DEFAULT 0;
