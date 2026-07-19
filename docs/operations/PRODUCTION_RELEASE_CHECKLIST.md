# Production Release Checklist

- [ ] Approved change set and migration review
- [ ] Node 20 clean `npm ci`
- [ ] Prisma validate and generate
- [ ] Formatting, ESLint and TypeScript pass
- [ ] Unit, integration, tenant-isolation, security and entitlement suites pass
- [ ] Critical-path browser tests pass in Chromium, Firefox and WebKit
- [ ] Production build succeeds
- [ ] Dependency audit has no high or critical findings
- [ ] Secret scan passes
- [ ] Preview smoke test and accessibility check pass
- [ ] Provider callbacks and environment variables verified without exposing values
- [ ] Backup healthy and rollback point recorded
- [ ] Database migrations applied separately with `npm run db:deploy`
- [ ] Sentry release/source maps and alerts verified
- [ ] Production smoke test, incident owner and rollback decision recorded
