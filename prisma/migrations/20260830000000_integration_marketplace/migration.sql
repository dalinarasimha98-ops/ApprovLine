-- CreateEnum
CREATE TYPE "MarketplaceProviderStatus" AS ENUM ('DRAFT', 'BETA', 'AVAILABLE', 'DEPRECATED', 'COMING_SOON');

-- CreateEnum
CREATE TYPE "IntegrationRequestStatus" AS ENUM ('PENDING', 'UNDER_REVIEW', 'PLANNED', 'IN_DEVELOPMENT', 'AVAILABLE', 'REJECTED');

-- CreateEnum
CREATE TYPE "IntegrationRequestPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateTable
CREATE TABLE "MarketplaceProvider" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "logoUrl" TEXT,
    "websiteUrl" TEXT,
    "status" "MarketplaceProviderStatus" NOT NULL DEFAULT 'AVAILABLE',
    "isNative" BOOLEAN NOT NULL DEFAULT false,
    "capabilities" JSONB,
    "requestCount" INTEGER NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceProvider_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantProviderAccess" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "providerSlug" TEXT NOT NULL,
    "enabledAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "enabledBy" TEXT,

    CONSTRAINT "TenantProviderAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationRequest" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestedByUserId" TEXT,
    "providerSlug" TEXT,
    "providerName" TEXT NOT NULL,
    "providerWebsite" TEXT,
    "category" TEXT,
    "reason" TEXT NOT NULL,
    "evidenceType" TEXT,
    "userCount" INTEGER,
    "priority" "IntegrationRequestPriority" NOT NULL DEFAULT 'MEDIUM',
    "status" "IntegrationRequestStatus" NOT NULL DEFAULT 'PENDING',
    "founderNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "IntegrationRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProvider_slug_key" ON "MarketplaceProvider"("slug");

-- CreateIndex
CREATE INDEX "MarketplaceProvider_status_idx" ON "MarketplaceProvider"("status");

-- CreateIndex
CREATE INDEX "MarketplaceProvider_category_idx" ON "MarketplaceProvider"("category");

-- CreateIndex
CREATE INDEX "MarketplaceProvider_sortOrder_idx" ON "MarketplaceProvider"("sortOrder");

-- CreateIndex
CREATE INDEX "TenantProviderAccess_organizationId_idx" ON "TenantProviderAccess"("organizationId");

-- CreateIndex
CREATE INDEX "TenantProviderAccess_providerSlug_idx" ON "TenantProviderAccess"("providerSlug");

-- CreateIndex
CREATE UNIQUE INDEX "TenantProviderAccess_organizationId_providerSlug_key" ON "TenantProviderAccess"("organizationId", "providerSlug");

-- CreateIndex
CREATE INDEX "IntegrationRequest_organizationId_status_createdAt_idx" ON "IntegrationRequest"("organizationId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "IntegrationRequest_providerSlug_status_idx" ON "IntegrationRequest"("providerSlug", "status");

-- CreateIndex
CREATE INDEX "IntegrationRequest_status_priority_createdAt_idx" ON "IntegrationRequest"("status", "priority", "createdAt");

-- AddForeignKey
ALTER TABLE "TenantProviderAccess" ADD CONSTRAINT "TenantProviderAccess_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantProviderAccess" ADD CONSTRAINT "TenantProviderAccess_providerSlug_fkey" FOREIGN KEY ("providerSlug") REFERENCES "MarketplaceProvider"("slug") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRequest" ADD CONSTRAINT "IntegrationRequest_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IntegrationRequest" ADD CONSTRAINT "IntegrationRequest_providerSlug_fkey" FOREIGN KEY ("providerSlug") REFERENCES "MarketplaceProvider"("slug") ON DELETE SET NULL ON UPDATE CASCADE;
