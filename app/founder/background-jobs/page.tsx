import { getFounderAccess } from '@/services/founder';
import { buildFounderBackgroundJobs } from '@/services/founder-background-jobs';
import { BackgroundJobsClient } from '@/components/founder/BackgroundJobsClient';

export const dynamic = 'force-dynamic';

export default async function FounderBackgroundJobsPage() {
  await getFounderAccess();

  const report = await buildFounderBackgroundJobs();

  return (
    <BackgroundJobsClient
      generatedAt={report.generatedAt.toISOString()}
      queueName={report.queueName}
      queueHealth={report.queueHealth}
      queueHeadline={report.queueHeadline}
      counts={report.counts}
      worker={{ ...report.worker, lastSeenAt: report.worker.lastSeenAt?.toISOString() ?? null }}
      failedJobsTotal={report.failedJobsTotal}
      failedJobs={report.failedJobs.map((job) => ({ ...job, failedAt: job.failedAt?.toISOString() ?? null, createdAt: job.createdAt.toISOString() }))}
      deadLetterJobsTotal={report.deadLetterJobsTotal}
      deadLetterJobs={report.deadLetterJobs.map((job) => ({ ...job, firstFailedAt: job.firstFailedAt.toISOString(), lastFailedAt: job.lastFailedAt.toISOString() }))}
      recentEvents={report.recentEvents.map((event) => ({ ...event, occurredAt: event.occurredAt.toISOString() }))}
    />
  );
}
