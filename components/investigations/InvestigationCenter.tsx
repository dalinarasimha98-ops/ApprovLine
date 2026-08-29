'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Plus,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { InvestigationDetailPanel } from './InvestigationDetailPanel';

// ─── Types ───────────────────────────────────────────────────────────────────

export type InvestigationStatus = 'OPEN' | 'IN_PROGRESS' | 'ESCALATED' | 'RESOLVED' | 'CLOSED';

export type InvestigationRow = {
  id: string;
  title: string;
  status: InvestigationStatus;
  type: string | null;
  department: string | null;
  riskLevel: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedAt: string | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  createdBy: { id: string; name: string | null; email: string } | null;
  approvals: Array<{
    id: string;
    approvalRecord: {
      id: string;
      subject: string;
      approverName: string | null;
      department: string | null;
      riskLevel: string | null;
      status: string;
      confidence: number;
      occurredAt: string | null;
      sourcePlatform: string | null;
    };
  }>;
  notes: Array<{ id: string; body: string; createdAt: string }>;
};

export type InvestigationMetrics = {
  totalInvestigations: number;
  highRiskInvestigations: number;
  inProgressInvestigations: number;
  resolvedInvestigations: number;
  openInvestigations: number;
  closedInvestigations: number;
  escalatedInvestigations: number;
  avgResolutionDays: number;
};

type User = { id: string; name: string | null; email: string };

type Props = {
  initialCases: InvestigationRow[];
  initialTotal: number;
  metrics: InvestigationMetrics;
  users: User[];
  currentUserId: string;
  canSeedDemo: boolean;
  migrationReady: boolean;
  riskyApprovals: Array<{
    id: string;
    subject: string;
    department: string | null;
    approverName: string | null;
    sourcePlatform: string | null;
    riskLevel: string | null;
    occurredAt: string | null;
  }>;
};

// ─── Style helpers ────────────────────────────────────────────────────────────

function riskBadge(risk?: string | null) {
  if (risk === 'critical') return 'bg-red-500/15 text-red-400 border border-red-500/25';
  if (risk === 'high') return 'bg-red-500/15 text-red-400 border border-red-500/25';
  if (risk === 'medium') return 'bg-amber-500/15 text-amber-400 border border-amber-500/25';
  return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
}

function riskLabel(risk?: string | null) {
  return risk ? risk.charAt(0).toUpperCase() + risk.slice(1) : 'Low';
}

function statusBadge(status: InvestigationStatus) {
  switch (status) {
    case 'IN_PROGRESS': return 'bg-blue-500/15 text-blue-400 border border-blue-500/25';
    case 'ESCALATED': return 'bg-orange-500/15 text-orange-400 border border-orange-500/25';
    case 'RESOLVED': return 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/25';
    case 'CLOSED': return 'bg-slate-500/15 text-slate-400 border border-slate-500/25';
    default: return 'bg-violet-500/15 text-violet-400 border border-violet-500/25';
  }
}

function statusLabel(status: InvestigationStatus) {
  switch (status) {
    case 'IN_PROGRESS': return 'In Progress';
    case 'ESCALATED': return 'Escalated';
    case 'RESOLVED': return 'Resolved';
    case 'CLOSED': return 'Closed';
    default: return 'Open';
  }
}

function typeBadge(type: string | null) {
  const t = type ?? 'Other';
  const map: Record<string, string> = {
    Anomaly: 'bg-purple-500/15 text-purple-400 border border-purple-500/25',
    Compliance: 'bg-blue-500/15 text-blue-400 border border-blue-500/25',
    Security: 'bg-red-500/15 text-red-400 border border-red-500/25',
    Pattern: 'bg-amber-500/15 text-amber-400 border border-amber-500/25',
    PolicyViolation: 'bg-orange-500/15 text-orange-400 border border-orange-500/25',
    MissingEvidence: 'bg-rose-500/15 text-rose-400 border border-rose-500/25',
    Manual: 'bg-slate-500/15 text-slate-400 border border-slate-500/25',
  };
  return map[t] ?? 'bg-slate-500/15 text-slate-400 border border-slate-500/25';
}

function formatDate(value: string | null | undefined) {
  if (!value) return '—';
  const d = new Date(value);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}


function initials(user: User | null) {
  if (!user) return '?';
  const name = user.name ?? user.email;
  return name.slice(0, 2).toUpperCase();
}

