'use client';

import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import type { CopilotSetupDraft, IntegrationDraft, OnboardingStepKey, PlaybookDraft, TeamInviteDraft } from '@/services/onboarding';
import { onboardingStepKeys, onboardingStepLabels } from '@/services/onboarding';

type WizardState = {
  organization: {
    name: string;
    companyDomain: string;
    industry: string;
    companySize: string;
    country: string;
    primaryAdminName: string;
    primaryAdminEmail: string;
    departments: string[];
    approvalCategories: string[];
    onboardingStep: number;
    onboardingReadinessScore: number;
    onboardedAt: string | null;
    onboardingLastSavedAt: string | null;
    invitedTeamMembers: TeamInviteDraft[];
    integrationSetup: IntegrationDraft[];
    playbookSetup: PlaybookDraft[];
    copilotSetup: CopilotSetupDraft;
    memoryGraphInitializedAt: string | null;
  };
  seatUsage: { used: number; admins: number; invited: number };
};

const roles = ['Org Admin', 'Compliance', 'Legal', 'Finance', 'Procurement', 'Engineering', 'Security', 'HR', 'Viewer'];
const departments = ['Legal', 'Finance', 'Procurement', 'Compliance', 'Security', 'Engineering', 'HR', 'Operations'];
const categories = [
  'Vendor Approval',
  'Contract Approval',
  'Budget Approval',
  'Procurement Approval',
  'Security Exception Approval',
  'Change Request Approval',
  'HR Approval',
  'Compliance Approval',
];
const integrationNames = ['Slack', 'Gmail', 'Outlook', 'Microsoft Teams', 'Jira', 'Zoom', 'ServiceNow', 'Universal Gateway'];
const playbookCategories = ['Procurement Policy', 'Legal Policy', 'Security Policy', 'Finance Policy', 'SOP Documents', 'Compliance Documents'];
const sampleQuestions = [
  'Who approved Vendor ABC?',
  'What approvals violated policy?',
  'Show high-risk approvals.',
  'What approvals are missing Finance sign-off?',
];

function defaultIntegrations(existing: IntegrationDraft[]) {
  if (existing.length) return existing;
  return integrationNames.map((provider) => ({ provider, status: 'Not Connected' as const }));
}

function scoreFromState(state: WizardState['organization']) {
  const complete = [
    state.name && state.companyDomain && state.industry && state.companySize && state.country && state.primaryAdminName && state.primaryAdminEmail,
    state.invitedTeamMembers.length > 0,
    state.departments.length > 0,
    state.approvalCategories.length > 0,
    state.integrationSetup.length > 0 && state.integrationSetup.every((item) => item.status === 'Connected' || item.status === 'Skipped'),
    state.playbookSetup.length > 0,
    Boolean(state.memoryGraphInitializedAt),
    state.copilotSetup.dataSources.length > 0 && state.copilotSetup.permissions.length > 0 && Boolean(state.copilotSetup.scope),
  ].filter(Boolean).length;
  return state.onboardedAt ? 100 : Math.round((complete / 8) * 100);
}

function Badge({ children, tone = 'slate' }: { children: React.ReactNode; tone?: 'slate' | 'blue' | 'green' | 'amber' }) {
  const tones = {
    slate: 'bg-slate-100 text-slate-600',
    blue: 'bg-blue-50 text-[#2155d9]',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
  };
  return <span className={`rounded-full px-2.5 py-1 text-xs font-black ${tones[tone]}`}>{children}</span>;
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
      />
    </label>
  );
}

