'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FounderDrawer } from './FounderDrawer';
import {
  DEMO_MODULES,
  DEMO_SCENARIOS,
  demoCompanySizes,
  demoIndustries,
  estimatedDataLines,
  fmtDateTime,
  fmtRelativeTime,
  modulesForScenario,
  type DemoCompanySize,
  type DemoIndustry,
  type DemoModuleKey,
  type DemoScenarioKey,
} from '@/lib/founder-demo-generator';
import { generateDemoWorkspace, previewDemoSampleData, resetDemoWorkspace, type GenerateDemoInput } from '@/app/founder/demo-generator/actions';
import type { DemoSamplePreview, DemoWorkspaceSummary } from '@/services/founderDemoGenerator';

export type WorkspaceRowClient = {
  id: string;
  name: string;
  slug: string;
  customerAccountId: string | null;
  domain: string | null;
  status: string | null;
  planTier: string | null;
  industry: string;
  companySize: string;
  createdAt: string;
  updatedAt: string;
  approvals: number;
  investigations: number;
  memoryEntities: number;
  integrations: number;
};

export type RunRowClient = {
  id: string;
  createdAt: string;
  action: string;
  scenarioTitle: string;
  actorEmail: string | null;
  organizationName: string | null;
  customerAccountId: string | null;
};

type Props =
  | { state: 'error'; safeError: string }
  | {
      state: 'ok';
      workspaces: WorkspaceRowClient[];
      recentRuns: RunRowClient[];
      lastGeneratedAt: string | null;
    };

function Badge({ tone, children }: { tone: 'green' | 'amber' | 'red' | 'slate' | 'blue'; children: React.ReactNode }) {
  const classes = {
    slate: 'border-slate-200 bg-slate-50 text-slate-700',
    green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    amber: 'border-amber-200 bg-amber-50 text-amber-700',
    red: 'border-rose-200 bg-rose-50 text-rose-700',
    blue: 'border-blue-200 bg-blue-50 text-blue-700',
  }[tone];
  return (
    <span className={`inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-[10px] font-black uppercase leading-tight tracking-wide ${classes}`}>
      {children}
    </span>
  );
}

function statusTone(status: string | null): 'green' | 'amber' | 'red' | 'slate' {
  if (status === 'ACTIVE') return 'green';
  if (status === 'TRIAL') return 'blue' as never;
  if (status === 'SUSPENDED' || status === 'CHURNED') return 'red';
  return 'slate';
}