// ─── KPI card ─────────────────────────────────────────────────────────────────

function KpiCard({ label, value, sub, accent }: { label: string; value: string | number; sub?: string; accent?: string }) {
  return (
    <div className="rounded-xl border border-[#1E2D4A] bg-[#07111f] px-5 py-4 flex flex-col gap-1 min-w-0">
      <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider truncate">{label}</p>
      <p className={`text-2xl font-black tracking-tight ${accent ?? 'text-[#E8EEFF]'}`}>{value}</p>
      {sub && <p className="text-xs font-medium text-emerald-400 mt-0.5">{sub}</p>}
    </div>
  );
}

// ─── Insights charts (SVG) ────────────────────────────────────────────────────

type Insights = {
  riskDistribution: { high: number; medium: number; low: number };
  typeDistribution: Record<string, number>;
  avgResolutionDays: number;
  weeklyTrend: Record<string, { created: number; resolved: number }>;
};

function InsightsPanel({ orgId }: { orgId?: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch('/api/investigations/insights')
      .then((r) => r.json())
      .then((d: Insights) => { setData(d); setLoading(false); })
      .catch(() => setLoading(false));
  }, [orgId]);

  if (loading) return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[0,1,2,3].map((i) => <div key={i} className="rounded-xl border border-[#1E2D4A] bg-[#07111f] h-44 animate-pulse" />)}
    </div>
  );
  if (!data) return (
    <div className="rounded-xl border border-[#1E2D4A] bg-[#07111f] p-4 text-sm text-[#6B7FA8]">
      AI Insights unavailable — insufficient data or insights service unreachable.
    </div>
  );

  const total = data.riskDistribution.high + data.riskDistribution.medium + data.riskDistribution.low || 1;
  const donutData = [
    { label: 'High', value: data.riskDistribution.high, color: '#EF4444', pct: data.riskDistribution.high / total },
    { label: 'Medium', value: data.riskDistribution.medium, color: '#F59E0B', pct: data.riskDistribution.medium / total },
    { label: 'Low', value: data.riskDistribution.low, color: '#10B981', pct: data.riskDistribution.low / total },
  ];

  const typeEntries = Object.entries(data.typeDistribution).sort((a, b) => b[1] - a[1]).slice(0, 5);
  const maxType = Math.max(...typeEntries.map((e) => e[1]), 1);

  const weeks = Object.entries(data.weeklyTrend);
  const maxTrend = Math.max(...weeks.flatMap(([, v]) => [v.created, v.resolved]), 1);

  // Donut chart
  let cumulativePct = 0;
  const r = 40, cx = 56, cy = 56, circumference = 2 * Math.PI * r;
  const donutSegments = donutData.map((seg) => {
    const offset = circumference * (1 - cumulativePct);
    const dashArr = `${circumference * seg.pct} ${circumference * (1 - seg.pct)}`;
    cumulativePct += seg.pct;
    return { ...seg, offset, dashArr };
  });

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {/* Risk Distribution donut */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#07111f] p-4">
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-3">Risk Distribution</p>
        <div className="flex items-center gap-3">
          <svg viewBox="0 0 112 112" className="w-20 h-20 shrink-0" style={{ transform: 'rotate(-90deg)' }}>
            {total === 1 && data.riskDistribution.high + data.riskDistribution.medium + data.riskDistribution.low === 0 ? (
              <circle cx={cx} cy={cy} r={r} fill="none" stroke="#1E2D4A" strokeWidth="16" />
            ) : donutSegments.map((seg) => (
              <circle
                key={seg.label}
                cx={cx} cy={cy} r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth="16"
                strokeDasharray={seg.dashArr}
                strokeDashoffset={seg.offset}
              />
            ))}
            <text x={cx} y={cy + 5} textAnchor="middle" fill="#E8EEFF" fontSize="14" fontWeight="700" style={{ transform: 'rotate(90deg)', transformOrigin: `${cx}px ${cy}px` }}>
              {total - 1}
            </text>
          </svg>
          <div className="grid gap-1.5 text-xs">
            {donutData.map((seg) => (
              <div key={seg.label} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: seg.color }} />
                <span className="text-[#6B7FA8]">{seg.label}</span>
                <span className="ml-auto font-bold text-[#E8EEFF]">{seg.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Investigations by Type */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#07111f] p-4">
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-3">By Type</p>
        {typeEntries.length === 0 ? (
          <p className="text-xs text-[#6B7FA8]">No type data yet.</p>
        ) : (
          <div className="grid gap-2">
            {typeEntries.map(([type, count]) => (
              <div key={type} className="grid gap-1">
                <div className="flex justify-between text-xs">
                  <span className="text-[#E8EEFF] truncate">{type}</span>
                  <span className="text-[#6B7FA8] font-bold ml-2 shrink-0">{count}</span>
                </div>
                <div className="h-1.5 rounded-full bg-[#1E2D4A] overflow-hidden">
                  <div className="h-full rounded-full bg-violet-500" style={{ width: `${(count / maxType) * 100}%` }} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Resolution Trend */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#07111f] p-4">
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider mb-3">Resolution Trend</p>
        <svg viewBox={`0 0 ${weeks.length * 40} 60`} className="w-full h-16">
          {weeks.map(([label, v], i) => {
            const x = i * 40 + 20;
            const createdY = 55 - (v.created / maxTrend) * 50;
            const resolvedY = 55 - (v.resolved / maxTrend) * 50;
            return (
              <g key={label}>
                <line x1={x} y1={55} x2={x} y2={5} stroke="#1E2D4A" strokeWidth="0.5" strokeDasharray="2,3" />
                <circle cx={x} cy={createdY} r="3" fill="#7C3AED" />
                <circle cx={x} cy={resolvedY} r="3" fill="#10B981" />
                {i > 0 && (() => {
                  const prev = weeks[i - 1][1];
                  const px = (i - 1) * 40 + 20;
                  const pcY = 55 - (prev.created / maxTrend) * 50;
                  const prY = 55 - (prev.resolved / maxTrend) * 50;
                  return (
                    <>
                      <line x1={px} y1={pcY} x2={x} y2={createdY} stroke="#7C3AED" strokeWidth="1.5" />
                      <line x1={px} y1={prY} x2={x} y2={resolvedY} stroke="#10B981" strokeWidth="1.5" />
                    </>
                  );
                })()}
              </g>
            );
          })}
        </svg>
        <div className="flex gap-3 mt-1 text-xs">
          <span className="flex items-center gap-1"><span className="w-2 h-0.5 bg-violet-500 inline-block" /> Created</span>
          <span className="flex items-center gap-1 text-emerald-400"><span className="w-2 h-0.5 bg-emerald-500 inline-block" /> Resolved</span>
        </div>
      </div>

      {/* Avg Resolution Time */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#07111f] p-4 flex flex-col justify-between">
        <p className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider">Avg Resolution</p>
        <div>
          <p className="text-4xl font-black text-[#E8EEFF] mt-2">{data.avgResolutionDays > 0 ? `${data.avgResolutionDays}d` : '—'}</p>
          <p className="text-xs text-[#6B7FA8] mt-1">{data.avgResolutionDays > 0 ? 'average time to resolve' : 'No resolved cases yet'}</p>
        </div>
        {data.avgResolutionDays > 0 && (
          <div className="text-xs text-emerald-400 font-medium mt-2">
            {data.avgResolutionDays <= 3 ? '↓ Fast resolution' : data.avgResolutionDays <= 7 ? '→ Average pace' : '↑ Review escalations'}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── New Investigation modal ──────────────────────────────────────────────────

type NewInvestigationModalProps = {
  onClose: () => void;
  onCreated: (id: string) => void;
  riskyApprovals: Props['riskyApprovals'];
  users: User[];
};

const INVESTIGATION_TYPES = ['Anomaly', 'Compliance', 'Security', 'Pattern', 'PolicyViolation', 'MissingEvidence', 'Manual'];

function NewInvestigationModal({ onClose, onCreated, riskyApprovals, users }: NewInvestigationModalProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState('');
  const [selectedApprovals, setSelectedApprovals] = useState<string[]>([]);

  function toggleApproval(id: string) {
    setSelectedApprovals((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get('title') ?? '').trim();
    const type = String(fd.get('type') ?? '').trim();
    const department = String(fd.get('department') ?? '').trim();
    const assignedToUserId = String(fd.get('assignedToUserId') ?? '').trim() || undefined;
    if (!title) { setError('Title is required.'); return; }

    startTransition(async () => {
      setError('');
      const res = await fetch('/api/investigations', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ title, type: type || undefined, department: department || undefined, approvalIds: selectedApprovals, assignedToUserId }),
      });
      const data = await res.json() as { investigation?: { id: string }; error?: string };
      if (!res.ok || !data.investigation) { setError(data.error ?? 'Failed to create investigation.'); return; }
      onCreated(data.investigation.id);
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="w-full max-w-lg rounded-2xl border border-[#1E2D4A] bg-[#07111f] shadow-2xl overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1E2D4A]">
          <div>
            <p className="text-xs font-semibold text-violet-400 uppercase tracking-wider">New Investigation</p>
            <h3 className="text-lg font-black text-[#E8EEFF] mt-0.5">Create Investigation Case</h3>
          </div>
          <button type="button" onClick={onClose} className="text-[#6B7FA8] hover:text-[#E8EEFF] p-1 rounded-lg transition"><X className="w-5 h-5" /></button>
        </div>
        <form onSubmit={submit} className="p-6 grid gap-4 overflow-y-auto max-h-[70vh]">
          {error && <p className="rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-2 text-sm text-red-400">{error}</p>}
          <div className="grid gap-1.5">
            <label className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider">Title *</label>
            <input name="title" placeholder="Vendor payment evidence review" className="h-10 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm text-[#E8EEFF] placeholder-[#6B7FA8] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider">Type</label>
              <select name="type" className="h-10 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm text-[#E8EEFF] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition">
                <option value="">Select type...</option>
                {INVESTIGATION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/([A-Z])/g, ' $1').trim()}</option>)}
              </select>
            </div>
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider">Department</label>
              <input name="department" placeholder="Finance" className="h-10 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm text-[#E8EEFF] placeholder-[#6B7FA8] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition" />
            </div>
          </div>
          {users.length > 0 && (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider">Assign to</label>
              <select name="assignedToUserId" className="h-10 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-3 text-sm text-[#E8EEFF] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition">
                <option value="">Unassigned</option>
                {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
              </select>
            </div>
          )}
          {riskyApprovals.length > 0 && (
            <div className="grid gap-1.5">
              <label className="text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider">Link Approvals ({selectedApprovals.length} selected)</label>
              <div className="rounded-lg border border-[#1E2D4A] overflow-hidden max-h-44 overflow-y-auto">
                {riskyApprovals.map((approval) => (
                  <label key={approval.id} className={`flex items-start gap-3 px-3 py-2 cursor-pointer transition border-b border-[#1E2D4A] last:border-0 ${selectedApprovals.includes(approval.id) ? 'bg-violet-500/10' : 'hover:bg-[#0E1830]'}`}>
                    <input type="checkbox" checked={selectedApprovals.includes(approval.id)} onChange={() => toggleApproval(approval.id)} className="mt-0.5 accent-violet-500" />
                    <span>
                      <span className="block text-xs font-bold text-[#E8EEFF] truncate">{approval.subject}</span>
                      <span className="block text-xs text-[#6B7FA8]">{approval.department ?? 'Unknown'} · {approval.sourcePlatform ?? 'Source'}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-3 mt-2">
            <button type="button" onClick={onClose} className="flex-1 h-10 rounded-lg border border-[#1E2D4A] text-sm font-semibold text-[#6B7FA8] hover:text-[#E8EEFF] hover:border-[#2D4F7F] transition">Cancel</button>
            <button type="submit" disabled={isPending} className="flex-1 h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-bold text-white shadow-lg shadow-violet-900/30 transition disabled:opacity-60">
              {isPending ? 'Creating…' : 'Create Investigation'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function InvestigationCenter({
  initialCases,
  initialTotal,
  metrics,
  users,
  migrationReady,
  riskyApprovals,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [cases, setCases] = useState<InvestigationRow[]>(initialCases);
  const [total, setTotal] = useState(initialTotal);
  const [page, setPage] = useState(1);
  const perPage = 20;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [isRefreshing, startRefresh] = useTransition();

  // Filter state
  const [search, setSearch] = useState(searchParams.get('q') ?? '');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? '');
  const [riskFilter, setRiskFilter] = useState(searchParams.get('risk') ?? '');
  const [typeFilter, setTypeFilter] = useState(searchParams.get('type') ?? '');
  const [ownerFilter, setOwnerFilter] = useState(searchParams.get('owner') ?? '');

  const searchInputRef = useRef<HTMLInputElement>(null);

  const fetchCases = useCallback((opts: { q?: string; status?: string; risk?: string; type?: string; owner?: string; pg?: number } = {}) => {
    const params = new URLSearchParams();
    if (opts.q ?? search) params.set('q', opts.q ?? search);
    if (opts.status ?? statusFilter) params.set('status', opts.status ?? statusFilter);
    if (opts.risk ?? riskFilter) params.set('risk', opts.risk ?? riskFilter);
    if (opts.type ?? typeFilter) params.set('type', opts.type ?? typeFilter);
    if (opts.owner ?? ownerFilter) params.set('assignedTo', opts.owner ?? ownerFilter);
    if ((opts.pg ?? page) > 1) params.set('page', String(opts.pg ?? page));

    startRefresh(async () => {
      const res = await fetch(`/api/investigations?${params}`);
      if (!res.ok) return;
      const data = await res.json() as { cases: InvestigationRow[]; total: number };
      setCases(data.cases);
      setTotal(data.total);
    });
  }, [search, statusFilter, riskFilter, typeFilter, ownerFilter, page]);

  // Keyboard shortcut: Escape to close panel
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelectedId(null);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  function applyFilters(e?: React.FormEvent) {
    if (e) e.preventDefault();
    setPage(1);
    fetchCases({ pg: 1 });
  }

  function clearFilters() {
    setSearch(''); setStatusFilter(''); setRiskFilter(''); setTypeFilter(''); setOwnerFilter('');
    setPage(1);
    startRefresh(async () => {
      const res = await fetch('/api/investigations');
      if (!res.ok) return;
      const data = await res.json() as { cases: InvestigationRow[]; total: number };
      setCases(data.cases);
      setTotal(data.total);
    });
  }

  function goPage(p: number) {
    setPage(p);
    fetchCases({ pg: p });
  }

  const totalPages = Math.ceil(total / perPage);
  const activeFilters = [statusFilter, riskFilter, typeFilter, ownerFilter].filter(Boolean).length;

  return (
    <div className="grid gap-4">
      {/* ── Page header ─────────────────────────────────────────────── */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-black tracking-tight text-[#E8EEFF]">Investigation Center</h2>
          <p className="mt-1 text-sm text-[#6B7FA8]">Investigate high-risk approvals, anomalies and compliance issues with AI-powered intelligence.</p>
        </div>
        <div className="flex gap-2 shrink-0">
          <a
            href="/api/export/investigations/bulk-report"
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#1E2D4A] bg-[#07111f] px-3 text-sm font-semibold text-[#6B7FA8] hover:text-[#E8EEFF] hover:border-[#2D4F7F] transition"
          >
            <Download className="w-4 h-4" /> Export
          </a>
          {migrationReady && (
            <button
              type="button"
              onClick={() => setShowNewModal(true)}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 text-sm font-bold text-white shadow-lg shadow-violet-900/30 transition"
            >
              <Plus className="w-4 h-4" /> New Investigation
            </button>
          )}
        </div>
      </div>

      {/* ── KPI cards ───────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        <KpiCard label="Total Investigations" value={metrics.totalInvestigations} />
        <KpiCard label="High Risk" value={metrics.highRiskInvestigations} accent="text-red-400" />
        <KpiCard label="In Progress" value={metrics.inProgressInvestigations} accent="text-blue-400" />
        <KpiCard label="Resolved" value={metrics.resolvedInvestigations} accent="text-emerald-400" />
        <KpiCard label="Open" value={metrics.openInvestigations} accent="text-violet-400" sub={metrics.escalatedInvestigations > 0 ? `${metrics.escalatedInvestigations} escalated` : undefined} />
      </div>

      {!migrationReady && (
        <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3 flex items-center gap-3">
          <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
          <p className="text-sm text-amber-300">Investigation tables pending migration. Run <code className="font-mono text-amber-400">npm run db:deploy</code> to unlock case management.</p>
        </div>
      )}

      {/* ── Filter bar ──────────────────────────────────────────────── */}
      <form onSubmit={applyFilters} className="rounded-xl border border-[#1E2D4A] bg-[#07111f] p-3 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[160px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#6B7FA8]" />
          <input
            ref={searchInputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search investigations…"
            className="h-9 w-full rounded-lg border border-[#1E2D4A] bg-[#0E1830] pl-9 pr-3 text-sm text-[#E8EEFF] placeholder-[#6B7FA8] outline-none focus:border-violet-500 focus:ring-1 focus:ring-violet-500/30 transition"
          />
        </div>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); applyFilters(); }} className="h-9 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-2 text-sm text-[#E8EEFF] outline-none focus:border-violet-500 transition">
          <option value="">Status: All</option>
          <option value="OPEN">Open</option>
          <option value="IN_PROGRESS">In Progress</option>
          <option value="ESCALATED">Escalated</option>
          <option value="RESOLVED">Resolved</option>
          <option value="CLOSED">Closed</option>
        </select>
        <select value={riskFilter} onChange={(e) => { setRiskFilter(e.target.value); applyFilters(); }} className="h-9 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-2 text-sm text-[#E8EEFF] outline-none focus:border-violet-500 transition">
          <option value="">Risk: All</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); applyFilters(); }} className="h-9 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-2 text-sm text-[#E8EEFF] outline-none focus:border-violet-500 transition">
          <option value="">Type: All</option>
          {INVESTIGATION_TYPES.map((t) => <option key={t} value={t}>{t.replace(/([A-Z])/g, ' $1').trim()}</option>)}
        </select>
        {users.length > 0 && (
          <select value={ownerFilter} onChange={(e) => { setOwnerFilter(e.target.value); applyFilters(); }} className="h-9 rounded-lg border border-[#1E2D4A] bg-[#0E1830] px-2 text-sm text-[#E8EEFF] outline-none focus:border-violet-500 transition">
            <option value="">Owner: All</option>
            <option value="unassigned">Unassigned</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name ?? u.email}</option>)}
          </select>
        )}
        {activeFilters > 0 && (
          <button type="button" onClick={clearFilters} className="h-9 px-3 rounded-lg border border-[#1E2D4A] text-xs font-semibold text-[#6B7FA8] hover:text-red-400 hover:border-red-500/30 transition flex items-center gap-1">
            <X className="w-3.5 h-3.5" /> Clear
          </button>
        )}
        <button type="submit" className="h-9 px-3 rounded-lg bg-violet-600 hover:bg-violet-500 text-sm font-semibold text-white transition flex items-center gap-1.5">
          <Filter className="w-3.5 h-3.5" />
          {activeFilters > 0 && <span className="bg-white/20 rounded-full px-1.5 py-0.5 text-xs">{activeFilters}</span>}
        </button>
        <button
          type="button"
          onClick={() => { setPage(1); fetchCases({ pg: 1 }); }}
          className="h-9 w-9 rounded-lg border border-[#1E2D4A] text-[#6B7FA8] hover:text-[#E8EEFF] hover:border-[#2D4F7F] transition flex items-center justify-center"
          title="Refresh"
        >
          <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        </button>
      </form>

      {/* ── Table + Detail panel ─────────────────────────────────────── */}
      <div className={`relative flex gap-4 ${selectedId ? 'xl:grid xl:grid-cols-[1fr_420px]' : ''}`}>
        {/* Table */}
        <div className="min-w-0 flex-1 rounded-xl border border-[#1E2D4A] bg-[#07111f] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1E2D4A]">
                  {['Investigation', 'Type', 'Risk', 'Status', 'Owner', 'Created', 'Last Updated', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-[#6B7FA8] uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isRefreshing ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i} className="border-b border-[#1E2D4A]">
                      {Array.from({ length: 8 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><div className="h-4 rounded bg-[#1E2D4A] animate-pulse" /></td>
                      ))}
                    </tr>
                  ))
                ) : cases.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-12 text-center">
                      <p className="text-[#6B7FA8] text-sm">
                        {activeFilters > 0 || search ? 'No investigations match your filters.' : 'No investigation cases yet. Create one from a high-risk approval.'}
                      </p>
                    </td>
                  </tr>
                ) : cases.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setSelectedId(selectedId === row.id ? null : row.id)}
                    className={`border-b border-[#1E2D4A] cursor-pointer transition-colors ${selectedId === row.id ? 'bg-violet-500/10' : 'hover:bg-[#0E1830]'}`}
                  >
                    <td className="px-4 py-3">
                      <div className="max-w-[260px]">
                        <p className="text-xs font-semibold text-[#6B7FA8] mb-0.5">#{row.id.slice(-8).toUpperCase()}</p>
                        <p className="font-bold text-[#E8EEFF] truncate">{row.title}</p>
                        {row.department && <p className="text-xs text-[#6B7FA8] mt-0.5 truncate">{row.department}</p>}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.type ? (
                        <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${typeBadge(row.type)}`}>
                          {row.type.replace(/([A-Z])/g, ' $1').trim()}
                        </span>
                      ) : <span className="text-[#6B7FA8]">—</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${riskBadge(row.riskLevel)}`}>
                        {riskLabel(row.riskLevel)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className={`inline-block rounded-md px-2 py-0.5 text-xs font-semibold ${statusBadge(row.status)}`}>
                        {statusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {row.assignedTo ? (
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-violet-500/20 text-violet-400 flex items-center justify-center text-[10px] font-bold">{initials(row.assignedTo)}</span>
                          <span className="text-xs text-[#E8EEFF] truncate max-w-[80px]">{row.assignedTo.name ?? row.assignedTo.email}</span>
                        </div>
                      ) : <span className="text-xs text-[#6B7FA8]">Unassigned</span>}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-[#6B7FA8]">{formatDate(row.createdAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-xs text-[#6B7FA8]">{formatDate(row.updatedAt)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); router.push(`/investigations/${row.id}`); }}
                        className="text-xs text-violet-400 hover:text-violet-300 font-semibold transition"
                      >
                        View →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="px-4 py-3 border-t border-[#1E2D4A] flex items-center justify-between gap-3">
              <p className="text-xs text-[#6B7FA8]">Showing {(page - 1) * perPage + 1}–{Math.min(page * perPage, total)} of {total}</p>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => goPage(page - 1)} disabled={page <= 1} className="w-8 h-8 rounded-lg border border-[#1E2D4A] text-[#6B7FA8] disabled:opacity-30 hover:bg-[#0E1830] flex items-center justify-center transition">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                  const p = totalPages <= 5 ? i + 1 : page <= 3 ? i + 1 : page >= totalPages - 2 ? totalPages - 4 + i : page - 2 + i;
                  return (
                    <button key={p} type="button" onClick={() => goPage(p)} className={`w-8 h-8 rounded-lg text-xs font-bold transition ${p === page ? 'bg-violet-600 text-white' : 'border border-[#1E2D4A] text-[#6B7FA8] hover:bg-[#0E1830]'}`}>{p}</button>
                  );
                })}
                <button type="button" onClick={() => goPage(page + 1)} disabled={page >= totalPages} className="w-8 h-8 rounded-lg border border-[#1E2D4A] text-[#6B7FA8] disabled:opacity-30 hover:bg-[#0E1830] flex items-center justify-center transition">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Detail panel */}
        {selectedId && (
          <div className="hidden xl:block">
            <InvestigationDetailPanel
              investigationId={selectedId}
              onClose={() => setSelectedId(null)}
              onStatusChanged={(id, status) => {
                setCases((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
              }}
              users={users}
            />
          </div>
        )}
      </div>

      {/* Mobile detail panel (full-screen overlay) */}
      {selectedId && (
        <div className="xl:hidden fixed inset-0 z-40 bg-[#030b18] overflow-y-auto">
          <InvestigationDetailPanel
            investigationId={selectedId}
            onClose={() => setSelectedId(null)}
            onStatusChanged={(id, status) => {
              setCases((prev) => prev.map((c) => c.id === id ? { ...c, status } : c));
            }}
            users={users}
          />
        </div>
      )}

      {/* ── AI Investigation Insights ────────────────────────────────── */}
      <div className="rounded-xl border border-[#1E2D4A] bg-[#07111f] p-4">
        <p className="text-sm font-bold text-[#E8EEFF] mb-3">AI Investigation Insights</p>
        <InsightsPanel />
      </div>

      {/* New investigation modal */}
      {showNewModal && (
        <NewInvestigationModal
          onClose={() => setShowNewModal(false)}
          onCreated={(id) => {
            setShowNewModal(false);
            router.push(`/investigations/${id}`);
          }}
          riskyApprovals={riskyApprovals}
          users={users}
        />
      )}
    </div>
  );
}
