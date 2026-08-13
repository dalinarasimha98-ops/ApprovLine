-- Root cause of the "approval detail lookup timed out after 8000ms" incident
-- (Sentry b59f14dc540743c8af22b0a2b2bd354a): app/approvals/[id]/page.tsx's
-- ApprovalRecord.findFirst() includes AuditLog and ClassifierResult filtered
-- by approvalRecordId and ordered by createdAt desc - neither table had an
-- index covering approvalRecordId. AuditLog in particular is the single
-- fastest-growing table in this schema (every classification, integration
-- sync, and manual action writes a row - see the alerts_query_indexes
-- migration), so that lookup degraded from a fast index scan into a
-- sequential scan of the whole table as it grew, regardless of how small any
-- one approval's own audit history is.
CREATE INDEX "AuditLog_approvalRecordId_createdAt_idx" ON "AuditLog"("approvalRecordId", "createdAt");
CREATE INDEX "ClassifierResult_approvalRecordId_createdAt_idx" ON "ClassifierResult"("approvalRecordId", "createdAt");
