# Backup And Restore Runbook

## Targets

- PostgreSQL target RPO: 15 minutes; target RTO: 4 hours.
- Object/file storage target RPO: 24 hours; target RTO: 8 hours.
- Redis is reconstructable queue/cache state; durable source records remain PostgreSQL.
- Secrets/configuration target RTO: 4 hours from the approved secret manager.

## Backup Policy

Enable encrypted Supabase point-in-time recovery and daily backups with at least 30-day retention. Keep provider/project configuration exports in an access-controlled operations vault. File storage must use versioning or daily encrypted snapshots. Alert the operations owner on missed backup jobs.

## Restore Order

1. Declare the incident and freeze writes.
2. Select a restore point that meets the RPO and record its identifier.
3. Restore into a new non-production project first.
4. Apply the exact application migration version with `npm run db:deploy`.
5. Compare organization, user, approval, audit and integration row counts.
6. Run tenant-isolation and application smoke tests.
7. Rotate database credentials before production cutover.
8. Redirect traffic only after incident commander approval.
9. Monitor errors, queue depth and data reconciliation.

## Safety

Never overwrite the only production copy. Never copy production secrets into evidence. Restore operators require audited privileged access. The drill is not certified until `RESTORE_TEST_EVIDENCE.md` contains provider evidence and actual timings.
