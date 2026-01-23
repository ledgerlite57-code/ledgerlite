-- Create enums
CREATE TYPE "VatBehavior" AS ENUM ('EXCLUSIVE', 'INCLUSIVE');
CREATE TYPE "ReportBasis" AS ENUM ('ACCRUAL', 'CASH');

-- Extend Organization
ALTER TABLE "Organization" ADD COLUMN "legalName" TEXT;
ALTER TABLE "Organization" ADD COLUMN "tradeLicenseNumber" TEXT;
ALTER TABLE "Organization" ADD COLUMN "address" JSONB;
ALTER TABLE "Organization" ADD COLUMN "phone" TEXT;
ALTER TABLE "Organization" ADD COLUMN "industryType" TEXT;
ALTER TABLE "Organization" ADD COLUMN "defaultLanguage" TEXT;
ALTER TABLE "Organization" ADD COLUMN "dateFormat" TEXT;
ALTER TABLE "Organization" ADD COLUMN "numberFormat" TEXT;

-- Extend OrgSettings
ALTER TABLE "OrgSettings" ADD COLUMN "defaultPaymentTerms" INTEGER;
ALTER TABLE "OrgSettings" ADD COLUMN "defaultVatBehavior" "VatBehavior";
ALTER TABLE "OrgSettings" ADD COLUMN "defaultArAccountId" TEXT;
ALTER TABLE "OrgSettings" ADD COLUMN "defaultApAccountId" TEXT;
ALTER TABLE "OrgSettings" ADD COLUMN "reportBasis" "ReportBasis";
ALTER TABLE "OrgSettings" ADD COLUMN "numberingFormats" JSONB;

-- Foreign keys
ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_defaultArAccountId_fkey"
  FOREIGN KEY ("defaultArAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "OrgSettings" ADD CONSTRAINT "OrgSettings_defaultApAccountId_fkey"
  FOREIGN KEY ("defaultApAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
