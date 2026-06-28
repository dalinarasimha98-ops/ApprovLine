import { syncAllGmailIntegrations } from '@/services/integrations/gmail';

const allowedIntervals = new Set([5, 15, 60]);
const intervalMinutes = Number(process.env.GMAIL_SYNC_INTERVAL_MINUTES ?? '15');
const once = process.argv.includes('--once');

if (!allowedIntervals.has(intervalMinutes)) {
  throw new Error('GMAIL_SYNC_INTERVAL_MINUTES must be one of 5, 15, or 60');
}

async function runSync() {
  const results = await syncAllGmailIntegrations();
  console.log(JSON.stringify({ syncedAt: new Date().toISOString(), results }, null, 2));
}

await runSync();

if (!once) {
  setInterval(runSync, intervalMinutes * 60_000);
}
