/**
 * Founder Settings (/founder/settings) — pure, client-safe types and
 * lookup helpers. No DB/framework dependencies (matches lib/founder-
 * security.ts's and lib/founder-certification.ts's convention). See
 * services/founder-settings.ts for why every fact this page shows is
 * derived from Certification Center's own already-computed controls.
 */

import type { CertificationControl, CertificationStatus } from '@/lib/founder-certification';

export type FounderSettingsControlView = {
  key: string;
  label: string;
  status: CertificationStatus;
  summary: string;
};

// The four Security Summary facts this page surfaces, matching the task's
// own required list (Founder Authentication / OAuth State Signing /
// Tenant Isolation / Audit Logging) — real key lookups into Certification's
// security-* mirror, not a second, separately-defined list of claims.
export const SECURITY_SUMMARY_KEYS: { key: string; label: string }[] = [
  { key: 'security-founder-authentication', label: 'Founder Authentication' },
  { key: 'security-oauth-state-signing-fallback', label: 'OAuth State Signing' },
  { key: 'security-organization-data-isolation', label: 'Tenant Isolation' },
  { key: 'security-founder-audit-logging', label: 'Audit Logging' },
];

// The five Operational Configuration facts the task asks for. Four are
// Certification's mirror of Security's own infrastructure controls;
// AI Provider Configuration is Certification's own control, sourced from
// the same live env-presence check /founder/certification already shows.
export const OPERATIONAL_KEYS: { key: string; label: string }[] = [
  { key: 'security-database-security', label: 'Database' },
  { key: 'security-redis-queue-security', label: 'Redis' },
  { key: 'ai-provider-configuration', label: 'AI Provider Configuration' },
  { key: 'security-encryption-configuration', label: 'Encryption Configuration' },
  { key: 'security-error-monitoring', label: 'Error Monitoring' },
];

// A control that could not be found by key (only possible when
// buildFounderSecurityPosture() itself failed inside Certification, which
// collapses every individual security-* control into one
// 'security-unavailable' fallback control) is surfaced honestly as
// NOT_VERIFIED — "insufficient evidence to make a defensible claim" is
// exactly what a missing/unreachable source means, not silently rendered
// as VERIFIED or hidden.
export function findControl(controls: CertificationControl[], key: string, label: string): FounderSettingsControlView {
  const found = controls.find((c) => c.key === key);
  if (found) return { key, label, status: found.status, summary: found.summary };
  const unavailable = controls.find((c) => c.key === 'security-unavailable');
  return {
    key,
    label,
    status: 'NOT_VERIFIED',
    summary: unavailable ? unavailable.summary : 'This control\'s status could not be determined this run.',
  };
}

export function securityKpisFrom(controls: CertificationControl[]) {
  const securityControls = controls.filter((c) => c.key.startsWith('security-'));
  return {
    totalControls: securityControls.length,
    verified: securityControls.filter((c) => c.status === 'VERIFIED').length,
    attention: securityControls.filter((c) => c.status === 'ATTENTION').length,
    notVerified: securityControls.filter((c) => c.status === 'NOT_VERIFIED').length,
    failed: securityControls.filter((c) => c.status === 'FAILED').length,
  };
}
