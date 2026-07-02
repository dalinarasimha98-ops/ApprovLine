import { buildReadinessReport } from '@/services/readiness';

export const dynamic = 'force-dynamic';

const styles = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  missing: 'bg-amber-50 text-amber-700 border-amber-200',
  error: 'bg-rose-50 text-rose-700 border-rose-200',
};

export default async function HealthPage() {
  const report = await buildReadinessReport();
  const rows = [
    ['PostgreSQL', report.checks.postgresql],
    ['Redis', report.checks.redis],
    ['OpenAI', report.checks.openai],
    ['Anthropic', report.checks.anthropic],
    ['Slack client ID', report.checks.slackClientId],
    ['Slack client secret', report.checks.slackClientSecret],
    ['Slack signing secret', report.checks.slackSigningSecret],
    ['Gmail OAuth client ID', report.checks.googleClientId],
    ['Gmail OAuth client secret', report.checks.googleClientSecret],
    ['Gmail API status', report.checks.gmailLastSync],
    ['Gmail sync interval', report.checks.gmailSyncInterval],
    ['Microsoft OAuth client ID', report.checks.microsoftClientId],
    ['Microsoft OAuth client secret', report.checks.microsoftClientSecret],
    ['Outlook/Exchange API status', report.checks.outlookLastSync],
    ['Teams API status', report.checks.teamsLastSync],
    ['Jira OAuth client ID', report.checks.jiraClientId],
    ['Jira OAuth client secret', report.checks.jiraClientSecret],
    ['Jira API status', report.checks.jiraLastSync],
    ['App URL', report.checks.appUrl],
    ['Encryption key', report.checks.encryptionKey],
    ['Clerk publishable key', report.checks.clerkPublishableKey],
    ['Clerk secret key', report.checks.clerkSecretKey],
  ] as const;

  return (
    <main className="min-h-screen bg-slate-50 px-6 py-10">
      <section className="mx-auto grid max-w-4xl gap-5">
        <div>
          <p className="text-sm font-bold uppercase text-[#2155d9]">ApprovLine health</p>
          <h1 className="mt-2 text-3xl font-black text-slate-950">Production readiness</h1>
          <p className="mt-2 text-slate-600">Checked at {new Date(report.checkedAt).toLocaleString()}</p>
        </div>
        <div className={`rounded-lg border p-4 font-bold ${report.ready ? styles.ok : styles.missing}`}>
          {report.ready ? 'Ready for Slack beta testing' : 'Needs configuration before live beta'}
        </div>
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">Check</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Message</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(([name, check]) => (
                <tr key={name} className="border-t border-slate-100">
                  <td className="px-4 py-3 font-semibold">{name}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full border px-2 py-1 text-xs font-bold ${styles[check.status]}`}>
                      {check.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{check.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
