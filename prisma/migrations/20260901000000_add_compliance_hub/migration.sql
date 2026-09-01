-- CreateTable
CREATE TABLE "ComplianceFramework" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isEnabled" BOOLEAN NOT NULL DEFAULT true,
    "lastAssessmentAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceFramework_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceControl" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "frameworkId" TEXT NOT NULL,
    "controlRef" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'NOT_ASSESSED',
    "effectiveness" INTEGER,
    "playbookRuleId" TEXT,
    "lastTestedAt" TIMESTAMP(3),
    "nextReviewAt" TIMESTAMP(3),
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceControl_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceIssue" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "frameworkId" TEXT,
    "controlId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "severity" TEXT NOT NULL DEFAULT 'MEDIUM',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "owner" TEXT,
    "dueDate" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "investigationCaseId" TEXT,
    "approvalRecordId" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceIssue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceAttestation" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "controlId" TEXT,
    "title" TEXT NOT NULL,
    "policy" TEXT,
    "owner" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "dueDate" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "notes" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceAttestation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ComplianceDeadline" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "frameworkId" TEXT,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "owner" TEXT,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'UPCOMING',
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ComplianceDeadline_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ComplianceFramework_organizationId_slug_key" ON "ComplianceFramework"("organizationId", "slug");
CREATE INDEX "ComplianceFramework_organizationId_idx" ON "ComplianceFramework"("organizationId");

-- CreateIndex
CREATE INDEX "ComplianceControl_organizationId_idx" ON "ComplianceControl"("organizationId");
CREATE INDEX "ComplianceControl_frameworkId_idx" ON "ComplianceControl"("frameworkId");
CREATE INDEX "ComplianceControl_organizationId_status_idx" ON "ComplianceControl"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ComplianceIssue_organizationId_idx" ON "ComplianceIssue"("organizationId");
CREATE INDEX "ComplianceIssue_organizationId_status_idx" ON "ComplianceIssue"("organizationId", "status");
CREATE INDEX "ComplianceIssue_organizationId_severity_idx" ON "ComplianceIssue"("organizationId", "severity");
CREATE INDEX "ComplianceIssue_organizationId_status_severity_idx" ON "ComplianceIssue"("organizationId", "status", "severity");

-- CreateIndex
CREATE INDEX "ComplianceAttestation_organizationId_idx" ON "ComplianceAttestation"("organizationId");
CREATE INDEX "ComplianceAttestation_organizationId_status_idx" ON "ComplianceAttestation"("organizationId", "status");

-- CreateIndex
CREATE INDEX "ComplianceDeadline_organizationId_idx" ON "ComplianceDeadline"("organizationId");
CREATE INDEX "ComplianceDeadline_organizationId_dueDate_idx" ON "ComplianceDeadline"("organizationId", "dueDate");

-- AddForeignKey
ALTER TABLE "ComplianceFramework" ADD CONSTRAINT "ComplianceFramework_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceControl" ADD CONSTRAINT "ComplianceControl_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceControl" ADD CONSTRAINT "ComplianceControl_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "ComplianceFramework"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceIssue" ADD CONSTRAINT "ComplianceIssue_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceIssue" ADD CONSTRAINT "ComplianceIssue_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "ComplianceFramework"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ComplianceIssue" ADD CONSTRAINT "ComplianceIssue_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ComplianceControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceAttestation" ADD CONSTRAINT "ComplianceAttestation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceAttestation" ADD CONSTRAINT "ComplianceAttestation_controlId_fkey" FOREIGN KEY ("controlId") REFERENCES "ComplianceControl"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ComplianceDeadline" ADD CONSTRAINT "ComplianceDeadline_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ComplianceDeadline" ADD CONSTRAINT "ComplianceDeadline_frameworkId_fkey" FOREIGN KEY ("frameworkId") REFERENCES "ComplianceFramework"("id") ON DELETE SET NULL ON UPDATE CASCADE;
