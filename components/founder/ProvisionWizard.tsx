'use client';

import { useActionState, useEffect, useId, useMemo, useState } from 'react';
import Link from 'next/link';
import { MAX_ESTIMATED_ARR_USD } from '@/lib/plans';

export type ProvisionActionState = {
  ok?: boolean;
  error?: string;
  errorCode?: 'DUPLICATE_DOMAIN' | 'VALIDATION' | 'UNKNOWN';
  customerId?: string;
  companyName?: string;
  adminEmail?: string;
  adminInviteLink?: string;
};

type CatalogItem = { key: string; label: string; category: string; description?: string; defaultEnabled?: boolean };
type RoleItem = { key: string; label: string };
// Mirrors lib/plans.ts's CommercialPlan, trimmed to what the wizard needs to
// display — the server (page.tsx) is the only place that reads the catalog
// module itself; the wizard only ever sees this plain-data prop.
type PlanCatalogItem = { tier: string; displayName: string; priceLabel: string; seatLimit: number | null; connectedSystemLimit: number | null; suggestedArrUsd: number | null };

type DomainCheckResult = { available: boolean; existingCompanyName?: string };

type ProvisionWizardProps = {
  readOnly: boolean;
  accessSafeError?: string;
  features: CatalogItem[];
  integrations: CatalogItem[];
  adminRoles: RoleItem[];
  plans: PlanCatalogItem[];
  checkDomainAction: (domain: string) => Promise<DomainCheckResult>;
  provisionAction: (prevState: ProvisionActionState, formData: FormData) => Promise<ProvisionActionState>;
};

const STEPS = [
  { id: 'company', label: 'Company' },
  { id: 'plan', label: 'Plan & Commercial' },
  { id: 'seats', label: 'Seats' },
  { id: 'features', label: 'Feature Access' },
  { id: 'integrations', label: 'Integration Access' },
  { id: 'admin', label: 'Customer Admin' },
  { id: 'review', label: 'Review' },
  { id: 'provision', label: 'Provision' },
] as const;

const DRAFT_KEY = 'approvline:founder:provision-draft:v1';
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9.-]*\.[a-z]{2,}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type DraftState = {
  companyName: string;
  domain: string;
  industry: string;
  notes: string;
  headquarters: string;
  companySize: string;
  planTier: string;
  billingType: 'ANNUAL' | 'MONTHLY';
  contractStartDate: string;
  contractEndDate: string;
  // Kept as a raw string (not a number) so the field can start genuinely
  // empty for Enterprise — there is no such thing as a "0 ARR" default to
  // fall back to without misrepresenting an unentered value as a real figure.
  estimatedArrUsd: string;
  seats: number;
  enabledFeatures: string[];
  enabledIntegrations: string[];
  adminName: string;
  adminEmail: string;
  adminRole: string;
};

function defaultDraft(features: CatalogItem[], integrations: CatalogItem[]): DraftState {
  return {
    companyName: '',
    domain: '',
    industry: '',
    notes: '',
    headquarters: '',
    companySize: '',
    planTier: 'ENTERPRISE',
    billingType: 'ANNUAL',
    contractStartDate: new Date().toISOString().slice(0, 10),
    contractEndDate: '',
    // Default plan is Enterprise (custom pricing) — never auto-calculated, so
    // this starts empty regardless of plan; the Business-suggestion effect
    // below only fills it in if/when the Founder selects Business.
    estimatedArrUsd: '',
    seats: 5,
    // Default selection is driven by each catalog entry's own defaultEnabled
    // flag (services/founder.ts), not a hardcoded list of keys here — a
    // feature added to the catalog is automatically included in this
    // computation with no wizard change required.
    enabledFeatures: features.filter((f) => f.defaultEnabled).map((f) => f.key),
    enabledIntegrations: integrations.map((i) => i.key),
    adminName: '',
    adminEmail: '',
    adminRole: 'ORG_ADMIN',
  };
}

