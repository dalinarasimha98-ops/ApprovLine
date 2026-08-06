-- CreateIndex
-- ApprovalRecord had no index containing createdAt, despite Executive
-- Analytics (services/analytics.ts) sorting by createdAt with a
-- take-500 limit. Every existing index on this table pairs organizationId
-- with occurredAt or another column, none with createdAt, so that query
-- had to sort matching rows without index support - the primary
-- contributor to the reported 8500ms timeout for tenants with a large
-- approval history.
CREATE INDEX "ApprovalRecord_organizationId_createdAt_idx" ON "ApprovalRecord"("organizationId", "createdAt");