function SelectField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: string[];
}) {
  return (
    <label className="grid gap-2">
      <span className="text-sm font-black text-slate-700">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-12 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-950 shadow-sm outline-none transition focus:border-[#2155d9] focus:ring-4 focus:ring-blue-100"
      >
        <option value="">Select</option>
        {options.map((option) => <option key={option}>{option}</option>)}
      </select>
    </label>
  );
}

export function CustomerOnboardingWizard({ initialState }: { initialState: WizardState }) {
  const [state, setState] = useState(() => ({
    ...initialState.organization,
    integrationSetup: defaultIntegrations(initialState.organization.integrationSetup),
  }));
  const [step, setStep] = useState(Math.min(10, Math.max(1, initialState.organization.onboardingStep || 1)));
  const [inviteDraft, setInviteDraft] = useState<TeamInviteDraft>({ name: '', email: '', role: 'Org Admin' });
  const [customCategory, setCustomCategory] = useState('');
  const [saveState, setSaveState] = useState<'Saved' | 'Saving...' | 'Unsaved' | 'Error'>('Saved');
  const [isPending, startTransition] = useTransition();

  const readinessScore = useMemo(() => scoreFromState(state), [state]);
  const currentKey = onboardingStepKeys[step - 1];

  function update(updater: (draft: typeof state) => typeof state) {
    setSaveState('Unsaved');
    setState(updater);
  }

  function save(nextStep = step, completedStep?: OnboardingStepKey, complete = false) {
    setSaveState('Saving...');
    startTransition(async () => {
      try {
        const response = await fetch('/api/onboarding', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: nextStep,
            completedStep,
            organization: {
              name: state.name,
              companyDomain: state.companyDomain,
              industry: state.industry,
              companySize: state.companySize,
              country: state.country,
              primaryAdminName: state.primaryAdminName,
              primaryAdminEmail: state.primaryAdminEmail,
            },
            invitedTeamMembers: state.invitedTeamMembers,
            departments: state.departments,
            approvalCategories: state.approvalCategories,
            integrationSetup: state.integrationSetup,
            playbookSetup: state.playbookSetup,
            copilotSetup: state.copilotSetup,
            memoryGraphInitialized: Boolean(state.memoryGraphInitializedAt),
            complete,
          }),
        });
        if (!response.ok) throw new Error('Save failed');
        setStep(nextStep);
        setSaveState('Saved');
        if (complete) window.location.href = '/dashboard';
      } catch {
        setSaveState('Error');
      }
    });
  }

  function next() {
    save(Math.min(10, step + 1), currentKey);
  }

  function back() {
    save(Math.max(1, step - 1));
  }

  return (
    <main className="min-h-screen bg-[linear-gradient(135deg,#f8fafc_0%,#eef4ff_45%,#f7f9fc_100%)] text-slate-950">
      <div className="mx-auto grid min-h-screen max-w-7xl gap-6 px-4 py-6 lg:grid-cols-[300px_1fr] lg:px-6">
        <aside className="rounded-[28px] border border-white/70 bg-[#07111f] p-6 text-white shadow-[0_24px_80px_rgba(15,23,42,0.18)] lg:sticky lg:top-6 lg:h-[calc(100vh-48px)]">
          <Link href="/" className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-[#2155d9]">
              <span className="text-lg font-black">A</span>
            </span>
            <span>
              <span className="block text-xl font-black">ApprovLine</span>
              <span className="text-xs font-bold text-slate-400">Every approval. Captured. Proven.</span>
            </span>
          </Link>

          <div className="mt-8 rounded-2xl border border-white/10 bg-white/[0.06] p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Readiness</p>
              <Badge tone={readinessScore >= 80 ? 'green' : readinessScore >= 50 ? 'amber' : 'blue'}>{readinessScore}%</Badge>
            </div>
            <div className="mt-4 h-2 rounded-full bg-white/10">
              <div className="h-2 rounded-full bg-[#2f6bff]" style={{ width: `${readinessScore}%` }} />
            </div>
            <p className="mt-3 text-sm font-semibold text-slate-300">Operational setup for {state.name || 'your workspace'}.</p>
          </div>

          <nav className="mt-6 grid gap-1.5">
            {onboardingStepKeys.map((key, index) => {
              const active = index + 1 === step;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => save(index + 1)}
                  className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-black transition ${
                    active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <span className={`grid h-6 w-6 place-items-center rounded-full text-xs ${active ? 'bg-[#2155d9] text-white' : 'bg-white/10 text-slate-300'}`}>{index + 1}</span>
                  {onboardingStepLabels[key]}
                </button>
              );
            })}
          </nav>
        </aside>

        <section className="grid content-start gap-6">
          <header className="rounded-[28px] border border-slate-200 bg-white/90 p-6 shadow-sm backdrop-blur">
            <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.22em] text-[#2155d9]">Step {step} of 10</p>
                <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950 md:text-4xl">{onboardingStepLabels[currentKey]}</h1>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
                  Configure ApprovLine so your team can capture approvals, evaluate policies, and launch in under 15 minutes.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={saveState === 'Saved' ? 'green' : saveState === 'Error' ? 'amber' : 'blue'}>{isPending ? 'Saving...' : saveState}</Badge>
                <Link href="/dashboard" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700 shadow-sm hover:bg-slate-50">Exit</Link>
              </div>
            </div>
          </header>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-[0_20px_70px_rgba(15,23,42,0.08)]">
            {step === 1 ? (
              <div className="grid gap-6">
                <div className="grid gap-4 md:grid-cols-2">
                  <Field label="Company Name" value={state.name} onChange={(value) => update((draft) => ({ ...draft, name: value }))} placeholder="Acme Inc." />
                  <Field label="Company Domain" value={state.companyDomain} onChange={(value) => update((draft) => ({ ...draft, companyDomain: value }))} placeholder="acme.com" />
                  <SelectField label="Industry" value={state.industry} onChange={(value) => update((draft) => ({ ...draft, industry: value }))} options={['SaaS', 'Financial Services', 'Healthcare', 'Pharma', 'Manufacturing', 'Retail', 'Logistics']} />
                  <SelectField label="Company Size" value={state.companySize} onChange={(value) => update((draft) => ({ ...draft, companySize: value }))} options={['1-100', '101-500', '501-1000', '1000+']} />
                  <Field label="Country" value={state.country} onChange={(value) => update((draft) => ({ ...draft, country: value }))} placeholder="United States" />
                  <Field label="Primary Admin Name" value={state.primaryAdminName} onChange={(value) => update((draft) => ({ ...draft, primaryAdminName: value }))} placeholder="Sarah Chen" />
                  <Field label="Primary Admin Email" type="email" value={state.primaryAdminEmail} onChange={(value) => update((draft) => ({ ...draft, primaryAdminEmail: value }))} placeholder="sarah@acme.com" />
                </div>
                <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-5">
                  <p className="text-xs font-black uppercase tracking-wide text-[#2155d9]">Organization Summary</p>
                  <p className="mt-2 text-lg font-black text-slate-950">{state.name || 'Workspace name pending'}</p>
                  <p className="text-sm text-slate-600">{[state.industry, state.companySize, state.country].filter(Boolean).join(' · ') || 'Add company details to unlock validation.'}</p>
                </div>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="grid gap-5">
                <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 md:grid-cols-[1fr_1fr_180px_auto]">
                  <Field label="Name" value={inviteDraft.name} onChange={(value) => setInviteDraft((draft) => ({ ...draft, name: value }))} placeholder="Priya Sharma" />
                  <Field label="Email" type="email" value={inviteDraft.email} onChange={(value) => setInviteDraft((draft) => ({ ...draft, email: value }))} placeholder="priya@company.com" />
                  <SelectField label="Role" value={inviteDraft.role} onChange={(value) => setInviteDraft((draft) => ({ ...draft, role: value }))} options={roles} />
                  <button
                    type="button"
                    onClick={() => {
                      if (!inviteDraft.email) return;
                      update((draft) => ({ ...draft, invitedTeamMembers: [...draft.invitedTeamMembers, inviteDraft] }));
                      setInviteDraft({ name: '', email: '', role: 'Viewer' });
                    }}
                    className="self-end rounded-xl bg-[#2155d9] px-4 py-3 text-sm font-black text-white"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700">CSV upload</button>
                  <button type="button" className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-black text-slate-700">Bulk invite</button>
                  <Badge tone="blue">{initialState.seatUsage.used + state.invitedTeamMembers.length} seats planned</Badge>
                </div>
                <div className="grid gap-2">
                  {state.invitedTeamMembers.length ? state.invitedTeamMembers.map((invite, index) => (
                    <div key={`${invite.email}-${index}`} className="flex items-center justify-between rounded-xl border border-slate-200 p-3">
                      <div>
                        <p className="font-black text-slate-950">{invite.name || invite.email}</p>
                        <p className="text-sm text-slate-500">{invite.email} · {invite.role}</p>
                      </div>
                      <button type="button" onClick={() => update((draft) => ({ ...draft, invitedTeamMembers: draft.invitedTeamMembers.filter((_, itemIndex) => itemIndex !== index) }))} className="text-sm font-black text-rose-600">Remove</button>
                    </div>
                  )) : <p className="rounded-xl bg-slate-50 p-4 text-sm font-semibold text-slate-500">No team members drafted yet.</p>}
                </div>
              </div>
            ) : null}

            {step === 3 ? <SelectionGrid items={departments} selected={state.departments} onChange={(items) => update((draft) => ({ ...draft, departments: items }))} /> : null}

            {step === 4 ? (
              <div className="grid gap-5">
                <SelectionGrid items={categories} selected={state.approvalCategories} onChange={(items) => update((draft) => ({ ...draft, approvalCategories: items }))} />
                <div className="flex gap-2">
                  <input value={customCategory} onChange={(event) => setCustomCategory(event.target.value)} placeholder="Custom approval category" className="h-11 flex-1 rounded-xl border border-slate-200 px-4 text-sm font-bold outline-none focus:border-[#2155d9]" />
                  <button type="button" onClick={() => {
                    if (!customCategory.trim()) return;
                    update((draft) => ({ ...draft, approvalCategories: [...new Set([...draft.approvalCategories, customCategory.trim()])] }));
                    setCustomCategory('');
                  }} className="rounded-xl bg-[#2155d9] px-4 text-sm font-black text-white">Add</button>
                </div>
              </div>
            ) : null}

            {step === 5 ? (
              <div className="grid gap-3 md:grid-cols-2">
                {state.integrationSetup.map((integration) => (
                  <div key={integration.provider} className="rounded-2xl border border-slate-200 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-slate-950">{integration.provider}</p>
                        <p className="mt-1 text-sm text-slate-500">Customer IT/Admin owns OAuth connection.</p>
                      </div>
                      <Badge tone={integration.status === 'Connected' ? 'green' : integration.status === 'Requires Attention' ? 'amber' : 'slate'}>{integration.status}</Badge>
                    </div>
                    <div className="mt-4 grid grid-cols-3 gap-2">
                      {(['Connected', 'Skipped', 'Requires Attention'] as const).map((status) => (
                        <button key={status} type="button" onClick={() => update((draft) => ({ ...draft, integrationSetup: draft.integrationSetup.map((item) => item.provider === integration.provider ? { ...item, status } : item) }))} className="rounded-lg border border-slate-200 px-2 py-2 text-xs font-black text-slate-700 hover:bg-slate-50">{status}</button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {step === 6 ? (
              <div className="grid gap-4">
                <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
                  <p className="text-lg font-black text-slate-950">Upload policies and SOPs</p>
                  <p className="mt-2 text-sm text-slate-500">PDF, DOCX, TXT, and Markdown are supported. This wizard records readiness; use Playbook AI for full ingestion.</p>
                  <input
                    type="file"
                    multiple
                    accept=".pdf,.docx,.txt,.md,.markdown"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      update((draft) => ({
                        ...draft,
                        playbookSetup: [
                          ...draft.playbookSetup,
                          ...files.map((file, index) => ({
                            name: file.name,
                            category: playbookCategories[index % playbookCategories.length],
                            status: 'Ready' as const,
                            summary: 'Rules, approvers, thresholds, and policy summary queued for Playbook AI.',
                          })),
                        ],
                      }));
                    }}
                    className="mt-4"
                  />
                </div>
                <div className="grid gap-2">
                  {state.playbookSetup.map((playbook, index) => (
                    <div key={`${playbook.name}-${index}`} className="rounded-xl border border-slate-200 p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-black text-slate-950">{playbook.name}</p>
                          <p className="text-sm text-slate-500">{playbook.category}</p>
                        </div>
                        <Badge tone="green">{playbook.status}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">Playbook Readiness Score: {state.playbookSetup.length ? 82 : 0}%</div>
              </div>
            ) : null}

            {step === 7 ? (
              <div className="grid gap-5">
                <p className="text-sm leading-6 text-slate-600">Initialize baseline entities for departments, users, policies, and approval categories.</p>
                <div className="grid gap-3 md:grid-cols-4">
                  {['Departments', 'Users', 'Policies', 'Approval Categories'].map((item) => <div key={item} className="rounded-2xl border border-slate-200 p-4 text-sm font-black">{item}</div>)}
                </div>
                <button type="button" onClick={() => update((draft) => ({ ...draft, memoryGraphInitializedAt: draft.memoryGraphInitializedAt ?? new Date().toISOString() }))} className="w-fit rounded-xl bg-[#2155d9] px-5 py-3 text-sm font-black text-white">
                  Initialize Memory Graph
                </button>
                {state.memoryGraphInitializedAt ? <Badge tone="green">Memory Graph Ready</Badge> : null}
              </div>
            ) : null}

            {step === 8 ? (
              <div className="grid gap-5">
                <SelectionGrid items={['Approvals', 'Audit Logs', 'Playbooks', 'Investigations', 'Memory Graph', 'Executive Analytics']} selected={state.copilotSetup.dataSources} onChange={(items) => update((draft) => ({ ...draft, copilotSetup: { ...draft.copilotSetup, dataSources: items } }))} />
                <SelectionGrid items={['Org Admin', 'Compliance', 'Legal', 'Finance', 'Procurement', 'Viewer']} selected={state.copilotSetup.permissions} onChange={(items) => update((draft) => ({ ...draft, copilotSetup: { ...draft.copilotSetup, permissions: items } }))} />
                <SelectField label="Copilot Scope" value={state.copilotSetup.scope} onChange={(value) => update((draft) => ({ ...draft, copilotSetup: { ...draft.copilotSetup, scope: value } }))} options={['Workspace-wide with RBAC', 'Department scoped', 'Read-only analytics only']} />
                <div className="grid gap-2 md:grid-cols-2">
                  {sampleQuestions.map((question) => <div key={question} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-700">{question}</div>)}
                </div>
              </div>
            ) : null}

            {step === 9 ? (
              <div className="grid gap-3">
                <p className="text-5xl font-black text-slate-950">{readinessScore}/100</p>
                {[
                  ['Organization Configured', state.name && state.companyDomain],
                  ['Team Invited', state.invitedTeamMembers.length],
                  ['Departments Configured', state.departments.length],
                  ['Approval Categories Configured', state.approvalCategories.length],
                  ['Integrations Connected or Skipped', state.integrationSetup.every((item) => item.status === 'Connected' || item.status === 'Skipped')],
                  ['Playbooks Uploaded', state.playbookSetup.length],
                  ['Memory Graph Initialized', state.memoryGraphInitializedAt],
                  ['Copilot Ready', state.copilotSetup.scope],
                ].map(([label, ok]) => <div key={String(label)} className="flex items-center justify-between rounded-xl border border-slate-200 p-3"><span className="font-bold">{label}</span><Badge tone={ok ? 'green' : 'amber'}>{ok ? 'Ready' : 'Needs setup'}</Badge></div>)}
              </div>
            ) : null}

            {step === 10 ? (
              <div className="grid gap-6">
                <div className="rounded-3xl bg-[#07111f] p-8 text-white">
                  <p className="text-xs font-black uppercase tracking-[0.2em] text-blue-200">Workspace Ready</p>
                  <h2 className="mt-3 text-3xl font-black">Launch ApprovLine</h2>
                  <p className="mt-3 text-sm leading-6 text-slate-300">Your workspace is ready for approvals, investigations, Copilot, Playbook AI, Memory Graph, and Executive ROI.</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  {['Executive Dashboard', 'Investigation Center', 'AI Copilot', 'Playbook AI', 'Memory Graph', 'Integrations'].map((item) => <div key={item} className="rounded-2xl border border-slate-200 p-4 text-sm font-black">{item}</div>)}
                </div>
              </div>
            ) : null}
          </div>

          <footer className="flex flex-col-reverse justify-between gap-3 rounded-[24px] border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center">
            <button type="button" onClick={back} disabled={step === 1 || isPending} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-40">Back</button>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => save(step, currentKey)} disabled={isPending} className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 disabled:opacity-50">Save progress</button>
              {step < 10 ? (
                <button type="button" onClick={next} disabled={isPending} className="rounded-xl bg-[#2155d9] px-5 py-3 text-sm font-black text-white shadow-sm shadow-blue-200 disabled:opacity-50">Continue</button>
              ) : (
                <button type="button" onClick={() => save(10, 'go-live', true)} disabled={isPending} className="rounded-xl bg-[#2155d9] px-5 py-3 text-sm font-black text-white shadow-sm shadow-blue-200 disabled:opacity-50">Launch Workspace</button>
              )}
            </div>
          </footer>
        </section>
      </div>
    </main>
  );
}

function SelectionGrid({ items, selected, onChange }: { items: string[]; selected: string[]; onChange: (items: string[]) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {items.map((item) => {
        const active = selected.includes(item);
        return (
          <button
            key={item}
            type="button"
            onClick={() => onChange(active ? selected.filter((value) => value !== item) : [...selected, item])}
            className={`rounded-2xl border p-4 text-left text-sm font-black transition ${active ? 'border-[#2155d9] bg-blue-50 text-[#2155d9]' : 'border-slate-200 bg-white text-slate-800 hover:bg-slate-50'}`}
          >
            <span className="mr-2">{active ? '✓' : '○'}</span>
            {item}
          </button>
        );
      })}
    </div>
  );
}
