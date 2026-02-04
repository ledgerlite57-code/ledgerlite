-- CreateEnum
CREATE TYPE "NegativeStockPolicy" AS ENUM ('ALLOW', 'WARN', 'BLOCK');

-- AlterTable
ALTER TABLE "OrgSettings"
  ADD COLUMN "negativeStockPolicy" "NegativeStockPolicy" NOT NULL DEFAULT 'ALLOW';
