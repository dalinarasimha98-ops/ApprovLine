-- CreateEnum
CREATE TYPE "CustomDomainStatus" AS ENUM ('NOT_CONFIGURED', 'PENDING_VERIFICATION', 'VERIFIED', 'ACTIVE', 'FAILED');

-- AlterTable
ALTER TABLE "Organization" ADD COLUMN     "autoCategorizationEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "customDomain" TEXT,
ADD COLUMN     "customDomainStatus" "CustomDomainStatus" NOT NULL DEFAULT 'NOT_CONFIGURED',
ADD COLUMN     "customDomainVerifiedAt" TIMESTAMP(3),
ADD COLUMN     "customDomainVerifyToken" TEXT,
ADD COLUMN     "defaultDateFormat" TEXT,
ADD COLUMN     "defaultDueDateDays" INTEGER,
ADD COLUMN     "defaultRiskLevel" TEXT,
ADD COLUMN     "defaultTimeZone" TEXT,
ADD COLUMN     "defaultWorkspaceView" TEXT,
ADD COLUMN     "logoUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "logoUrl" TEXT,
ADD COLUMN     "riskDetectionEnabled" BOOLEAN NOT NULL DEFAULT true;
