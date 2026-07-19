# Disaster Recovery Plan

## Severity And Roles

- Incident commander: owns decisions and timeline.
- Operations lead: restores infrastructure and records evidence.
- Security lead: handles suspected compromise and credential rotation.
- Communications lead: customer and status-page updates.

## Scenarios

Database corruption uses PITR into a clean project. Regional database failure uses the provider recovery process and the latest acceptable restore point. Queue failure disables asynchronous ingestion while core UI remains available. AI/provider outages degrade classification features without blocking dashboard access. Credential compromise triggers revocation, rotation and audit review.

## Service Targets

PostgreSQL RPO 15 minutes/RTO 4 hours; web application RPO 0/RTO 1 hour; object storage RPO 24 hours/RTO 8 hours; queue/cache RPO best effort/RTO 2 hours. These are targets, not certified results, until a drill proves them.

## Communications

Publish an initial customer update within 60 minutes for confirmed customer impact, then every 60 minutes until stable. Complete a postmortem within five business days for Sev-1/Sev-2 incidents.
