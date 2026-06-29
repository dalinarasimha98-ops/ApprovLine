CREATE INDEX "ApprovalRecord_organizationId_sourcePlatform_idx" ON "ApprovalRecord"("organizationId", "sourcePlatform");
CREATE INDEX "ApprovalRecord_organizationId_approvalType_idx" ON "ApprovalRecord"("organizationId", "approvalType");
CREATE INDEX "ApprovalRecord_organizationId_status_occurredAt_idx" ON "ApprovalRecord"("organizationId", "status", "occurredAt");
CREATE INDEX "AuditLog_organizationId_actorUserId_createdAt_idx" ON "AuditLog"("organizationId", "actorUserId", "createdAt");
