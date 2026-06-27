import { buildReadinessReport } from '@/services/readiness';

const report = await buildReadinessReport();
console.log(JSON.stringify(report, null, 2));

if (!report.ready) {
  process.exitCode = 1;
}
