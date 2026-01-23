-- CreateTable
CREATE TABLE "SavedView" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "queryJson" JSONB NOT NULL,
    "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "SavedView_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SavedView_orgId_userId_entityType_idx" ON "SavedView"("orgId", "userId", "entityType");

-- CreateIndex
CREATE UNIQUE INDEX "SavedView_orgId_userId_entityType_name_key" ON "SavedView"("orgId", "userId", "entityType", "name");

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SavedView" ADD CONSTRAINT "SavedView_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
