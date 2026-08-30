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
    <code className="rounded-md border border-slate-200 bg-slate-100 px-2 py-0.5 font-mono text-xs text-slate-700">
      {children}
    </code>
  );
}

function CopyableEndpoint({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <span className="flex-1 font-mono text-sm text-slate-700 whitespace-nowrap">{value}</span>
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
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-violet-50 text-xl font-black text-violet-600">
            W
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-950">Universal Webhook</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              POST signed JSON to our endpoint from any system. Supports idempotency, signature verification, and automatic retry.
            </p>

            <div className="mt-4 grid gap-3">
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Endpoint</p>
                <CopyableEndpoint value={webhookUrl} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Authentication</p>
                <p className="text-sm font-semibold text-slate-600">
                  Set <Code>UNIVERSAL_GATEWAY_WEBHOOK_SECRET</Code> in your environment. Sign each request body with HMAC-SHA256 and send the hex digest in the <Code>X-ApprovLine-Signature</Code> header.
                </p>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Sample payload</p>
                <pre className="overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs leading-relaxed text-slate-700">
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
              className="mt-4 inline-flex rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              Open Gateway dashboard →
            </a>
          </div>
        </div>
      </div>

      {/* REST API */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-sky-50 text-xl font-black text-sky-600">
            A
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-950">REST API</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Submit approval records programmatically. Authenticated with a static API key via the <Code>X-ApprovLine-Key</Code> header.
            </p>

            <div className="mt-4 grid gap-3">
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Endpoint</p>
                <CopyableEndpoint value={`POST ${apiUrl}`} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Authentication</p>
                <p className="text-sm font-semibold text-slate-600">
                  Set <Code>UNIVERSAL_GATEWAY_API_KEY</Code> in your environment and pass it in the <Code>X-ApprovLine-Key</Code> header on each request.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Email forwarding */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-rose-50 text-xl font-black text-rose-500">
            @
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-950">Email Forwarding</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Forward approval confirmation emails to your tenant inbox. ApprovLine automatically parses and classifies them.
            </p>
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Your inbox address</p>
              <CopyableEndpoint value={emailInbox} />
            </div>
          </div>
        </div>
      </div>

      {/* CSV Import */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-start gap-4">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-xl font-black text-emerald-600">
            C
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-lg font-black text-slate-950">CSV Import</h3>
            <p className="mt-1 text-sm font-semibold text-slate-500">
              Upload historical approval records as a CSV. Useful for migrating from spreadsheets or one-time backfills.
            </p>
            <div className="mt-4">
              <p className="mb-1.5 text-xs font-black uppercase tracking-wide text-slate-500">Endpoint</p>
              <CopyableEndpoint value={`POST ${appUrl}/api/v1/imports/csv`} />
            </div>
            <p className="mt-3 text-xs font-semibold text-slate-500">
              Required columns: <Code>approver</Code>, <Code>decision</Code>, <Code>timestamp</Code>.
              Optional: <Code>department</Code>, <Code>category</Code>, <Code>amount</Code>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
