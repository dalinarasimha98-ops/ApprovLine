/**
 * Real, publicly-documented brand colors for each provider's source badge -
 * representative, not pulled from an official swatch file, so treat these
 * as "recognizably that brand's color" rather than pixel-exact. Keyed by
 * the same lowercase provider-key convention already used by
 * ApprovalRecord.sourcePlatform and CanonicalEvidenceEvent.providerKey
 * (e.g. 'slack', 'microsoft_teams', 'servicenow').
 */
type SourceMeta = { label: string; initials: string; color: string };

const SOURCE_META: Record<string, SourceMeta> = {
  slack: { label: 'Slack', initials: 'SL', color: '#4A154B' },
  gmail: { label: 'Gmail', initials: 'GM', color: '#EA4335' },
  outlook: { label: 'Outlook', initials: 'OL', color: '#0078D4' },
  microsoft_teams: { label: 'Microsoft Teams', initials: 'TM', color: '#6264A7' },
  jira: { label: 'Jira', initials: 'JR', color: '#0052CC' },
  servicenow: { label: 'ServiceNow', initials: 'SN', color: '#2E7D32' },
  zoom: { label: 'Zoom', initials: 'ZM', color: '#2D8CFF' },
  custom: { label: 'Custom', initials: 'CU', color: '#64748B' },
};

const FALLBACK_META: SourceMeta = { label: 'Unknown source', initials: '?', color: '#64748B' };

export function sourceMeta(providerKey?: string | null): SourceMeta {
  const key = providerKey?.trim().toLowerCase() ?? '';
  return SOURCE_META[key] ?? { ...FALLBACK_META, label: providerKey || FALLBACK_META.label };
}
