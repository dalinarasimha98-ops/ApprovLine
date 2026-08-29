'use client';

import { useState, useMemo, useRef } from 'react';
import {
  Upload, Sparkles, FileText, Shield, AlertTriangle, TrendingUp, X,
  Brain, CheckCircle2, Clock, ChevronRight, RotateCcw, Info,
} from 'lucide-react';
import { PendingLink } from '@/components/system/PendingLink';

// ─── Types ─────────────────────────────────────────────────────────────────

type PlaybookDocument = {
  id: string;
  name: string;
  fileType: string;
  status: string;
  uploadedAt: string | Date;
  lastIndexedAt: string | Date | null;
  metadata: unknown;
  ownerUserId?: string | null;
  _count: { chunks: number; rules: number };
};

type PlaybookQuery = {
  id: string;
  question: string;
  answer: unknown;
  confidence: number;
  createdAt: string | Date;
  actorUserId?: string | null;
};

type AdvisoryAnswer = {
  answer: string;
  requiredApprovers: string[];
  requiredDepartments: string[];
  policySections: Array<{ document: string; section: string; excerpt: string }>;
  evidenceMissing: string[];
  compliant: 'yes' | 'no' | 'needs_review';
  confidence: number;
};

type ActiveAdvisory = AdvisoryAnswer & { queryId: string; question: string };

type ComplianceInsights = {
  ruleCount: number;
  evaluationCount: number;
  averageScore: number;
  compliant: number;
  partial: number;
  nonCompliant: number;
  mostViolatedPolicies: Array<{ name: string; count: number }>;
  departmentsWithHighestViolations: Array<{ name: string; count: number }>;
  riskTrend: Array<{ name: string; count: number }>;
  recentEvaluations: Array<{
    id: string;
    status: string;
    score: number;
    severity: string;
    missingApprovers: string[];
    missingDepartments: string[];
    missingEvidence: string[];
    triggeredRule: string | null;
    explanation: string;
    approvalRecord: {
      id: string;
      subject: string;
      department: string | null;
      approverName: string | null;
      sourcePlatform: string | null;
      riskLevel: string | null;
    };
  }>;
} | null;

// ─── Helpers ────────────────────────────────────────────────────────────────

const CATEGORIES = ['Legal', 'Procurement', 'Finance', 'Security', 'Compliance', 'HR', 'Engineering', 'Operations'];

const SUGGESTIONS = [
  'Vendor onboarding > $50k',
  'Marketing Budget Approval',
  'New Tool Procurement',
  'Contract Renewal',
  'Employee Hiring',
];

function parseAdvisoryAnswer(raw: unknown): AdvisoryAnswer | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.answer !== 'string') return null;
  return {
    answer: obj.answer,
    requiredApprovers: Array.isArray(obj.requiredApprovers) ? (obj.requiredApprovers as string[]) : [],
    requiredDepartments: Array.isArray(obj.requiredDepartments) ? (obj.requiredDepartments as string[]) : [],
    policySections: Array.isArray(obj.policySections) ? (obj.policySections as AdvisoryAnswer['policySections']) : [],
    evidenceMissing: Array.isArray(obj.evidenceMissing) ? (obj.evidenceMissing as string[]) : [],
    compliant: (obj.compliant === 'yes' || obj.compliant === 'no' || obj.compliant === 'needs_review')
      ? obj.compliant : 'needs_review',
    confidence: typeof obj.confidence === 'number' ? obj.confidence : 0,
  };
}

function buildApprovalPath(advisory: AdvisoryAnswer): Array<{ label: string; detail: string }> {
  const steps: Array<{ label: string; detail: string }> = [
    { label: 'Submit Request', detail: 'Provide request details, use case and cost estimate.' },
  ];
  const seen = new Set<string>();
  for (const dept of advisory.requiredDepartments) {
    const key = dept.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      steps.push({ label: `${dept} Approval`, detail: `Requires approval from ${dept}.` });
    }
  }
  for (const approver of advisory.requiredApprovers) {
    const key = approver.toLowerCase();
    if (!seen.has(key)) {
      const alreadyCoveredByDept = advisory.requiredDepartments.some(
        (d) => approver.toLowerCase().includes(d.toLowerCase()) || d.toLowerCase().includes(approver.toLowerCase()),
      );
      if (!alreadyCoveredByDept) {
        seen.add(key);
        steps.push({ label: approver, detail: `Approval from ${approver} required.` });
      }
    }
  }
  if (steps.length > 2) {
    steps.push({ label: 'Final Approval', detail: 'Final sign-off before execution.' });
  }
  return steps;
}

function docCategory(metadata: unknown): string {
  if (!metadata || typeof metadata !== 'object') return 'General';
  const m = metadata as Record<string, unknown>;
  return typeof m.category === 'string' && m.category ? m.category : 'General';
}

