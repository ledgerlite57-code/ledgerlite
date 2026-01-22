-- AlterTable
ALTER TABLE "OrgSettings"
ADD COLUMN "vendorPaymentPrefix" TEXT,
ADD COLUMN "vendorPaymentNextNumber" INTEGER;

-- AlterTable
ALTER TABLE "Bill"
ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN "amountPaid" DECIMAL(18,2) NOT NULL DEFAULT 0;
