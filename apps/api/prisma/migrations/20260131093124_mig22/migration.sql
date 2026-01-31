/*
  Warnings:

  - A unique constraint covering the columns `[orgId,systemNumber]` on the table `Bill` will be added. If there are existing duplicate values, this will fail.

*/
-- CreateIndex
CREATE UNIQUE INDEX "Bill_orgId_systemNumber_key" ON "Bill"("orgId", "systemNumber");