function isDemo(metadata: unknown) {
  return Boolean(metadata && typeof metadata === 'object' && 'demo' in metadata && (metadata as { demo?: unknown }).demo);
}

function fmtDate(d: string | Date | null | undefined) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtTime(d: string | Date) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function complianceColor(score: number) {
  if (score >= 80) return 'text-emerald-400';
  if (score >= 60) return 'text-amber-400';
  return 'text-rose-400';
}

function complianceBg(score: number) {
  if (score >= 80) return 'bg-emerald-500';
  if (score >= 60) return 'bg-amber-500';
  return 'bg-rose-500';
}

function statusBadge(status: string) {
  if (status === 'READY') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  if (status === 'ERROR') return 'bg-rose-500/10 text-rose-400 border-rose-500/20';
  return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
}

function statusLabel(status: string) {
  if (status === 'READY') return 'Active';
  if (status === 'ERROR') return 'Error';
  if (status === 'INDEXING') return 'Indexing';
  return 'Processing';
}

function likelihoodLabel(confidence: number) {
  if (confidence >= 80) return 'High probability of approval';
  if (confidence >= 60) return 'Moderate probability of approval';
  if (confidence >= 40) return 'Review required before approval';
  return 'Low probability of approval';
}

function complianceLabel(compliant: string) {
  if (compliant === 'yes') return { label: 'Compliant', cls: 'text-emerald-400' };
  if (compliant === 'no') return { label: 'Non-compliant', cls: 'text-rose-400' };
  return { label: 'Needs review', cls: 'text-amber-400' };
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function StatTile({
  label,
  value,
  sub,
  trend,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  trend?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-2xl border border-[#1E2D4A] bg-[#07111f] p-5">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7FA8]">{label}</p>
        <span className="rounded-lg bg-violet-500/10 p-1.5 text-violet-400">
          <Icon className="h-3.5 w-3.5" />
        </span>
      </div>
      <p className="mt-3 text-2xl font-black text-[#E8EEFF]">{value}</p>
      {(sub ?? trend) ? (
        <p className="mt-1 text-xs font-medium text-[#6B7FA8]">
          {trend ? <span className="mr-1 text-emerald-400">↑ {trend}</span> : null}
          {sub}
        </p>
      ) : null}
    </div>
  );
}

function ApprovalPathStep({ step, index, total }: { step: { label: string; detail: string }; index: number; total: number }) {
  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-violet-600 text-xs font-black text-white">
          {index + 1}
        </div>
        {index < total - 1 ? <div className="mt-1 w-px flex-1 bg-[#1E2D4A]" /> : null}
      </div>
      <div className="min-w-0 pb-4">
        <p className="text-sm font-bold text-[#E8EEFF]">{step.label}</p>
        <p className="mt-0.5 text-xs leading-5 text-[#6B7FA8]">{step.detail}</p>
      </div>
    </div>
  );
}

type InsightVariant = 'gap' | 'bottleneck' | 'alert' | 'optimize';

function InsightCard({
  variant,
  title,
  body,
  action,
  onAction,
}: {
  variant: InsightVariant;
  title: string;
  body: string;
  action: string;
  onAction?: () => void;
}) {
  const colors: Record<InsightVariant, { border: string; icon: string; ring: string; iconEl: React.ElementType }> = {
    gap: { border: 'border-amber-500/20', icon: 'bg-amber-500/10 text-amber-400', ring: '', iconEl: Shield },
    bottleneck: { border: 'border-rose-500/20', icon: 'bg-rose-500/10 text-rose-400', ring: '', iconEl: Clock },
    alert: { border: 'border-rose-500/20', icon: 'bg-rose-500/10 text-rose-400', ring: '', iconEl: AlertTriangle },
    optimize: { border: 'border-violet-500/20', icon: 'bg-violet-500/10 text-violet-400', ring: '', iconEl: TrendingUp },
  };
  const c = colors[variant];
  const IconEl = c.iconEl;
  return (
    <div className={`rounded-2xl border ${c.border} bg-[#07111f] p-5`}>
      <div className={`inline-flex rounded-xl p-2.5 ${c.icon}`}>
        <IconEl className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-black text-[#E8EEFF]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[#6B7FA8]">{body}</p>
      {onAction ? (
        <button
          type="button"
          onClick={onAction}
          className="mt-4 text-xs font-black text-violet-400 hover:text-violet-300"
        >
          {action} →
        </button>
      ) : (
        <span className="mt-4 block text-xs font-black text-[#3D5070]">{action}</span>
      )}
    </div>
  );
}

// ─── Main component ──────────────────────────────────────────────────────────

export function PlaybookClient({
  initialDocuments,
  initialQueries,
  initialInsights,
  currentUserId,
  canManage,
}: {
  initialDocuments: PlaybookDocument[];
  initialQueries: PlaybookQuery[];
  initialInsights: ComplianceInsights;
  currentUserId: string | null;
  canManage: boolean;
}) {
  const [documents, setDocuments] = useState(initialDocuments);
  const [queries, setQueries] = useState(initialQueries);
  const [insights, setInsights] = useState(initialInsights);

  const initialAdvisory = useMemo<ActiveAdvisory | null>(() => {
    const latest = initialQueries[0];
    if (!latest) return null;
    const parsed = parseAdvisoryAnswer(latest.answer);
    if (!parsed) return null;
    return { ...parsed, queryId: latest.id, question: latest.question };
  }, [initialQueries]);

  const [activeAdvisory, setActiveAdvisory] = useState<ActiveAdvisory | null>(initialAdvisory);
  const [question, setQuestion] = useState('');
  const [panelQuestion, setPanelQuestion] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'mine' | 'department' | 'shared'>('all');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState('Procurement');
  const fileRef = useRef<HTMLInputElement>(null);

  // ─── Data helpers ──────────────────────────────────────────────────────────

  async function refreshLibrary() {
    const response = await fetch('/api/playbooks');
    if (!response.ok) return;
    const data = await response.json() as { documents: PlaybookDocument[]; recentQueries: PlaybookQuery[]; insights: ComplianceInsights };
    setDocuments(data.documents ?? []);
    setInsights(data.insights ?? null);
  }

  async function upload() {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    setBusy('upload');
    setError(null);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('category', uploadCategory);
      const response = await fetch('/api/playbooks/upload', { method: 'POST', body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Upload failed.');
      setUploadOpen(false);
      if (fileRef.current) fileRef.current.value = '';
      await refreshLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(null);
    }
  }

  async function seedDemo() {
    setBusy('demo');
    setError(null);
    try {
      const response = await fetch('/api/playbooks', { method: 'POST' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Demo seed failed.');
      await refreshLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Demo seed failed.');
    } finally {
      setBusy(null);
    }
  }

  async function deleteDocument(id: string) {
    setBusy(id);
    setError(null);
    try {
      const response = await fetch(`/api/playbooks/${id}`, { method: 'DELETE' });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Delete failed.');
      setDocuments((prev) => prev.filter((d) => d.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed.');
    } finally {
      setBusy(null);
    }
  }

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 5) return;
    setBusy('query');
    setError(null);
    try {
      const response = await fetch('/api/playbooks/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Advisory request failed.');
      const parsed = parseAdvisoryAnswer(data);
      if (parsed) {
        const advisory: ActiveAdvisory = {
          ...parsed,
          queryId: data.queryId ?? '',
          question: trimmed,
        };
        setActiveAdvisory(advisory);
        setQueries((prev) => [
          { id: advisory.queryId, question: trimmed, answer: data, confidence: parsed.confidence, createdAt: new Date() },
          ...prev.slice(0, 9),
        ]);
      }
      setQuestion('');
      setPanelQuestion('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Advisory request failed.');
    } finally {
      setBusy(null);
    }
  }

  async function evaluateApprovals() {
    setBusy('evaluate');
    setError(null);
    try {
      const response = await fetch('/api/playbooks/evaluate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 100 }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? 'Evaluation failed.');
      await refreshLibrary();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Evaluation failed.');
    } finally {
      setBusy(null);
    }
  }

  // ─── Filtered documents ────────────────────────────────────────────────────

  const filteredDocs = useMemo(() => {
    if (activeTab === 'mine') return documents.filter((d) => d.ownerUserId === currentUserId);
    if (activeTab === 'department') return documents.filter((d) => {
      const cat = docCategory(d.metadata);
      return CATEGORIES.includes(cat);
    });
    if (activeTab === 'shared') return documents.filter((d) => d.ownerUserId !== currentUserId && d.status === 'READY');
    return documents;
  }, [documents, activeTab, currentUserId]);

  // ─── Insights derivation ───────────────────────────────────────────────────

  const hasInsights = insights !== null;
  const violatedCount = hasInsights ? insights.nonCompliant + insights.partial : 0;
  const topViolatedPolicy = insights?.mostViolatedPolicies?.[0];
  const topViolatedDept = insights?.departmentsWithHighestViolations?.[0];
  const complianceScore = insights?.averageScore ?? 0;
  const readyDocs = documents.filter((d) => d.status === 'READY').length;

  // ─── Approval path ────────────────────────────────────────────────────────

  const approvalPath = activeAdvisory ? buildApprovalPath(activeAdvisory) : [];

  // ─── Tabs ─────────────────────────────────────────────────────────────────

  const TABS: Array<{ key: typeof activeTab; label: string }> = [
    { key: 'all', label: 'All Playbooks' },
    { key: 'mine', label: 'My Playbooks' },
    { key: 'department', label: 'Department Playbooks' },
    { key: 'shared', label: 'Shared With Me' },
  ];

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <section className="grid gap-6">

      {/* ── Header ── */}
      <div className="overflow-hidden rounded-3xl border border-[#1E2D4A] bg-[#07111f] px-7 py-6 shadow-sm">
        <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div>
            <div className="flex items-center gap-3">
              <h2 className="text-2xl font-black tracking-tight text-[#E8EEFF]">Playbook AI Advisory</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-violet-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-wide text-violet-400">
                <Sparkles className="h-3 w-3" /> AI-Powered
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6B7FA8]">
              AI-powered guidance to help you follow the right approval process, every time.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {canManage ? (
              <button
                type="button"
                onClick={() => setUploadOpen(true)}
                disabled={busy !== null}
                className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-4 text-sm font-bold text-[#A8BAD8] hover:border-violet-500/30 hover:text-[#E8EEFF] disabled:cursor-wait disabled:opacity-60"
              >
                <Upload className="h-4 w-4" /> Upload Playbook
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => document.getElementById('advisory-input')?.focus()}
              className="inline-flex h-10 items-center gap-2 rounded-xl bg-violet-600 px-4 text-sm font-bold text-white hover:bg-violet-500"
            >
              <Brain className="h-4 w-4" /> Ask AI Advisor
            </button>
          </div>
        </div>
      </div>

      {/* ── Error banner ── */}
      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-500/20 bg-rose-500/5 p-4">
          <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
          <p className="text-sm font-semibold text-rose-300">{error}</p>
          <button type="button" onClick={() => setError(null)} className="ml-auto text-rose-400 hover:text-rose-300">
            <X className="h-4 w-4" />
          </button>
        </div>
      ) : null}

      {/* ── Stats ── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatTile label="Total Playbooks" value={documents.length} sub={`${readyDocs} active`} icon={FileText} />
        <StatTile label="Active Policies" value={insights?.ruleCount ?? 0} sub="Extracted rules" icon={Shield} />
        <StatTile label="Advisories Generated" value={insights?.evaluationCount ?? queries.length} sub="Compliance checks" icon={Brain} />
        <StatTile label="Compliance Score" value={`${complianceScore}%`} sub={complianceScore >= 80 ? 'Above threshold' : 'Review required'} icon={CheckCircle2} />
        <StatTile label="Avg. Resolution" value={readyDocs > 0 ? '2–3 days' : '—'} sub={readyDocs > 0 ? 'Estimated per advisory' : 'Upload playbooks'} icon={Clock} />
      </div>

      {/* ── Main layout: left content + right advisor panel ── */}
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">

        {/* ── Left column ── */}
        <div className="grid gap-6">

          {/* Get AI Guidance */}
          <div className="relative overflow-hidden rounded-2xl border border-[#1E2D4A] bg-[#07111f] p-6">
            <div className="relative z-10 max-w-2xl">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-400">Get AI Guidance</p>
              <h3 className="mt-1 text-lg font-black text-[#E8EEFF]">
                Describe what you are trying to accomplish and AI will guide you through the right approval process.
              </h3>
              <div className="mt-5 flex gap-2">
                <input
                  id="advisory-input"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(question); } }}
                  placeholder="e.g. I need to onboard a new vendor for SaaS tool costing $75,000 annually."
                  className="flex-1 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-4 py-3 text-sm font-medium text-[#E8EEFF] outline-none transition placeholder:text-[#3D5070] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                />
                <button
                  type="button"
                  onClick={() => ask(question)}
                  disabled={busy === 'query' || question.trim().length < 5}
                  className="inline-flex h-12 items-center gap-2 rounded-xl bg-violet-600 px-5 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
                >
                  <Sparkles className="h-4 w-4" />
                  {busy === 'query' ? 'Analyzing...' : 'Get Advisory'}
                </button>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-[#3D5070]">Popular suggestions</span>
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => { setQuestion(s); document.getElementById('advisory-input')?.focus(); }}
                    className="rounded-full border border-[#1E2D4A] bg-[#0E1830] px-3 py-1 text-xs font-semibold text-[#6B7FA8] transition hover:border-violet-500/40 hover:text-[#E8EEFF]"
                  >
                    {s}
                  </button>
                ))}
                {documents.length === 0 && canManage ? (
                  <button
                    type="button"
                    onClick={seedDemo}
                    disabled={busy !== null}
                    className="rounded-full border border-violet-500/30 bg-violet-500/10 px-3 py-1 text-xs font-semibold text-violet-400 transition hover:bg-violet-500/20"
                  >
                    {busy === 'demo' ? 'Creating...' : '+ Add demo playbooks'}
                  </button>
                ) : null}
              </div>
            </div>
            {/* decorative icon */}
            <div className="pointer-events-none absolute right-6 top-1/2 -translate-y-1/2 opacity-10 xl:opacity-20">
              <Brain className="h-32 w-32 text-violet-400" />
            </div>
          </div>

          {/* Playbooks & Policies table */}
          <div className="rounded-2xl border border-[#1E2D4A] bg-[#07111f] p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-400">Playbooks &amp; Policies</p>
              </div>
              {canManage ? (
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={evaluateApprovals}
                    disabled={busy !== null || readyDocs === 0}
                    className="h-9 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-4 text-xs font-bold text-[#6B7FA8] hover:border-violet-500/30 hover:text-[#E8EEFF] disabled:cursor-wait disabled:opacity-50"
                  >
                    {busy === 'evaluate' ? 'Evaluating...' : 'Evaluate Approvals'}
                  </button>
                </div>
              ) : null}
            </div>

            {/* Tabs */}
            <div className="mt-5 flex gap-1 overflow-x-auto border-b border-[#1E2D4A] pb-0">
              {TABS.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setActiveTab(tab.key)}
                  className={`shrink-0 rounded-t-lg px-4 py-2.5 text-xs font-bold transition ${
                    activeTab === tab.key
                      ? 'border-b-2 border-violet-500 text-violet-400'
                      : 'text-[#6B7FA8] hover:text-[#E8EEFF]'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Table */}
            <div className="mt-4 overflow-x-auto">
              {filteredDocs.length === 0 ? (
                <div className="rounded-xl border border-dashed border-[#1E2D4A] p-8 text-center">
                  <FileText className="mx-auto h-8 w-8 text-[#3D5070]" />
                  <p className="mt-3 font-black text-[#E8EEFF]">
                    {documents.length === 0 ? 'No playbooks yet' : 'No playbooks in this view'}
                  </p>
                  <p className="mt-1 text-sm text-[#6B7FA8]">
                    {documents.length === 0
                      ? canManage
                        ? 'Upload a policy document or add demo playbooks to get started.'
                        : 'No policy documents have been uploaded yet.'
                      : 'Switch to "All Playbooks" to see all documents.'}
                  </p>
                  {documents.length === 0 && canManage ? (
                    <div className="mt-4 flex flex-wrap justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => setUploadOpen(true)}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-violet-600 px-4 text-xs font-bold text-white hover:bg-violet-500"
                      >
                        <Upload className="h-3.5 w-3.5" /> Upload Playbook
                      </button>
                      <button
                        type="button"
                        onClick={seedDemo}
                        disabled={busy !== null}
                        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-4 text-xs font-bold text-[#6B7FA8] hover:text-[#E8EEFF]"
                      >
                        {busy === 'demo' ? 'Creating...' : 'Add Demo Playbooks'}
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : (
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-[#1E2D4A]">
                      {['Playbook Name', 'Category', 'Version', 'Last Updated', 'Compliance Score', 'Status', 'Actions'].map((col) => (
                        <th key={col} className="pb-3 pr-4 text-[10px] font-black uppercase tracking-wide text-[#3D5070] last:pr-0">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDocs.map((doc) => {
                      const cat = docCategory(doc.metadata);
                      const score = doc.status === 'READY' ? complianceScore : null;
                      return (
                        <tr key={doc.id} className="group border-b border-[#1E2D4A]/50 last:border-0">
                          <td className="py-4 pr-4">
                            <div className="flex items-start gap-2">
                              <div className="mt-0.5 rounded-lg bg-violet-500/10 p-1.5">
                                <FileText className="h-3.5 w-3.5 text-violet-400" />
                              </div>
                              <div>
                                <p className="font-bold text-[#E8EEFF]">
                                  {doc.name}
                                  {isDemo(doc.metadata) ? (
                                    <span className="ml-2 rounded-full bg-[#0E1830] px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#6B7FA8]">Demo</span>
                                  ) : null}
                                </p>
                                <p className="text-[11px] text-[#3D5070]">
                                  {doc._count.rules} rules · {doc._count.chunks} sections
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-4 pr-4 text-xs font-semibold text-[#6B7FA8]">{cat}</td>
                          <td className="py-4 pr-4 text-xs font-mono text-[#6B7FA8]">v1.0</td>
                          <td className="py-4 pr-4 text-xs text-[#6B7FA8]">{fmtDate(doc.lastIndexedAt ?? doc.uploadedAt)}</td>
                          <td className="py-4 pr-4">
                            {score !== null ? (
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 w-16 overflow-hidden rounded-full bg-[#1E2D4A]">
                                  <div
                                    className={`h-full rounded-full ${complianceBg(score)}`}
                                    style={{ width: `${score}%` }}
                                  />
                                </div>
                                <span className={`text-xs font-bold ${complianceColor(score)}`}>{score}%</span>
                              </div>
                            ) : (
                              <span className="text-xs text-[#3D5070]">—</span>
                            )}
                          </td>
                          <td className="py-4 pr-4">
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-black ${statusBadge(doc.status)}`}>
                              {statusLabel(doc.status)}
                            </span>
                          </td>
                          <td className="py-4">
                            {canManage ? (
                              <button
                                type="button"
                                onClick={() => deleteDocument(doc.id)}
                                disabled={busy !== null}
                                className="text-[11px] font-black text-[#3D5070] hover:text-rose-400 disabled:cursor-wait"
                              >
                                {busy === doc.id ? 'Deleting...' : 'Delete'}
                              </button>
                            ) : <span className="text-[11px] text-[#3D5070]">—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* AI Insights & Recommendations */}
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-violet-400">AI Insights &amp; Recommendations</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <InsightCard
                variant="gap"
                title="Policy Gap Detected"
                body={
                  violatedCount > 0 && topViolatedPolicy
                    ? `${violatedCount} evaluations show policy gaps. "${topViolatedPolicy.name}" is most frequently triggered.`
                    : hasInsights
                      ? 'No policy gaps detected in recent evaluations.'
                      : 'Upload playbooks and run evaluation to detect policy gaps.'
                }
                action={violatedCount > 0 ? 'Review Now' : 'Run Evaluation'}
                onAction={canManage ? evaluateApprovals : undefined}
              />
              <InsightCard
                variant="bottleneck"
                title="Approval Bottleneck"
                body={
                  topViolatedDept
                    ? `${topViolatedDept.name} has ${topViolatedDept.count} violations above threshold. Review delegation rules.`
                    : 'No bottleneck patterns detected yet. Run compliance evaluation to discover them.'
                }
                action="View Details"
              />
              <InsightCard
                variant="alert"
                title="Compliance Alert"
                body={
                  insights && insights.nonCompliant > 0
                    ? `${insights.nonCompliant} approval${insights.nonCompliant !== 1 ? 's' : ''} bypassed required review steps.`
                    : 'No compliance alerts. All evaluated approvals are within policy.'
                }
                action="Investigate"
              />
              <InsightCard
                variant="optimize"
                title="Optimization Suggestion"
                body={
                  readyDocs > 0
                    ? `${readyDocs} playbook${readyDocs !== 1 ? 's' : ''} indexed. Consider automating vendor risk assessment to reduce approval time.`
                    : 'Upload your first policy document to receive optimization suggestions.'
                }
                action={readyDocs > 0 ? 'Learn More' : 'Upload Playbook'}
                onAction={readyDocs === 0 && canManage ? () => setUploadOpen(true) : undefined}
              />
            </div>
          </div>
        </div>

        {/* ── Right column: AI Advisor panel ── */}
        <div className="xl:sticky xl:top-6 xl:self-start">
          <div className="rounded-2xl border border-[#1E2D4A] bg-[#07111f]">
            {/* Panel header */}
            <div className="flex items-center justify-between border-b border-[#1E2D4A] px-5 py-4">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-violet-400" />
                <p className="text-sm font-black text-[#E8EEFF]">AI Advisor</p>
              </div>
              <div className="flex gap-1.5">
                {activeAdvisory ? (
                  <button
                    type="button"
                    onClick={() => setActiveAdvisory(null)}
                    className="rounded-lg p-1.5 text-[#3D5070] hover:bg-[#0E1830] hover:text-[#6B7FA8]"
                    title="Clear advisory"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                ) : null}
              </div>
            </div>

            <div className="max-h-[calc(100vh-12rem)] overflow-y-auto">
              {activeAdvisory ? (
                <div className="grid gap-0 p-5">
                  {/* User message */}
                  <div className="mb-4 flex justify-end">
                    <div className="max-w-[80%] rounded-2xl rounded-tr-sm bg-violet-600/20 px-4 py-3">
                      <p className="text-sm font-semibold text-[#E8EEFF]">{activeAdvisory.question}</p>
                    </div>
                  </div>

                  {/* AI preamble */}
                  <div className="mb-5 rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-4">
                    <div className="flex gap-2">
                      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[#6B7FA8]" />
                      <p className="text-xs leading-5 text-[#6B7FA8]">
                        Based on your request, here is the recommended approval process.
                      </p>
                    </div>
                  </div>

                  {/* AI answer summary */}
                  {activeAdvisory.answer ? (
                    <div className="mb-5 text-sm leading-6 text-[#6B7FA8]">
                      {activeAdvisory.answer.slice(0, 200)}{activeAdvisory.answer.length > 200 ? '…' : ''}
                    </div>
                  ) : null}

                  {/* Recommended Path */}
                  {approvalPath.length > 0 ? (
                    <div className="mb-5">
                      <p className="mb-4 text-xs font-black uppercase tracking-[0.16em] text-[#3D5070]">Recommended Path</p>
                      <div className="grid">
                        {approvalPath.map((step, i) => (
                          <ApprovalPathStep key={step.label} step={step} index={i} total={approvalPath.length} />
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Compliance status */}
                  {activeAdvisory.compliant ? (() => {
                    const cl = complianceLabel(activeAdvisory.compliant);
                    return (
                      <div className="mb-5 flex items-center gap-2 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-4 py-3">
                        <CheckCircle2 className={`h-3.5 w-3.5 shrink-0 ${cl.cls}`} />
                        <span className={`text-xs font-bold ${cl.cls}`}>Compliance: {cl.label}</span>
                      </div>
                    );
                  })() : null}

                  {/* Likely Outcome */}
                  <div className="mb-5 overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/5">
                    <div className="border-b border-emerald-500/20 px-4 py-2">
                      <p className="text-xs font-black text-emerald-400">Likely Outcome</p>
                    </div>
                    <div className="flex items-center justify-between gap-4 px-4 py-4">
                      <div>
                        <p className="text-sm font-black text-[#E8EEFF]">{likelihoodLabel(activeAdvisory.confidence)}</p>
                        <p className="mt-1 text-xs text-[#6B7FA8]">
                          Est. time: 2–3 days &nbsp;|&nbsp;
                          Risk: {activeAdvisory.requiredApprovers.length > 3 ? 'Medium' : 'Low'}
                        </p>
                      </div>
                      <div className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-4 border-emerald-500/30">
                        <div
                          className="absolute inset-0 rounded-full border-4 border-emerald-500"
                          style={{ clipPath: `inset(0 ${100 - activeAdvisory.confidence}% 0 0 round 999px)` }}
                        />
                        <span className="text-sm font-black text-emerald-400">{activeAdvisory.confidence}%</span>
                      </div>
                    </div>
                  </div>

                  {/* Policy sources */}
                  {activeAdvisory.policySections.length > 0 ? (
                    <div className="mb-5">
                      <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#3D5070]">Policy References</p>
                      <div className="grid gap-2">
                        {activeAdvisory.policySections.slice(0, 3).map((src) => (
                          <div key={`${src.document}-${src.section}`} className="rounded-xl border border-[#1E2D4A] bg-[#0E1830] p-3">
                            <p className="text-[11px] font-bold text-[#E8EEFF]">{src.document}</p>
                            <p className="text-[10px] text-[#3D5070]">{src.section}</p>
                            {src.excerpt ? <p className="mt-1 text-[11px] leading-4 text-[#6B7FA8]">{src.excerpt.slice(0, 120)}{src.excerpt.length > 120 ? '…' : ''}</p> : null}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {/* Evidence missing */}
                  {activeAdvisory.evidenceMissing.length > 0 ? (
                    <div className="mb-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
                      <p className="text-xs font-black text-amber-400">Missing Information</p>
                      <ul className="mt-2 grid gap-1">
                        {activeAdvisory.evidenceMissing.map((item) => (
                          <li key={item} className="flex items-start gap-1.5">
                            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-amber-400" />
                            <span className="text-xs text-[#6B7FA8]">{item}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}

                  {/* View Similar Approvals */}
                  <PendingLink
                    href="/approvals"
                    pendingText="Opening..."
                    className="mb-5 flex w-full items-center justify-between rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-4 py-3 text-sm font-bold text-[#6B7FA8] hover:border-violet-500/30 hover:text-[#E8EEFF]"
                  >
                    View Similar Past Approvals <ChevronRight className="h-4 w-4" />
                  </PendingLink>
                </div>
              ) : (
                <div className="p-6 text-center">
                  <Brain className="mx-auto h-10 w-10 text-[#1E2D4A]" />
                  <p className="mt-4 font-black text-[#E8EEFF]">Ask about your approval process</p>
                  <p className="mt-2 text-sm leading-6 text-[#6B7FA8]">
                    Describe a request — vendor onboarding, contract approval, hiring — and AI will analyze your playbooks and recommend the right path.
                  </p>
                  {documents.filter((d) => d.status === 'READY').length === 0 ? (
                    <div className="mt-5 rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 text-left">
                      <p className="text-xs font-bold text-amber-400">No playbooks indexed yet</p>
                      <p className="mt-1 text-xs text-[#6B7FA8]">
                        {canManage
                          ? 'Upload policy documents first, then ask a question to receive guided recommendations.'
                          : 'Contact an admin to upload policy documents before using advisory.'}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}

              {/* Recent AI Advisories */}
              {queries.length > 0 ? (
                <div className="border-t border-[#1E2D4A] px-5 py-4">
                  <p className="mb-3 text-xs font-black uppercase tracking-[0.16em] text-[#3D5070]">Recent AI Advisories</p>
                  <div className="grid gap-2">
                    {queries.slice(0, 5).map((q) => {
                      const parsed = parseAdvisoryAnswer(q.answer);
                      return (
                        <button
                          key={q.id}
                          type="button"
                          onClick={() => {
                            if (parsed) setActiveAdvisory({ ...parsed, queryId: q.id, question: q.question });
                          }}
                          className={`w-full rounded-xl border px-3 py-3 text-left transition hover:border-violet-500/30 ${
                            activeAdvisory?.queryId === q.id
                              ? 'border-violet-500/40 bg-violet-500/10'
                              : 'border-[#1E2D4A] bg-[#0E1830]'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-1 text-xs font-bold text-[#E8EEFF]">{q.question}</p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black ${
                              parsed?.compliant === 'yes'
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : parsed?.compliant === 'no'
                                  ? 'bg-rose-500/10 text-rose-400'
                                  : 'bg-amber-500/10 text-amber-400'
                            }`}>
                              {parsed?.compliant === 'yes' ? 'Compliant' : parsed?.compliant === 'no' ? 'Non-compliant' : 'Review'}
                            </span>
                          </div>
                          <p className="mt-1 text-[10px] text-[#3D5070]">{fmtTime(q.createdAt)}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}

              {/* Panel input */}
              <div className="border-t border-[#1E2D4A] p-4">
                {documents.filter((d) => d.status === 'READY').length === 0 ? (
                  <p className="text-center text-[11px] text-[#3D5070]">Upload and index a playbook to enable advisory.</p>
                ) : (
                  <div className="flex gap-2">
                    <input
                      value={panelQuestion}
                      onChange={(e) => setPanelQuestion(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          ask(panelQuestion);
                        }
                      }}
                      placeholder="Ask anything about approvals, policies..."
                      className="flex-1 rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 py-2.5 text-xs font-medium text-[#E8EEFF] outline-none placeholder:text-[#3D5070] focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                    />
                    <button
                      type="button"
                      onClick={() => ask(panelQuestion)}
                      disabled={busy === 'query' || panelQuestion.trim().length < 5}
                      className="rounded-xl bg-violet-600 p-2.5 text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
                    >
                      {busy === 'query' ? <RotateCcw className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                    </button>
                  </div>
                )}
                <p className="mt-2 text-center text-[10px] text-[#3D5070]">AI responses may be inaccurate. Verify important information.</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Upload Modal ── */}
      {uploadOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setUploadOpen(false)} />
          <div className="relative w-full max-w-md rounded-2xl border border-[#1E2D4A] bg-[#07111f] p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-black text-[#E8EEFF]">Upload Playbook</h3>
                <p className="mt-1 text-xs text-[#6B7FA8]">Supports PDF, DOCX, TXT, and Markdown. Max 10 MB.</p>
              </div>
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="rounded-lg p-1.5 text-[#3D5070] hover:bg-[#0E1830] hover:text-[#6B7FA8]"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#6B7FA8]">Category</label>
                <select
                  value={uploadCategory}
                  onChange={(e) => setUploadCategory(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm font-semibold text-[#E8EEFF] outline-none focus:border-violet-500/50 focus:ring-2 focus:ring-violet-500/20"
                >
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-[#6B7FA8]">Policy Document</label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.docx,.txt,.md,.markdown"
                  className="block w-full rounded-xl border border-[#1E2D4A] bg-[#0E1830] px-3 py-3 text-sm font-semibold text-[#E8EEFF] file:mr-3 file:rounded-lg file:border-0 file:bg-violet-600 file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white"
                />
              </div>
              {error ? (
                <p className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-3 text-xs font-semibold text-rose-300">{error}</p>
              ) : null}
            </div>

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={() => setUploadOpen(false)}
                className="flex-1 rounded-xl border border-[#1E2D4A] py-2.5 text-sm font-bold text-[#6B7FA8] hover:text-[#E8EEFF]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={upload}
                disabled={busy === 'upload'}
                className="flex-1 rounded-xl bg-violet-600 py-2.5 text-sm font-bold text-white hover:bg-violet-500 disabled:cursor-wait disabled:opacity-60"
              >
                {busy === 'upload' ? 'Indexing...' : 'Upload & Index'}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
