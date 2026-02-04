-- CreateEnum
CREATE TYPE "OnboardingTrack" AS ENUM ('OWNER', 'ACCOUNTANT', 'OPERATOR');

-- CreateEnum
CREATE TYPE "OnboardingStepStatus" AS ENUM ('PENDING', 'COMPLETED', 'NOT_APPLICABLE');

-- CreateTable
CREATE TABLE "OnboardingProgress" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "membershipId" TEXT NOT NULL,
  "roleName" TEXT,
  "track" "OnboardingTrack" NOT NULL,
  "completedAt" TIMESTAMPTZ(6),
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "OnboardingProgress_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OnboardingProgressStep" (
  "id" TEXT NOT NULL,
  "progressId" TEXT NOT NULL,
  "stepId" TEXT NOT NULL,
  "position" INTEGER NOT NULL,
  "status" "OnboardingStepStatus" NOT NULL DEFAULT 'PENDING',
  "completedAt" TIMESTAMPTZ(6),
  "notApplicableAt" TIMESTAMPTZ(6),
  "meta" JSONB,
  "createdAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "OnboardingProgressStep_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_membershipId_key" ON "OnboardingProgress"("membershipId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgress_orgId_userId_key" ON "OnboardingProgress"("orgId", "userId");

-- CreateIndex
CREATE INDEX "OnboardingProgress_orgId_userId_idx" ON "OnboardingProgress"("orgId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "OnboardingProgressStep_progressId_stepId_key" ON "OnboardingProgressStep"("progressId", "stepId");

-- CreateIndex
CREATE INDEX "OnboardingProgressStep_progressId_position_idx" ON "OnboardingProgressStep"("progressId", "position");

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgress" ADD CONSTRAINT "OnboardingProgress_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "Membership"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OnboardingProgressStep" ADD CONSTRAINT "OnboardingProgressStep_progressId_fkey" FOREIGN KEY ("progressId") REFERENCES "OnboardingProgress"("id") ON DELETE CASCADE ON UPDATE CASCADE;
