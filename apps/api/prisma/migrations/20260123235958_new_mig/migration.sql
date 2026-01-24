-- AlterTable (guarded for legacy schemas without normalBalance)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Account'
      AND column_name = 'normalBalance'
  ) THEN
    ALTER TABLE "Account" ALTER COLUMN "normalBalance" DROP DEFAULT;
  END IF;
END $$;
