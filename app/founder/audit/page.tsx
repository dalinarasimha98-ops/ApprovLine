import { getFounderAccess, listCustomerAccountOptions } from '@/services/founder';
import { buildFounderAuditLogs } from '@/services/founder-audit-logs';
import { AuditLogsClient } from '@/components/founder/AuditLogsClient';

export const dynamic = 'force-dynamic';

export default async function FounderAuditPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  await getFounderAccess();
  const params = await searchParams;

  const pageParam = Number(params.page);
  const [report, customers] = await Promise.all([
    buildFounderAuditLogs({
      q: params.q,
      category: params.category,
      action: params.action,
      customerAccountId: params.customerAccountId,
      range: params.range,
      page: Number.isFinite(pageParam) ? pageParam : 1,
    }),
    listCustomerAccountOptions(),
  ]);

  if (!report.ok) {
    return (
      <AuditLogsClient
        state="error"
        safeError={report.safeError}
        migrationRequired={report.migrationRequired}
        filters={{ q: params.q ?? '', category: params.category ?? '', action: params.action ?? '', customerAccountId: params.customerAccountId ?? '', range: params.range ?? 'all' }}
        customers={customers}
      />
    );
  }

  return (
    <AuditLogsClient
      state="ok"
      kpis={report.kpis}
      rows={report.rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }))}
      total={report.total}
      page={report.page}
      pageSize={report.pageSize}
      totalPages={report.totalPages}
      hasAnyEventsAtAll={report.hasAnyEventsAtAll}
      filters={{ q: params.q ?? '', category: params.category ?? '', action: params.action ?? '', customerAccountId: params.customerAccountId ?? '', range: params.range ?? 'all' }}
      customers={customers}
    />
  );
}
