/**
 * GenericConnectorInfo
 *
 * Static informational section explaining how to use ApprovLine's generic
 * connectors: Universal Webhook, REST API, CSV Import, and Email Forwarding.
 * This component is intentionally a server component (no 'use client').
 */

type Props = {
  organizationSlug?: string;
  appUrl?: string;
};

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-md border border-al-border bg-al-surface-elevated px-2 py-0.5 font-mono text-xs text-al-text-secondary">
      {children}
    </code>
  );
}

function CopyableEndpoint({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-al-border bg-al-surface-sunken px-4 py-3">
      <span className="flex-1 font-mono text-sm text-al-text-secondary whitespace-nowrap">{value}</span>
    </div>
  );
}

export function GenericConnectorInfo({ organizationSlug, appUrl = 'https://approvline.ai' }: Props) {
  const webhookUrl = `${appUrl}/api/v1/webhooks/approvals`;
  const apiUrl = `${appUrl}/api/v1/approvals`;
  const emailInbox = organizationSlug ? `approvals+${organizationSlug}@approvline.ai` : 'approvals+{your-slug}@approvline.ai';

  return (
    <div className="grid gap-6">
      {/* Webhook */}
      <div className="rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-al-accent/10 text-xl font-black text-al-accent">
            W
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-al-text">Universal Webhook</h3>
            <p className="mt-1 text-sm font-semibold text-al-text-muted">
              POST signed JSON to our endpoint from any system. Supports idempotency, signature verification, and automatic retry.
            </p>

            <div className="mt-4 grid gap-3">
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-al-text-muted">Endpoint</p>
                <CopyableEndpoint value={webhookUrl} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-al-text-muted">Authentication</p>
                <p className="text-sm font-semibold text-al-text-secondary">
                  Set <Code>UNIVERSAL_GATEWAY_WEBHOOK_SECRET</Code> in your environment. Sign each request body with HMAC-SHA256 and send the hex digest in the <Code>X-ApprovLine-Signature</Code> header.
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-al-text-muted">Sample payload</p>
                <pre className="overflow-x-auto rounded-xl border border-al-border bg-al-surface-sunken p-4 text-xs leading-relaxed text-al-text-secondary">
{`{
  "system": "custom",
  "event_type": "approval.completed",
  "tenant_slug": "${organizationSlug ?? 'your-org-slug'}",
  "approval": {
    "approver": "Jane Smith",
    "approver_email": "jane@example.com",
    "decision": "Purchase order #PO-4892 approved for $12,400",
    "source_system": "Coupa",
    "department": "Finance",
    "timestamp": "2026-08-30T14:30:00Z",
    "amount": 12400,
    "category": "Procurement"
  }
}`}
                </pre>
              </div>
            </div>

            <a
              href="/dashboard/gateway"
              className="mt-4 inline-flex rounded-xl border border-al-border bg-al-surface px-4 py-2 text-xs font-black text-al-text-secondary shadow-sm transition hover:bg-al-surface-sunken"
            >
              Open Gateway dashboard →
            </a>
          </div>
        </div>
      </div>

      {/* REST API */}
      <div className="rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-xl font-black text-sky-600">
            A
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-al-text">REST API</h3>
            <p className="mt-1 text-sm font-semibold text-al-text-muted">
              Submit approval records programmatically. Authenticated with a static API key via the <Code>X-ApprovLine-Key</Code> header.
            </p>

            <div className="mt-4 grid gap-3">
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-al-text-muted">Endpoint</p>
                <CopyableEndpoint value={`POST ${apiUrl}`} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-al-text-muted">Authentication</p>
                <p className="text-sm font-semibold text-al-text-secondary">
                  Set <Code>UNIVERSAL_GATEWAY_API_KEY</Code> in your environment and pass it in the <Code>X-ApprovLine-Key</Code> header on each request.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Email forwarding */}
      <div className="rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-al-danger/10 text-xl font-black text-al-danger">
            @
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-al-text">Email Forwarding</h3>
            <p className="mt-1 text-sm font-semibold text-al-text-muted">
              Forward approval confirmation emails to your tenant inbox. ApprovLine automatically parses and classifies them.
            </p>
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-al-text-muted">Your inbox address</p>
              <CopyableEndpoint value={emailInbox} />
            </div>
          </div>
        </div>
      </div>

      {/* CSV Import */}
      <div className="rounded-2xl border border-al-border bg-al-surface p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-al-success/10 text-xl font-black text-al-success">
            C
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-al-text">CSV Import</h3>
            <p className="mt-1 text-sm font-semibold text-al-text-muted">
              Upload historical approval records as a CSV. Useful for migrating from spreadsheets or one-time backfills.
            </p>
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-al-text-muted">Endpoint</p>
              <CopyableEndpoint value={`POST ${appUrl}/api/v1/imports/csv`} />
            </div>
            <p className="mt-3 text-xs font-semibold text-al-text-muted">
              Required columns: <Code>approver</Code>, <Code>decision</Code>, <Code>timestamp</Code>.
              Optional: <Code>department</Code>, <Code>category</Code>, <Code>amount</Code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
