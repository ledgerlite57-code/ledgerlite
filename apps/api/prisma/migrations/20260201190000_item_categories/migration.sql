-- AlterEnum
CREATE TYPE "ItemType_new" AS ENUM ('SERVICE', 'INVENTORY', 'FIXED_ASSET', 'NON_INVENTORY_EXPENSE');

ALTER TABLE "Item" ALTER COLUMN "type" TYPE "ItemType_new"
USING (
  CASE
    WHEN "type"::text = 'PRODUCT' THEN 'INVENTORY'
    WHEN "type"::text = 'EXPENSE' THEN 'NON_INVENTORY_EXPENSE'
    ELSE "type"::text
  END
)::"ItemType_new";

ALTER TYPE "ItemType" RENAME TO "ItemType_old";
ALTER TYPE "ItemType_new" RENAME TO "ItemType";
DROP TYPE "ItemType_old";

-- AlterTable
ALTER TABLE "Item"
  ADD COLUMN "inventoryAccountId" TEXT,
  ADD COLUMN "fixedAssetAccountId" TEXT;

ALTER TABLE "Item" ALTER COLUMN "expenseAccountId" DROP NOT NULL;

ALTER TABLE "OrgSettings"
  ADD COLUMN "defaultFixedAssetAccountId" TEXT,
  ADD COLUMN "defaultCogsAccountId" TEXT;

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_inventoryAccountId_fkey" FOREIGN KEY ("inventoryAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Item" ADD CONSTRAINT "Item_fixedAssetAccountId_fkey" FOREIGN KEY ("fixedAssetAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_defaultFixedAssetAccountId_fkey" FOREIGN KEY ("defaultFixedAssetAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_defaultCogsAccountId_fkey" FOREIGN KEY ("defaultCogsAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
