/**
 * Founder Settings (/founder/settings) — a compact, read-only overview of
 * Founder Console access, security posture, certification state, and
 * operational configuration. Introduces no new authorization system, no
 * new security/health/certification engine, and (deliberately) no
 * persistence model of its own — see the module-level notes in
 * components/founder/FounderSettingsClient.tsx for why zero settings here
 * are actually mutable yet.
 *
 * ARCHITECTURE — every value below is read from an existing, already-
 * shipped Founder builder rather than recomputed:
 *
 *   - Founder identity/role/read-only state: services/founder.ts's
 *     getFounderAccess() (React cache()-deduped — calling it again here,
 *     after the layout already did, costs no extra Clerk/DB round trip).
 *
 *   - Security, certification, and operational (database/redis/AI-
 *     provider/encryption/error-monitoring) status ALL come from exactly
 *     ONE call to buildFounderCertificationCenter(). This is deliberate,
 *     not incidental: buildFounderCertificationCenter() already calls
 *     buildFounderSecurityPosture() internally and mirrors every one of
 *     its controls into its own `controls` array under a `security-`
 *     prefixed key (verbatim status/summary, unchanged) — so calling
 *     buildFounderSecurityPosture() a second time from this page, just to
 *     get the same four security facts, would duplicate that same
 *     expensive (DB + Redis + audit-log-query) builder in the same
 *     request, which the task's own performance rule (avoid calling the
 *     same builder multiple times) explicitly rules out. Certification
 *     also already computes its own 'ai-provider-configuration' control
 *     (from services/readiness.ts's ANTHROPIC_API_KEY/OPENAI_API_KEY
 *     checks) — the exact "AI Provider Configuration" fact this page
 *     needs — so no second readiness call is made either. One builder
 *     call produces every fact this page shows.
 *
 * This does mean Founder Settings pays Certification Center's real,
 * non-trivial aggregate cost (it internally also calls System Health,
 * Integration Health, Background Jobs, Observability, and Tenant
 * Isolation) to show what is otherwise a compact page — an explicit,
 * accepted trade-off documented in this task's own final report, not a
 * hidden one, given the alternative (a second independent
 * buildFounderSecurityPosture() call) is strictly worse.
 */

import { buildFounderCertificationCenter, type CertificationDecision } from '@/services/founder-certification';
import { SECURITY_SUMMARY_KEYS, OPERATIONAL_KEYS, findControl, securityKpisFrom, type FounderSettingsControlView } from '@/lib/founder-settings';

export type { FounderSettingsControlView };

export type FounderSettingsOverview = {
  generatedAt: Date;
  certificationDecision: CertificationDecision;
  securityKpis: ReturnType<typeof securityKpisFrom>;
  securityItems: FounderSettingsControlView[];
  operationalItems: FounderSettingsControlView[];
};

export async function buildFounderSettingsOverview(): Promise<FounderSettingsOverview> {
  const certification = await buildFounderCertificationCenter();

  return {
    generatedAt: certification.generatedAt,
    certificationDecision: certification.decision,
    securityKpis: securityKpisFrom(certification.controls),
    securityItems: SECURITY_SUMMARY_KEYS.map(({ key, label }) => findControl(certification.controls, key, label)),
    operationalItems: OPERATIONAL_KEYS.map(({ key, label }) => findControl(certification.controls, key, label)),
  };
}
