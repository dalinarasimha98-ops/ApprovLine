# Connector Certification Matrix

Certification requires provider evidence; route presence alone is not certification.

| Connector | Repository state | Certification state | Required evidence before GA |
|---|---|---|---|
| Slack | OAuth, callback, events, signature validation, sync tests | Implemented; awaiting live certification | Two-workspace install, signed event, retry, reconnect, revoke |
| Gmail | OAuth, callback, encrypted tokens, sync tests | Implemented; awaiting live certification | Workspace consent, refresh, pagination, incremental sync, revoke |
| Microsoft Teams | OAuth, callback, sync and tests | Implemented; awaiting live certification | Admin consent, channel coverage, refresh, reconnect |
| Outlook / Exchange | OAuth, callback and sync | Implemented; awaiting dedicated/live certification | Exchange Online mailbox sync, pagination, revoke |
| Jira | OAuth, callback and sync | Implemented; awaiting dedicated/live certification | Rotating refresh token, issue/comment/status mapping |
| ServiceNow | OAuth, callback and sync | Implemented; awaiting live certification | Enterprise instance consent, pagination, outage/retry |
| Zoom | OAuth, callback, webhook and transcript sync | Implemented; awaiting live certification | Recording/transcript scopes, signed webhook, reconnect |
| Universal Gateway | API, webhook, CSV, document and transcript routes | Implemented with conditions | Tenant credentials, distributed quota and replay suite |
| GitHub | No connector route | Planned | Implementation and provider certification |
| GitLab | No connector route | Planned | Implementation and provider certification |
| Azure DevOps | No connector route | Planned | Implementation and provider certification |
| Jenkins | No connector route | Planned | Implementation and provider certification |
| Kubernetes | No connector route | Planned | Implementation and provider certification |

## Manual Certification Procedure

For each implemented provider, use a dedicated sandbox tenant. Record the app version, scopes, timestamps and sanitized request IDs. Verify OAuth state, least-privilege scopes, token encryption, refresh, pagination, duplicate handling, incremental cursor, revocation, reconnect, rate-limit handling, outage behavior, audit events, evidence mapping and tenant isolation. Store screenshots/log references in `docs/qa/PRODUCTION_CERTIFICATION_EVIDENCE.md`; never commit tokens.