// Minimal inline stroke icons matching this console's existing icon
// language (thin strokes, rounded caps — see FounderNavClient.tsx's own
// hamburger/search/close icons). No icon library is introduced.
function ScenarioIcon({ scenario }: { scenario: DemoScenarioKey }) {
  const common = { width: 20, height: 20, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
  if (scenario === 'enterprise-sales') {
    return (
      <svg {...common}>
        <rect x="4" y="3" width="10" height="18" rx="1" />
        <path d="M14 21V8l6 3v10" />
        <path d="M7.5 7h1M7.5 10.5h1M7.5 14h1M11 7h1M11 10.5h1M11 14h1" />
      </svg>
    );
  }
  if (scenario === 'compliance-audit') {
    return (
      <svg {...common}>
        <rect x="6" y="4" width="12" height="17" rx="1.5" />
        <path d="M9 4V3.5A1.5 1.5 0 0 1 10.5 2h3A1.5 1.5 0 0 1 15 3.5V4" />
        <path d="M9 12.5l2 2 4-4.5" />
      </svg>
    );
  }
  if (scenario === 'security-governance') {
    return (
      <svg {...common}>
        <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3z" />
        <path d="M9.5 12l1.8 1.8L15 10" />
      </svg>
    );
  }
  return (
    <svg {...common}>
      <path d="M4 7h9M4 12h5M4 17h9" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="12" cy="17" r="2" />
    </svg>
  );
}

const STEPS = ['Choose Scenario', 'Customer Setup', 'Select Modules', 'Preview & Generate'];

function StepProgress({ completed, activeIndex }: { completed: boolean[]; activeIndex: number }) {
  return (
    <div className="flex items-start">
      {STEPS.map((label, index) => {
        const isDone = completed[index];
        const isActive = index === activeIndex;
        return (
          <div key={label} className={`flex items-center ${index < STEPS.length - 1 ? 'flex-1' : ''}`}>
            <div className="flex flex-col items-center gap-2 text-center">
              <div
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${
                  isDone
                    ? 'bg-[#2557dc] text-white'
                    : isActive
                      ? 'border-2 border-[#2557dc] bg-white text-[#2557dc]'
                      : 'border-2 border-slate-200 bg-white text-slate-400'
                }`}
                aria-current={isActive ? 'step' : undefined}
              >
                {isDone ? (
                  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  index + 1
                )}
              </div>
              <div className="hidden sm:block">
                <p className={`text-[11px] font-black uppercase tracking-wide ${isActive ? 'text-[#2557dc]' : isDone ? 'text-slate-700' : 'text-slate-400'}`}>{index + 1}</p>
                <p className={`text-xs font-bold ${isActive || isDone ? 'text-slate-900' : 'text-slate-400'}`}>{label}</p>
              </div>
            </div>
            {index < STEPS.length - 1 ? <div className={`mx-2 mt-[18px] h-0.5 flex-1 ${completed[index + 1] || isDone ? 'bg-[#2557dc]' : 'bg-slate-200'}`} aria-hidden="true" /> : null}
          </div>
        );
      })}
    </div>
  );
}

export function DemoGeneratorClient(props: Props) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const [pending, startTransition] = useTransition();

  const [scenario, setScenario] = useState<DemoScenarioKey>('enterprise-sales');
  const [modules, setModules] = useState<Set<DemoModuleKey>>(new Set(modulesForScenario('enterprise-sales')));

  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>(props.state === 'ok' && props.workspaces.length > 0 ? 'existing' : 'new');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(props.state === 'ok' ? (props.workspaces[0]?.id ?? null) : null);

  const [newIndustry, setNewIndustry] = useState<DemoIndustry>(demoIndustries[0]);
  const [newCompanySize, setNewCompanySize] = useState<DemoCompanySize>(demoCompanySizes[1]);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newDomain, setNewDomain] = useState('');
  const [newAdminEmail, setNewAdminEmail] = useState('');

  const [rightTab, setRightTab] = useState<'overview' | 'recent-runs' | 'help'>('overview');
  const [resetTarget, setResetTarget] = useState<WorkspaceRowClient | null>(null);
  const [resetConfirmText, setResetConfirmText] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);

  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<DemoSamplePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generateResult, setGenerateResult] = useState<DemoWorkspaceSummary | null>(null);

  const workspaces = props.state === 'ok' ? props.workspaces : [];
  const selectedWorkspace = workspaces.find((w) => w.id === selectedWorkspaceId) ?? null;
  const currentWorkspace = selectedWorkspace ?? workspaces[0] ?? null;

  function refresh() {
    if (refreshing) return;
    startRefresh(() => router.refresh());
  }

  function applyScenario(key: DemoScenarioKey) {
    setScenario(key);
    if (key !== 'custom') setModules(new Set(modulesForScenario(key)));
  }

  function toggleModule(key: DemoModuleKey) {
    setModules((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setScenario('custom');
  }

  function selectAllModules() {
    setModules(new Set(DEMO_MODULES.map((m) => m.key)));
    setScenario('custom');
  }

  const effectiveIndustry: DemoIndustry = customerMode === 'existing' && currentWorkspace ? (currentWorkspace.industry as DemoIndustry) : newIndustry;
  const effectiveCompanySize: DemoCompanySize = customerMode === 'existing' && currentWorkspace ? (currentWorkspace.companySize as DemoCompanySize) : newCompanySize;

  const customerSetupComplete = customerMode === 'existing' ? Boolean(currentWorkspace) : newCompanyName.trim().length > 0 || newIndustry.length > 0;
  const stepsCompleted = [Boolean(scenario), customerSetupComplete, modules.size > 0, false];
  const activeStepIndex = !stepsCompleted[0] ? 0 : !stepsCompleted[1] ? 1 : !stepsCompleted[2] ? 2 : 3;

  const estimatedLines = useMemo(() => estimatedDataLines(Array.from(modules), effectiveCompanySize), [modules, effectiveCompanySize]);

  function buildGenerationInput(): GenerateDemoInput {
    return {
      industry: effectiveIndustry,
      companySize: effectiveCompanySize,
      modules: Array.from(modules),
      scenario,
      companyName: customerMode === 'new' ? newCompanyName : undefined,
      domain: customerMode === 'new' ? newDomain : undefined,
      primaryAdminEmail: customerMode === 'new' ? newAdminEmail : undefined,
    };
  }

  function handleGenerate() {
    if (pending || modules.size === 0) return;
    setGenerateError(null);
    setGenerateResult(null);
    startTransition(async () => {
      const result = await generateDemoWorkspace(buildGenerationInput());
      if (!result.ok) {
        setGenerateError(result.error);
        return;
      }
      setGenerateResult(result.data);
      setSelectedWorkspaceId(result.data.organizationId);
      setCustomerMode('existing');
      router.refresh();
    });
  }

  function openResetConfirm(workspace: WorkspaceRowClient) {
    setResetTarget(workspace);
    setResetConfirmText('');
    setResetError(null);
  }

  function handleReset() {
    if (!resetTarget || pending) return;
    if (resetConfirmText.trim() !== resetTarget.name) {
      setResetError('Type the exact workspace name to confirm.');
      return;
    }
    setResetError(null);
    startTransition(async () => {
      const result = await resetDemoWorkspace(resetTarget.id);
      if (!result.ok) {
        setResetError(result.error);
        return;
      }
      setResetTarget(null);
      if (selectedWorkspaceId === resetTarget.id) setSelectedWorkspaceId(null);
      router.refresh();
    });
  }

  function openPreview() {
    setPreviewOpen(true);
    setPreviewError(null);
    setPreviewData(null);
    setPreviewLoading(true);
    previewDemoSampleData({
      industry: effectiveIndustry,
      companySize: effectiveCompanySize,
      companyName: customerMode === 'new' ? newCompanyName : undefined,
      domain: customerMode === 'new' ? newDomain : undefined,
    }).then((result) => {
      setPreviewLoading(false);
      if (result.ok) setPreviewData(result.data);
      else setPreviewError(result.error);
    });
  }

  if (props.state === 'error') {
    return (
      <div className="space-y-4">
        <HeroHeader lastGeneratedAt={null} refreshing={refreshing} onRefresh={refresh} />
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-5">
          <p className="text-sm font-black text-rose-900">Demo Generator could not load.</p>
          <p className="mt-1 text-xs font-semibold text-rose-700">Try again. Safe diagnostic: {props.safeError}</p>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <HeroHeader lastGeneratedAt={props.lastGeneratedAt} refreshing={refreshing} onRefresh={refresh} />

      {generateResult ? (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm font-black text-emerald-900">Demo environment generated successfully.</p>
          <p className="mt-1 text-xs font-semibold text-emerald-800">
            {generateResult.workspaceName} — {generateResult.stats.approvals} approvals, {generateResult.stats.integrations} integrations.
          </p>
          {generateResult.customerAccountId ? (
            <Link href={`/founder/customers/${generateResult.customerAccountId}`} className="mt-3 inline-flex items-center text-xs font-black text-emerald-900 hover:underline">
              View Demo Customer →
            </Link>
          ) : null}
        </section>
      ) : null}
      {generateError ? (
        <section className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
          <p className="text-sm font-black text-rose-900">Demo generation could not be completed.</p>
          <p className="mt-1 text-xs font-semibold text-rose-700">{generateError}</p>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-5 xl:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <section className="rounded-2xl border border-slate-200 bg-white px-6 py-4 shadow-sm">
            <StepProgress completed={stepsCompleted} activeIndex={activeStepIndex} />
          </section>

          {/* Section 1 — Choose Scenario */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">1. Choose Demo Scenario</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Select a pre-configured scenario or customize your own.</p>
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {DEMO_SCENARIOS.map((s) => {
                const active = scenario === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => applyScenario(s.key)}
                    aria-pressed={active}
                    className={`relative flex h-full w-full min-w-0 flex-col items-center justify-start gap-0 whitespace-normal rounded-xl border border-solid p-4 text-center normal-case transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] ${
                      active ? 'border-[#2557dc] bg-blue-50/60 ring-1 ring-[#2557dc]' : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    {active ? (
                      <span className="absolute right-3 top-3 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#2557dc] text-white" aria-hidden="true">
                        <svg width="11" height="11" viewBox="0 0 16 16" fill="none">
                          <path d="M3.5 8.5L6.5 11.5L12.5 4.5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                    ) : null}
                    <span className={`shrink-0 ${active ? 'text-[#2557dc]' : 'text-slate-500'}`}>
                      <ScenarioIcon scenario={s.key} />
                    </span>
                    <p className="mt-2 w-full min-w-0 whitespace-normal break-words text-sm font-black text-slate-950">{s.title}</p>
                    <p className="mt-1.5 w-full min-w-0 flex-1 whitespace-normal break-words text-xs font-semibold leading-5 text-slate-500">{s.description}</p>
                    {s.recommended ? (
                      <span className="mt-3 inline-flex w-fit shrink-0 items-center rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-bold normal-case text-blue-700">
                        Recommended
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Section 2 — Customer Setup */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">2. Customer Setup</p>
            <div className="mt-3 flex flex-wrap gap-1 border-b border-slate-200" role="tablist" aria-label="Customer setup mode">
              <button
                type="button"
                role="tab"
                aria-selected={customerMode === 'existing'}
                onClick={() => setCustomerMode('existing')}
                className={`whitespace-normal border-b-2 px-3 py-2 text-left text-sm font-black transition ${customerMode === 'existing' ? 'border-[#2557dc] text-[#2557dc]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Use Existing Demo Customer
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={customerMode === 'new'}
                onClick={() => setCustomerMode('new')}
                className={`whitespace-normal border-b-2 px-3 py-2 text-left text-sm font-black transition ${customerMode === 'new' ? 'border-[#2557dc] text-[#2557dc]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
              >
                Create New Demo Customer
              </button>
            </div>

            {customerMode === 'existing' ? (
              workspaces.length === 0 ? (
                <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-5 text-center">
                  <p className="text-sm font-black text-slate-700">No demo customers available</p>
                  <p className="mt-1 text-xs font-semibold text-slate-500">Create a demo customer to begin.</p>
                </div>
              ) : (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                    Demo customer
                    <select
                      value={selectedWorkspaceId ?? ''}
                      onChange={(e) => setSelectedWorkspaceId(e.target.value)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                    >
                      {workspaces.map((w) => (
                        <option key={w.id} value={w.id}>
                          {w.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  {currentWorkspace ? (
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-black text-slate-950">{currentWorkspace.name}</p>
                        <Badge tone="blue">DEMO</Badge>
                      </div>
                      <p className="mt-0.5 text-xs font-semibold text-slate-500">{currentWorkspace.domain ?? '—'}</p>
                      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <Field label="Industry" value={currentWorkspace.industry} />
                        <Field label="Plan" value={currentWorkspace.planTier ?? '—'} />
                        <Field label="Created" value={fmtDateTime(currentWorkspace.createdAt)} />
                        <Field label="Status" value={currentWorkspace.status ?? '—'} statusDot />
                      </div>
                      <p className="mt-3 text-[11px] font-semibold text-amber-700">
                        Generating will replace this demo customer&rsquo;s existing demo data with the selected scenario and modules.
                      </p>
                    </div>
                  ) : null}
                </div>
              )
            ) : (
              <div className="mt-4 space-y-3">
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
                  <p className="text-[11px] font-black uppercase tracking-wide text-blue-700">Demo Environment</p>
                  <p className="mt-0.5 text-xs font-semibold text-blue-800">This customer will contain demo data only.</p>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                    Company name
                    <input
                      value={newCompanyName}
                      onChange={(e) => setNewCompanyName(e.target.value)}
                      placeholder="Acme Corporation"
                      maxLength={120}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                    Domain (optional)
                    <input
                      value={newDomain}
                      onChange={(e) => setNewDomain(e.target.value)}
                      placeholder="acme-demo.example"
                      maxLength={253}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                    Industry
                    <select
                      value={newIndustry}
                      onChange={(e) => setNewIndustry(e.target.value as DemoIndustry)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                    >
                      {demoIndustries.map((i) => (
                        <option key={i} value={i}>
                          {i}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
                    Company size (sets plan)
                    <select
                      value={newCompanySize}
                      onChange={(e) => setNewCompanySize(e.target.value as DemoCompanySize)}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                    >
                      {demoCompanySizes.map((size) => (
                        <option key={size} value={size}>
                          {size}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-xs font-black uppercase tracking-wide text-slate-500 sm:col-span-2">
                    Primary admin email (optional)
                    <input
                      type="email"
                      value={newAdminEmail}
                      onChange={(e) => setNewAdminEmail(e.target.value)}
                      placeholder={`admin@${newDomain || 'example.demo'}`}
                      maxLength={254}
                      className="mt-1.5 h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-[#2557dc] focus:ring-2 focus:ring-blue-100"
                    />
                  </label>
                </div>
              </div>
            )}
          </section>

          {/* Section 3 — Select Data Modules */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">3. Select Data Modules</p>
                <p className="mt-1 text-sm font-semibold text-slate-500">Choose which modules to populate with demo data.</p>
              </div>
              <button type="button" onClick={selectAllModules} className="text-xs font-black text-[#2557dc] hover:underline">
                Select all
              </button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {DEMO_MODULES.map((m) => {
                const checked = modules.has(m.key);
                return (
                  <label
                    key={m.key}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${checked ? 'border-[#2557dc] bg-blue-50/50' : 'border-slate-200 bg-white hover:border-slate-300'}`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleModule(m.key)}
                      className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-[#2557dc] focus:ring-2 focus:ring-blue-200"
                    />
                    <span>
                      <span className="block font-black text-slate-950">{m.title}</span>
                      <span className="mt-0.5 block text-xs font-semibold text-slate-500">{m.description}</span>
                    </span>
                  </label>
                );
              })}
            </div>
          </section>

          {/* Section 4 — Preview & Generate */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#2557dc]">4. Preview & Generate</p>
            <p className="mt-1 text-sm font-semibold text-slate-500">Review your configuration and generate the demo data.</p>
            <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="rounded-xl border border-slate-200 p-3.5">
                <p className="text-xs font-black uppercase tracking-wide text-slate-400">Demo Configuration Summary</p>
                <dl className="mt-3 space-y-2 text-sm">
                  <SummaryRow label="Scenario" value={DEMO_SCENARIOS.find((s) => s.key === scenario)?.title ?? '—'} />
                  <SummaryRow label="Customer" value={customerMode === 'existing' ? (currentWorkspace?.name ?? '—') : newCompanyName.trim() || 'New demo customer'} />
                  <SummaryRow label="Modules" value={`${modules.size} selected`} />
                  <div>
                    <dt className="text-xs font-bold text-slate-500">Estimated data</dt>
                    <dd className="mt-1 space-y-0.5">
                      {estimatedLines.map((line) => (
                        <p key={line} className="text-xs font-semibold text-slate-700">{line}</p>
                      ))}
                    </dd>
                  </div>
                </dl>
              </div>
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-blue-700">
                  <span aria-hidden="true">ⓘ</span> Demo Data Safety
                </p>
                <ul className="mt-3 space-y-2 text-xs font-semibold leading-5 text-blue-900">
                  <li>• All generated data will be clearly marked as DEMO.</li>
                  <li>• No real customer data will be modified.</li>
                  <li>• Demo data can be safely reset at any time.</li>
                  <li>• All actions are logged in Founder Audit Logs.</li>
                </ul>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={pending || modules.size === 0}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-normal rounded-xl bg-[#2557dc] px-5 py-3 text-sm font-black text-white shadow-sm transition hover:bg-blue-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:bg-slate-300"
              >
                {pending ? 'Generating…' : 'Generate Demo Environment →'}
              </button>
              <button
                type="button"
                onClick={openPreview}
                className="inline-flex min-w-0 flex-1 items-center justify-center gap-2 whitespace-normal rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-black text-slate-700 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc]"
              >
                Preview Sample Data
              </button>
            </div>
          </section>
        </div>

        {/* Right command panel */}
        <aside className="space-y-0">
          <div className="sticky top-20 rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-3.5">
              <h3 className="text-base font-black text-slate-950">Demo Generator</h3>
              <p className="mt-0.5 text-xs font-semibold text-slate-500">Create and manage demo environments.</p>
            </div>
            <div className="flex border-b border-slate-100 px-2" role="tablist" aria-label="Demo Generator panel">
              {(['overview', 'recent-runs', 'help'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={rightTab === tab}
                  onClick={() => setRightTab(tab)}
                  className={`whitespace-normal border-b-2 px-3 py-2 text-xs font-black capitalize transition ${rightTab === tab ? 'border-[#2557dc] text-[#2557dc]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                >
                  {tab === 'recent-runs' ? 'Recent Runs' : tab === 'overview' ? 'Overview' : 'Help'}
                </button>
              ))}
            </div>

            <div className="p-4">
              {rightTab === 'overview' ? (
                <div className="space-y-5">
                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Quick Actions</p>
                    <div className="mt-3 space-y-2">
                      <button
                        type="button"
                        onClick={handleGenerate}
                        disabled={pending || modules.size === 0}
                        className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl bg-[#2557dc] px-4 py-3 text-left text-sm font-black text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                      >
                        Generate New Demo <span aria-hidden="true">→</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => currentWorkspace && openResetConfirm(currentWorkspace)}
                        disabled={!currentWorkspace}
                        className="flex w-full items-center justify-between gap-2 whitespace-normal rounded-xl border border-rose-200 bg-white px-4 py-3 text-left text-sm font-black text-rose-700 transition hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        Reset Demo Data <span aria-hidden="true">→</span>
                      </button>
                      {currentWorkspace?.customerAccountId ? (
                        <Link
                          href={`/founder/customers/${currentWorkspace.customerAccountId}`}
                          className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50"
                        >
                          View Demo Customer <span aria-hidden="true">→</span>
                        </Link>
                      ) : null}
                      <a
                        href="/founder/demo-generator"
                        target="_blank"
                        rel="noreferrer"
                        className="flex w-full items-center justify-between rounded-xl border border-slate-200 bg-white px-4 py-3 text-left text-sm font-black text-slate-700 transition hover:bg-slate-50"
                      >
                        Open in New Tab <span aria-hidden="true">↗</span>
                      </a>
                    </div>
                  </div>

                  <div>
                    <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Current Demo Customer</p>
                    {currentWorkspace ? (
                      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-black text-slate-950">{currentWorkspace.name}</p>
                          <Badge tone="blue">DEMO</Badge>
                        </div>
                        <p className="mt-0.5 truncate text-xs font-semibold text-slate-500">{currentWorkspace.domain ?? '—'}</p>
                        <div className="mt-3 grid grid-cols-2 gap-3">
                          <Field label="Industry" value={currentWorkspace.industry} />
                          <Field label="Plan" value={currentWorkspace.planTier ?? '—'} />
                          <Field label="Status" value={currentWorkspace.status ?? '—'} statusDot />
                          <Field label="Created" value={fmtDateTime(currentWorkspace.createdAt)} />
                        </div>
                        {currentWorkspace.customerAccountId ? (
                          <Link href={`/founder/customers/${currentWorkspace.customerAccountId}`} className="mt-3 block text-center text-xs font-black text-[#2557dc] hover:underline">
                            View Customer 360 →
                          </Link>
                        ) : null}
                      </div>
                    ) : (
                      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-3.5 text-center">
                        <p className="text-xs font-bold text-slate-600">No demo customers yet.</p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">Create a demo environment to begin.</p>
                      </div>
                    )}
                  </div>

                  <div>
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Recent Runs</p>
                      {props.recentRuns.length > 0 ? (
                        <button type="button" onClick={() => setRightTab('recent-runs')} className="text-[11px] font-black text-[#2557dc] hover:underline">
                          View all →
                        </button>
                      ) : null}
                    </div>
                    <RecentRunsList runs={props.recentRuns.slice(0, 4)} />
                  </div>
                </div>
              ) : rightTab === 'recent-runs' ? (
                <div>
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Recent Runs</p>
                  <RecentRunsList runs={props.recentRuns} />
                </div>
              ) : (
                <HelpTabContent />
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* Existing demo workspaces management (Reset per workspace) */}
      {workspaces.length > 0 ? (
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">Demo Workspaces</p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] table-fixed text-left text-sm">
              <thead className="bg-slate-50 text-xs font-black uppercase tracking-wide text-slate-500">
                <tr>
                  <th scope="col" className="w-1/3 px-4 py-3">Workspace</th>
                  <th scope="col" className="px-4 py-3">Industry</th>
                  <th scope="col" className="px-4 py-3">Plan</th>
                  <th scope="col" className="px-4 py-3">Status</th>
                  <th scope="col" className="w-28 px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {workspaces.map((w) => (
                  <tr key={w.id}>
                    <td className="truncate px-4 py-3 font-black text-slate-950" title={w.name}>{w.name}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{w.industry}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{w.planTier ?? '—'}</td>
                    <td className="px-4 py-3"><Badge tone={statusTone(w.status)}>{w.status ?? 'Unknown'}</Badge></td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" onClick={() => openResetConfirm(w)} className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-50">
                        Reset
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {/* Reset confirmation drawer */}
      {resetTarget ? (
        <FounderDrawer onClose={() => setResetTarget(null)} titleId="reset-demo-title" descriptionId="reset-demo-description" size="sm">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <h3 id="reset-demo-title" className="text-lg font-black text-slate-950">Reset demo data?</h3>
            <button type="button" onClick={() => setResetTarget(null)} aria-label="Close reset confirmation" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-4 px-6 py-5">
            <p id="reset-demo-description" className="text-sm font-semibold leading-6 text-slate-700">
              This will permanently remove generated demo records for <span className="font-black text-slate-950">{resetTarget.name}</span>. Real customer data will not be affected.
            </p>
            <label className="block text-xs font-black uppercase tracking-wide text-slate-500">
              Type <span className="font-mono normal-case text-slate-700">{resetTarget.name}</span> to confirm
              <input
                value={resetConfirmText}
                onChange={(e) => setResetConfirmText(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800 outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100"
                autoFocus
              />
            </label>
            {resetError ? <p className="text-xs font-bold text-rose-700">{resetError}</p> : null}
          </div>
          <div className="flex gap-3 border-t border-slate-100 px-6 py-5">
            <button type="button" onClick={() => setResetTarget(null)} className="min-w-0 flex-1 whitespace-normal rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-black text-slate-700 hover:bg-slate-50">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleReset}
              disabled={pending || resetConfirmText.trim() !== resetTarget.name}
              className="min-w-0 flex-1 whitespace-normal rounded-xl bg-rose-600 px-4 py-3 text-sm font-black text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {pending ? 'Resetting…' : 'Reset Demo Data'}
            </button>
          </div>
        </FounderDrawer>
      ) : null}

      {/* Preview sample data drawer */}
      {previewOpen ? (
        <FounderDrawer onClose={() => setPreviewOpen(false)} titleId="preview-demo-title" size="md">
          <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-6 py-5">
            <h3 id="preview-demo-title" className="text-lg font-black text-slate-950">Preview Sample Data</h3>
            <button type="button" onClick={() => setPreviewOpen(false)} aria-label="Close sample data preview" className="rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-50">
              Close
            </button>
          </div>
          <div className="flex-1 space-y-4 px-6 py-5">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">Example only — nothing has been generated yet.</p>
            {previewLoading ? <p className="text-sm font-semibold text-slate-500">Loading preview…</p> : null}
            {previewError ? <p className="text-sm font-bold text-rose-700">{previewError}</p> : null}
            {previewData ? (
              <div className="space-y-4">
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Customer</p>
                  <p className="mt-1 font-black text-slate-950">{previewData.companyName}</p>
                  <p className="text-xs font-semibold text-slate-500">{previewData.domain}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Sample vendors</p>
                  <p className="mt-1 text-sm font-semibold text-slate-700">{previewData.vendors.slice(0, 5).join(', ')}</p>
                </div>
                <div className="rounded-xl border border-slate-200 p-4">
                  <p className="text-xs font-black uppercase tracking-wide text-slate-400">Sample approval subjects</p>
                  <ul className="mt-2 space-y-1.5">
                    {previewData.sampleApprovalSubjects.map((subject) => (
                      <li key={subject} className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700">{subject}</li>
                    ))}
                  </ul>
                </div>
              </div>
            ) : null}
          </div>
        </FounderDrawer>
      ) : null}
    </div>
  );
}

function HeroHeader({ lastGeneratedAt, refreshing, onRefresh }: { lastGeneratedAt: string | null; refreshing: boolean; onRefresh: () => void }) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white px-6 py-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#2557dc]">Internal Tools</p>
          <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Demo Generator</h2>
          <p className="mt-1 max-w-2xl text-sm font-semibold leading-6 text-slate-600">
            Create realistic demo environments with sample data for sales, pilots, and product demonstrations.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <p className="text-right text-xs font-bold text-slate-500">
            Last generated<br />
            <span className="text-sm text-slate-700">{lastGeneratedAt ? fmtDateTime(lastGeneratedAt) : 'Never generated'}</span>
          </p>
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            aria-busy={refreshing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2557dc] focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span aria-hidden="true" className={refreshing ? 'inline-block animate-spin' : 'inline-block'}>↻</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>
      </div>
    </section>
  );
}

function Field({ label, value, statusDot }: { label: string; value: string; statusDot?: boolean }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 flex items-center gap-1.5 text-xs font-bold text-slate-800">
        {statusDot ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> : null}
        {value}
      </p>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-xs font-bold text-slate-500">{label}</dt>
      <dd className="truncate text-xs font-black text-slate-900">{value}</dd>
    </div>
  );
}

function RecentRunsList({ runs }: { runs: RunRowClient[] }) {
  if (runs.length === 0) {
    return (
      <div className="mt-3 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
        <p className="text-xs font-bold text-slate-600">No demo runs yet.</p>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">Your first generated demo will appear here.</p>
      </div>
    );
  }
  return (
    <ul className="mt-3 space-y-2">
      {runs.map((run) => (
        <li key={run.id} className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-900">{run.scenarioTitle}</p>
            <p className="text-[11px] font-semibold text-slate-500" title={fmtDateTime(run.createdAt)}>{fmtRelativeTime(run.createdAt)}</p>
          </div>
          <Badge tone={run.action === 'FOUNDER_DEMO_WORKSPACE_DELETED' ? 'slate' : 'green'}>
            {run.action === 'FOUNDER_DEMO_WORKSPACE_DELETED' ? 'Reset' : 'Success'}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

function HelpTabContent() {
  return (
    <div className="space-y-5 text-xs font-semibold leading-5 text-slate-600">
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">What Demo Generator does</p>
        <p className="mt-1.5">Creates a complete, isolated demo customer (its own organization and account) seeded with realistic sample data for sales calls, pilots, and product walkthroughs.</p>
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">What DEMO means</p>
        <p className="mt-1.5">Every generated organization&rsquo;s identifier starts with <span className="font-mono">founder-demo-</span>, which every generation and reset action independently checks server-side before touching any data.</p>
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">How demo data is isolated</p>
        <p className="mt-1.5">Demo data lives in its own organization, entirely separate from any real customer&rsquo;s data. Generating or resetting a demo workspace can never modify a real customer.</p>
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">How reset works</p>
        <p className="mt-1.5">Reset permanently deletes the demo organization and everything in it. Regenerating the same profile automatically resets it first.</p>
      </div>
      <div>
        <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">Audit logging</p>
        <p className="mt-1.5">Every generation and reset is recorded in Founder Audit Logs with the actor, scenario, and modules involved.</p>
      </div>
    </div>
  );
}
