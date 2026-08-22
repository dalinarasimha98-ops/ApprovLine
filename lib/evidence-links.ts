const PLACEHOLDER_HOSTS = new Set(['example.com', 'example.org', 'example.net']);

/**
 * Demo evidence links point at real provider domains (e.g. app.slack.com)
 * but with fabricated workspace/channel IDs (TDEMO/CDEMO, see
 * lib/demo-data.ts's demoApprovals) that don't exist on that provider - so
 * hostname-only validation below can't catch them, and "Open original
 * system" rendered a button that always 404s or bounces to a sign-in page.
 * Reuses the exact substring check already used everywhere else in this
 * codebase to identify a demo sourceLink (components/dashboard/ApprovalTable.tsx,
 * app/approvals/[id]/page.tsx, services/investigations.ts,
 * app/api/export/approvals/route.ts) rather than inventing a new one.
 */
function isDemoEvidenceLink(value: string) {
  return value.includes('demo') || value.includes('TDEMO');
}

export function getSafeEvidenceUrl(value?: string | null) {
  if (!value) return null;
  if (isDemoEvidenceLink(value)) return null;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    const isPlaceholder =
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname === 'example' ||
      hostname.endsWith('.example') ||
      PLACEHOLDER_HOSTS.has(hostname) ||
      [...PLACEHOLDER_HOSTS].some((host) => hostname.endsWith(`.${host}`));

    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isPlaceholder) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}