function StepIcon({ index, active, complete }: { index: number; active: boolean; complete: boolean }) {
  return (
    <span
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black transition-colors ${
        complete
          ? 'bg-[#2557dc] text-white'
          : active
            ? 'border-2 border-[#2557dc] text-[#2557dc]'
            : 'border-2 border-slate-200 text-slate-400'
      }`}
    >
      {complete ? (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true">
          <path d="M3 8.5L6.5 12L13 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        index + 1
      )}
    </span>
  );
}

function Field({ label, required, children, hint, error }: { label: string; required?: boolean; children: React.ReactNode; hint?: string; error?: string }) {
  return (
    <label className="grid gap-2 text-sm font-black text-slate-700">
      <span>
        {label}
        {required ? <span className="text-rose-600"> *</span> : null}
      </span>
      {children}
      {hint ? <span className="text-xs font-semibold text-slate-400">{hint}</span> : null}
      {error ? <span role="alert" className="text-xs font-bold text-rose-600">{error}</span> : null}
    </label>
  );
}

const inputClass = 'min-h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-900 outline-none transition focus:border-[#2557dc] focus:ring-4 focus:ring-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100';

export function ProvisionWizard({ readOnly, accessSafeError, features, integrations, adminRoles, plans, checkDomainAction, provisionAction }: ProvisionWizardProps) {
  const [step, setStep] = useState(0);
  const [furthestStep, setFurthestStep] = useState(0);
  const [draft, setDraft] = useState<DraftState>(() => defaultDraft(features, integrations));
  const [draftBanner, setDraftBanner] = useState<'none' | 'restored' | 'saved'>('none');
  const [domainCheck, setDomainCheck] = useState<{ checking: boolean; result?: DomainCheckResult }>({ checking: false });
  // Stable per-mount id (React's useId, not crypto.randomUUID — that would
  // differ between server and client render and trip a hydration mismatch)
  // used as the idempotency key for this wizard attempt.
  const requestId = useId();
  const [state, formAction, isPending] = useActionState(provisionAction, {});

  // Restore a draft saved earlier in this browser, if any.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(DRAFT_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as DraftState;
      setDraft((prev) => ({ ...prev, ...parsed }));
      setDraftBanner('restored');
    } catch {
      // Corrupt or inaccessible localStorage — start fresh, no error surfaced.
    }
  }, []);

  const saveDraft = () => {
    try {
      window.localStorage.setItem(DRAFT_KEY, JSON.stringify(draft));
      setDraftBanner('saved');
    } catch {
      setDraftBanner('none');
    }
  };

  const discardDraft = () => {
    try { window.localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    setDraft(defaultDraft(features, integrations));
    setDraftBanner('none');
    setStep(0);
    setFurthestStep(0);
  };

  // Debounced live domain-availability check.
  useEffect(() => {
    const normalized = draft.domain.trim().toLowerCase();
    if (!DOMAIN_PATTERN.test(normalized)) {
      setDomainCheck({ checking: false });
      return;
    }
    setDomainCheck({ checking: true });
    const handle = setTimeout(() => {
      checkDomainAction(normalized)
        .then((result) => setDomainCheck({ checking: false, result }))
        .catch(() => setDomainCheck({ checking: false }));
    }, 400);
    return () => clearTimeout(handle);
  }, [draft.domain, checkDomainAction]);

  const domainTaken = domainCheck.result?.available === false;
  const selectedPlan = plans.find((p) => p.tier === draft.planTier);

  // Business-plan Estimated ARR suggestion: only pre-fills an empty field, and
  // only for plans that publish a suggestion (lib/plans.ts's
  // suggestedAnnualEstimate returns null for custom/unset pricing, so
  // Enterprise never gets one). Never overwrites a value the Founder already
  // typed or confirmed.
  useEffect(() => {
    setDraft((d) => {
      if (d.estimatedArrUsd.trim() !== '') return d;
      const plan = plans.find((p) => p.tier === d.planTier);
      if (plan?.suggestedArrUsd == null) return d;
      return { ...d, estimatedArrUsd: String(plan.suggestedArrUsd) };
    });
  }, [draft.planTier, plans]);

  const isSuggestedArrValue = selectedPlan?.suggestedArrUsd != null && draft.estimatedArrUsd.trim() === String(selectedPlan.suggestedArrUsd);

  const validation = useMemo(() => {
    const errors: Record<string, string> = {};
    if (!draft.companyName.trim()) errors.companyName = 'Company name is required.';
    if (!DOMAIN_PATTERN.test(draft.domain.trim())) errors.domain = 'Enter a valid domain, e.g. acme.com.';
    else if (domainTaken) errors.domain = `${draft.domain} already belongs to "${domainCheck.result?.existingCompanyName}".`;
    if (!Number.isFinite(draft.seats) || draft.seats < 1) errors.seats = 'Seats must be at least 1.';
    else if (draft.seats > 50_000) errors.seats = 'Seats cannot exceed 50,000.';
    else if (selectedPlan?.seatLimit != null && draft.seats > selectedPlan.seatLimit) {
      errors.seats = `${selectedPlan.displayName} includes up to ${selectedPlan.seatLimit} users. Reduce seats or switch to a plan with contract-defined seats.`;
    }
    // Estimated ARR: a required, Founder-entered internal planning figure —
    // mirrors the exact wording/order of services/founder.ts's server-side
    // validation so the wizard never blocks (or allows) something the server
    // would decide differently.
    const arrRaw = draft.estimatedArrUsd.trim();
    if (!arrRaw) {
      errors.estimatedArrUsd = 'Estimated ARR is required.';
    } else {
      const arrNum = Number(arrRaw);
      if (!Number.isFinite(arrNum)) errors.estimatedArrUsd = 'Enter a valid estimated ARR.';
      else if (arrNum <= 0) errors.estimatedArrUsd = 'Estimated ARR must be greater than zero.';
      else if (arrNum > MAX_ESTIMATED_ARR_USD) errors.estimatedArrUsd = `Estimated ARR cannot exceed $${MAX_ESTIMATED_ARR_USD.toLocaleString()}.`;
    }
    if (!draft.adminName.trim()) errors.adminName = 'Administrator name is required.';
    if (!EMAIL_PATTERN.test(draft.adminEmail.trim())) errors.adminEmail = 'Enter a valid administrator email.';
    return errors;
  }, [draft, domainTaken, domainCheck.result, selectedPlan]);

  const stepErrorKeys: Record<number, string[]> = {
    0: ['companyName', 'domain'],
    1: ['estimatedArrUsd'],
    2: ['seats'],
    5: ['adminName', 'adminEmail'],
  };

  const stepHasError = (index: number) => (stepErrorKeys[index] ?? []).some((key) => key in validation);
  const readyToProvision = Object.keys(validation).length === 0 && !readOnly;
  const outstandingCount = Object.keys(validation).length;

  const goToStep = (index: number) => {
    if (index <= furthestStep) setStep(index);
  };
  // Edit links (Review section + sidebar summary) always jump, even to a
  // step past furthestStep — they're a direct "go fix this" shortcut, not
  // the top stepper's progressive-disclosure nav. Bumping furthestStep too
  // keeps the top stepper's reachable-step state consistent with the jump.
  const jumpToStep = (index: number) => {
    setStep(index);
    setFurthestStep((f) => Math.max(f, index));
  };
  const advance = () => {
    const next = Math.min(step + 1, STEPS.length - 1);
    setStep(next);
    setFurthestStep((f) => Math.max(f, next));
  };
  const back = () => setStep((s) => Math.max(0, s - 1));

  const set = <K extends keyof DraftState>(key: K, value: DraftState[K]) => setDraft((d) => ({ ...d, [key]: value }));

  const toggleInSet = (key: 'enabledFeatures' | 'enabledIntegrations', value: string) => {
    setDraft((d) => {
      const current = new Set(d[key]);
      if (current.has(value)) current.delete(value); else current.add(value);
      return { ...d, [key]: Array.from(current) };
    });
  };

  // ─── Post-provision success screen ───────────────────────────────────────
  if (state.ok) {
    return (
      <div className="space-y-6">
        <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-8 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">Customer Created</p>
          <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">{state.companyName}</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-emerald-900">
            The customer workspace, plan, seats, feature access, and integration access were created. The administrator you specified has an invitation ready.
          </p>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Administrator Invitation</p>
          <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
            No email has been sent automatically. Share this sign-up link with <strong>{state.adminEmail}</strong> yourself, or route it through your own outreach.
          </p>
          <div className="mt-4 flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
            <code className="break-all text-xs font-bold text-slate-700">{state.adminInviteLink}</code>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(state.adminInviteLink ?? '')}
              className="shrink-0 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 hover:bg-slate-100"
            >
              Copy link
            </button>
          </div>
        </section>

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Onboarding progress</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs font-black uppercase tracking-wide">
            {['Provisioned', 'Admin Invited', 'Admin Accepted', 'Integrations Connected', 'Go-Live'].map((stage, i) => (
              <span key={stage} className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1.5 ${i <= 1 ? 'bg-[#2557dc] text-white' : 'border border-slate-200 text-slate-400'}`}>{stage}</span>
                {i < 4 ? <span className="text-slate-300">→</span> : null}
              </span>
            ))}
          </div>
          <p className="mt-3 text-xs font-semibold text-slate-400">
            Reflects real account state: the account exists and the administrator has been invited. The remaining stages update automatically as the administrator accepts and connects integrations.
          </p>
        </section>

        <div className="flex flex-wrap gap-3">
          <Link href={`/founder/customers/${state.customerId}`} className="rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white shadow-sm hover:bg-blue-700">
            Open Customer 360
          </Link>
          <Link href={`/founder/pilots/${state.customerId}`} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
            Open Onboarding
          </Link>
          <Link href="/founder/customers" className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
            Return to Customers
          </Link>
        </div>
      </div>
    );
  }

  // ─── Wizard ───────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-start">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Provisioning</p>
            <h2 className="mt-2 text-3xl font-black tracking-tight text-slate-950">Provision New Customer</h2>
            <p className="mt-2 max-w-3xl text-sm font-semibold leading-6 text-slate-600">
              Set up a new enterprise customer with plan, seats, feature access, integration access, and administrator onboarding.
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={saveDraft} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
              Save as Draft
            </button>
          </div>
        </div>

        {accessSafeError ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold leading-6 text-amber-900">
            Founder access could not be checked safely. Safe diagnostic: {accessSafeError}
          </div>
        ) : null}
        {readOnly ? (
          <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-900">
            Support admins have read-only access. You can fill out this form, but provisioning is disabled for your role.
          </div>
        ) : null}
        {draftBanner === 'restored' ? (
          <div className="mt-4 flex items-center justify-between gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4 text-sm font-bold text-blue-900">
            <span>Restored a draft saved earlier in this browser.</span>
            <button type="button" onClick={discardDraft} className="shrink-0 text-xs font-black uppercase text-blue-700 underline">Discard draft</button>
          </div>
        ) : null}
        {draftBanner === 'saved' ? (
          <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm font-bold text-emerald-900">
            Draft saved in this browser. It will be restored next time you open this page here.
          </div>
        ) : null}
        {state.error ? (
          <div role="alert" className="mt-4 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700">
            {state.error}
          </div>
        ) : null}

        <nav aria-label="Provisioning steps" className="mt-6 flex flex-wrap gap-x-1 gap-y-3">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              onClick={() => goToStep(i)}
              disabled={i > furthestStep}
              aria-current={step === i ? 'step' : undefined}
              className="flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-2 py-1 disabled:cursor-not-allowed"
            >
              <StepIcon index={i} active={step === i} complete={i < step && !stepHasError(i)} />
              <span className={`text-xs font-black ${step === i ? 'text-[#2557dc]' : i > furthestStep ? 'text-slate-300' : 'text-slate-500'}`}>{s.label}</span>
            </button>
          ))}
        </nav>
      </section>

      <form action={formAction} className="grid gap-6 xl:grid-cols-[1fr_0.8fr]">
        {/* Hidden fields carrying full wizard state to the final submit */}
        <input type="hidden" name="requestId" value={requestId} />
        <input type="hidden" name="companyName" value={draft.companyName} />
        <input type="hidden" name="domain" value={draft.domain} />
        <input type="hidden" name="industry" value={draft.industry} />
        <input type="hidden" name="notes" value={draft.notes} />
        <input type="hidden" name="headquarters" value={draft.headquarters} />
        <input type="hidden" name="companySize" value={draft.companySize} />
        <input type="hidden" name="planTier" value={draft.planTier} />
        <input type="hidden" name="billingType" value={draft.billingType} />
        <input type="hidden" name="contractStartDate" value={draft.contractStartDate} />
        <input type="hidden" name="contractEndDate" value={draft.contractEndDate} />
        <input type="hidden" name="estimatedArrUsd" value={draft.estimatedArrUsd} />
        <input type="hidden" name="seats" value={draft.seats} />
        <input type="hidden" name="dataRetentionDays" value={365} />
        <input type="hidden" name="primaryAdminName" value={draft.adminName} />
        <input type="hidden" name="primaryAdminEmail" value={draft.adminEmail} />
        <input type="hidden" name="adminRole" value={draft.adminRole} />
        {draft.enabledFeatures.map((key) => <input key={key} type="hidden" name="features" value={key} />)}
        {draft.enabledIntegrations.map((key) => <input key={key} type="hidden" name="integrations" value={key} />)}

        <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          {step === 0 && (
            <div className="grid gap-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">1. Company Information</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Company Name" required error={validation.companyName}>
                  <input className={inputClass} value={draft.companyName} onChange={(e) => set('companyName', e.target.value)} placeholder="Acme Corporation" />
                </Field>
                <Field
                  label="Company Domain"
                  required
                  error={validation.domain}
                  hint={domainCheck.checking ? 'Checking availability…' : domainCheck.result?.available === true ? 'Domain available.' : undefined}
                >
                  <input className={inputClass} value={draft.domain} onChange={(e) => set('domain', e.target.value)} placeholder="acme.com" />
                </Field>
                <Field label="Industry (Optional)">
                  <input className={inputClass} value={draft.industry} onChange={(e) => set('industry', e.target.value)} placeholder="Technology" />
                </Field>
                <Field label="Headquarters (Optional)">
                  <input className={inputClass} value={draft.headquarters} onChange={(e) => set('headquarters', e.target.value)} placeholder="Bengaluru, India" />
                </Field>
              </div>
              <Field label="Internal Notes (Optional)">
                <textarea className={`${inputClass} min-h-24 py-3`} value={draft.notes} onChange={(e) => set('notes', e.target.value)} placeholder="Add any additional notes about this customer…" />
              </Field>
            </div>
          )}

          {step === 1 && (
            <div className="grid gap-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">2. Plan & Commercial</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Plan" required hint={selectedPlan?.priceLabel}>
                  <select className={inputClass} value={draft.planTier} onChange={(e) => set('planTier', e.target.value)}>
                    {plans.map((p) => <option key={p.tier} value={p.tier}>{p.displayName}</option>)}
                  </select>
                </Field>
                <Field label="Billing Type">
                  <div className="flex gap-2">
                    {(['ANNUAL', 'MONTHLY'] as const).map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => set('billingType', type)}
                        className={`min-h-12 flex-1 rounded-xl px-4 text-sm font-black transition ${draft.billingType === type ? 'bg-[#2557dc] text-white' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                      >
                        {type === 'ANNUAL' ? 'Annual' : 'Monthly'}
                      </button>
                    ))}
                  </div>
                </Field>
                <Field label="Contract Start Date">
                  <input type="date" className={inputClass} value={draft.contractStartDate} onChange={(e) => set('contractStartDate', e.target.value)} />
                </Field>
                <Field label="Contract End Date (Optional)">
                  <input type="date" className={inputClass} value={draft.contractEndDate} onChange={(e) => set('contractEndDate', e.target.value)} />
                </Field>
              </div>
              <label className="grid gap-2 text-sm font-black text-slate-700">
                <span>
                  Estimated ARR
                  <span className="text-rose-600"> *</span>
                </span>
                <div className="relative max-w-xs">
                  <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-slate-400">$</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    className={`${inputClass} w-full pl-8`}
                    value={draft.estimatedArrUsd}
                    onChange={(e) => set('estimatedArrUsd', e.target.value)}
                    placeholder="e.g. 24000"
                  />
                </div>
                <span className="text-xs font-semibold text-slate-400">
                  Estimated annual recurring revenue for internal planning. This is not actual billed revenue.
                </span>
                {isSuggestedArrValue ? (
                  <span className="text-xs font-bold text-[#2557dc]">
                    Suggested from the current Business monthly price. Confirm or adjust for the customer agreement.
                  </span>
                ) : null}
                {validation.estimatedArrUsd ? <span role="alert" className="text-xs font-bold text-rose-600">{validation.estimatedArrUsd}</span> : null}
              </label>
            </div>
          )}

          {step === 2 && (
            <div className="grid gap-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">3. Seats</p>
              <Field
                label="Number of Seats"
                required
                error={validation.seats}
                hint={selectedPlan?.seatLimit != null ? `${selectedPlan.displayName} includes up to ${selectedPlan.seatLimit} users.` : undefined}
              >
                <input type="number" min={1} max={selectedPlan?.seatLimit ?? 50000} className={`${inputClass} max-w-xs`} value={draft.seats} onChange={(e) => set('seats', Math.round(Number(e.target.value)))} />
              </Field>
              <p className="text-sm font-semibold text-slate-500">Seats can be adjusted later according to the customer&apos;s plan and billing configuration.</p>
            </div>
          )}

          {step === 3 && (
            <div className="grid gap-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">4. Feature Access</p>
              <p className="text-sm font-semibold text-slate-500">Enable the product features available to this customer. Reflects your existing feature catalog — enabling here does not bypass individual user permissions.</p>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                {features.every((f) => f.defaultEnabled)
                  ? `All ${features.length} features are enabled by default for new customers.`
                  : `${features.filter((f) => f.defaultEnabled).length} of ${features.length} features are enabled by default for new customers.`}
                {' '}Deselect any that shouldn&apos;t be available to this one.
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {features.map((feature) => {
                  const enabled = draft.enabledFeatures.includes(feature.key);
                  return (
                    <label key={feature.key} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <input type="checkbox" checked={enabled} onChange={() => toggleInSet('enabledFeatures', feature.key)} className="mt-1 h-4 w-4" />
                      <span>
                        <span className="block font-black text-slate-950">{feature.label}</span>
                        <span className="block text-xs font-semibold leading-5 text-slate-500">{feature.description}</span>
                        <span className="mt-1 inline-block rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-slate-400">{feature.category}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="grid gap-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">5. Integration Access</p>
              <p className="text-sm font-semibold text-slate-500">
                Granting access here does not connect anything. The customer&apos;s own IT team still authenticates and connects each integration from inside their workspace — ApprovLine founders never see or handle customer OAuth credentials.
              </p>
              <div className="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-900">
                All {integrations.length} integrations are granted access by default for new customers. Deselect any that shouldn&apos;t be available to this one.
              </div>
              {selectedPlan?.connectedSystemLimit != null && draft.enabledIntegrations.length > selectedPlan.connectedSystemLimit ? (
                <div className="rounded-2xl border border-blue-200 bg-blue-50 p-3 text-xs font-bold text-blue-900">
                  {selectedPlan.displayName} includes up to {selectedPlan.connectedSystemLimit} connected systems — {draft.enabledIntegrations.length} are selected. This does not block provisioning; confirm it&apos;s intentional or reduce the selection to match the plan.
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {integrations.map((integration) => {
                  const enabled = draft.enabledIntegrations.includes(integration.key);
                  return (
                    <label key={integration.key} className="flex items-start gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                      <input type="checkbox" checked={enabled} onChange={() => toggleInSet('enabledIntegrations', integration.key)} className="mt-1 h-4 w-4" />
                      <span>
                        <span className="block font-black text-slate-950">{integration.label}</span>
                        <span className="block text-xs font-semibold text-slate-500">{integration.category} · customer-owned connection</span>
                        <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${enabled ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-400'}`}>
                          {enabled ? 'Access granted' : 'Not enabled'}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {step === 5 && (
            <div className="grid gap-5">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">6. Customer Administrator</p>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="Administrator Name" required error={validation.adminName}>
                  <input className={inputClass} value={draft.adminName} onChange={(e) => set('adminName', e.target.value)} placeholder="Sarah Johnson" />
                </Field>
                <Field label="Administrator Email" required error={validation.adminEmail}>
                  <input type="email" className={inputClass} value={draft.adminEmail} onChange={(e) => set('adminEmail', e.target.value.toLowerCase())} placeholder="sarah@acme.com" />
                </Field>
                <Field label="Role" required hint='Defaults to "Org Admin" — the highest customer-side role in the existing role model.'>
                  <select className={inputClass} value={draft.adminRole} onChange={(e) => set('adminRole', e.target.value)}>
                    {adminRoles.map((role) => <option key={role.key} value={role.key}>{role.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-600">
                Invitation status: <strong className="text-slate-900">Ready</strong> — an invite link will be generated when you provision. No email is sent automatically; you share the link yourself.
              </div>
            </div>
          )}

          {step === 6 && (
            <div className="grid gap-5">
              <div className="rounded-2xl border border-[#2557dc]/20 bg-[#2557dc]/5 p-4">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">7. Review — Final Check</p>
                <p className="mt-1 text-sm font-semibold text-slate-600">Every section below will be written when you provision. Use Edit to correct anything before confirming on the right.</p>
              </div>
              {[
                { title: 'Company', stepIndex: 0, rows: [['Company', draft.companyName], ['Domain', draft.domain], ['Industry', draft.industry || '—'], ['Headquarters', draft.headquarters || '—']] },
                { title: 'Plan & Commercial', stepIndex: 1, rows: [['Plan', selectedPlan?.displayName ?? draft.planTier], ['Price', selectedPlan?.priceLabel ?? '—'], ['Estimated ARR', draft.estimatedArrUsd.trim() && !validation.estimatedArrUsd ? `$${Number(draft.estimatedArrUsd).toLocaleString()}` : 'Estimated ARR — Required'], ['Billing type', draft.billingType === 'ANNUAL' ? 'Annual' : 'Monthly'], ['Contract start', draft.contractStartDate || '—'], ['Contract end', draft.contractEndDate || '—']] },
                { title: 'Seats', stepIndex: 2, rows: [['Seats', String(draft.seats)]] },
                { title: 'Feature Access', stepIndex: 3, rows: [['Enabled', `${draft.enabledFeatures.length} of ${features.length} features`]] },
                { title: 'Integration Access', stepIndex: 4, rows: [['Granted', `${draft.enabledIntegrations.length} of ${integrations.length} integrations`]] },
                { title: 'Customer Admin', stepIndex: 5, rows: [['Name', draft.adminName || '—'], ['Email', draft.adminEmail || '—'], ['Role', adminRoles.find((r) => r.key === draft.adminRole)?.label ?? draft.adminRole]] },
              ].map((section) => (
                <div key={section.title} className="rounded-2xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">{section.title}</p>
                    <button type="button" onClick={() => jumpToStep(section.stepIndex)} className="text-xs font-black text-[#2557dc] hover:text-blue-700">Edit</button>
                  </div>
                  <dl className="mt-2 grid gap-1 sm:grid-cols-2">
                    {section.rows.map(([label, value]) => (
                      <div key={label} className="flex justify-between gap-2 text-sm">
                        <dt className="font-semibold text-slate-400">{label}</dt>
                        <dd className="font-black text-slate-900">{value}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Right: live provisioning summary */}
        <aside className="h-fit rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">Provisioning Summary</p>
          <div className="mt-4 space-y-4 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-black text-slate-950">{draft.companyName || 'Untitled company'}</p>
                <p className="text-xs font-semibold text-slate-400">{draft.domain || 'no domain set'}</p>
              </div>
              <button type="button" onClick={() => jumpToStep(0)} className="shrink-0 text-xs font-black text-[#2557dc]">Edit</button>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
              <div>
                <p className="font-black text-slate-950">{selectedPlan?.displayName ?? draft.planTier}</p>
                <p className="text-xs font-semibold text-slate-400">{selectedPlan?.priceLabel}</p>
                <p className={`mt-1 text-xs font-black ${validation.estimatedArrUsd ? 'text-amber-600' : 'text-slate-500'}`}>
                  {draft.estimatedArrUsd.trim() && !validation.estimatedArrUsd
                    ? `Est. ARR $${Number(draft.estimatedArrUsd).toLocaleString()}`
                    : 'Estimated ARR — Required'}
                </p>
              </div>
              <button type="button" onClick={() => jumpToStep(1)} className="shrink-0 text-xs font-black text-[#2557dc]">Edit</button>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="font-black text-slate-950">{draft.seats} seats</p>
              <button type="button" onClick={() => jumpToStep(2)} className="shrink-0 text-xs font-black text-[#2557dc]">Edit</button>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="font-black text-slate-950">{draft.enabledFeatures.length} of {features.length} features</p>
              <button type="button" onClick={() => jumpToStep(3)} className="shrink-0 text-xs font-black text-[#2557dc]">Edit</button>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
              <p className="font-black text-slate-950">{draft.enabledIntegrations.length} of {integrations.length} integrations selected</p>
              <button type="button" onClick={() => jumpToStep(4)} className="shrink-0 text-xs font-black text-[#2557dc]">Edit</button>
            </div>
            <div className="flex items-start justify-between gap-3 border-t border-slate-100 pt-3">
              {draft.adminEmail ? (
                <p className="break-all font-black text-slate-950">{draft.adminEmail}</p>
              ) : (
                <p className="font-bold italic text-amber-600">Customer administrator not configured</p>
              )}
              <button type="button" onClick={() => jumpToStep(5)} className="shrink-0 text-xs font-black text-[#2557dc]">Edit</button>
            </div>
          </div>

          <div className="mt-5 rounded-2xl bg-slate-50 p-4">
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">What happens next?</p>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs font-semibold text-slate-600">
              <li>Customer account and workspace will be created</li>
              <li>An admin invite link will be generated (not auto-emailed)</li>
              <li>Feature and integration access will be configured as selected</li>
              <li>Progress can be tracked from Customer 360</li>
            </ol>
          </div>

          <div className={step < STEPS.length - 2 ? 'mt-5 border-t border-slate-100 pt-5' : 'mt-5 rounded-2xl border-2 border-[#2557dc]/15 bg-slate-50 p-4'}>
            {step < STEPS.length - 2 ? (
              <div className="flex gap-2">
                {step > 0 ? (
                  <button type="button" onClick={back} className="flex-1 rounded-xl border border-slate-200 px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">Back</button>
                ) : null}
                <button type="button" onClick={advance} className="flex-1 rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white hover:bg-blue-700">Next →</button>
              </div>
            ) : (
              <div className="grid gap-2">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">8. Provision</p>
                <p className={`text-xs font-black uppercase tracking-wide ${readyToProvision ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {readyToProvision ? 'Ready to provision' : readOnly ? 'Read-only role — provisioning disabled' : `${outstandingCount} item${outstandingCount === 1 ? '' : 's'} need attention`}
                </p>
                <div className="flex gap-2">
                  <button type="button" onClick={back} className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-100">Back</button>
                  <button
                    type="submit"
                    disabled={!readyToProvision || isPending}
                    className="flex-1 rounded-xl bg-[#2557dc] px-4 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                  >
                    {isPending ? 'Provisioning…' : 'Provision Customer'}
                  </button>
                </div>
                <p className="text-center text-xs font-semibold text-slate-400">Please complete all required sections</p>
              </div>
            )}
          </div>
        </aside>
      </form>
    </div>
  );
}
