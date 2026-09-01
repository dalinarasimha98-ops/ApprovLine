'use client';

import { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import type {
  ComplianceOverview,
  FrameworkSummary,
  ControlSummary,
  IssueSummary,
  AttestationSummary,
  DeadlineSummary,
  RecentActivity,
  RiskArea,
  HealthMetric,
  ComplianceTrendPoint,
} from '@/services/compliance';

// ── Types re-exported for sub-components ─────────────────────────────────────

export type { ComplianceOverview, FrameworkSummary, ControlSummary, IssueSummary, AttestationSummary, DeadlineSummary, RecentActivity, RiskArea, HealthMetric, ComplianceTrendPoint };

// ── Helpers ───────────────────────────────────────────────────────────────────

function relDate(iso: string | null | undefined) {
  if (!iso) return '—';
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  return months === 1 ? '1mo ago' : `${months}mo ago`;
}

function shortDate(iso: string | null | undefined) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function scoreColor(score: number) {
  if (score >= 75) return '#10B981';
  if (score >= 60) return '#F59E0B';
  return '#EF4444';
}

function severityBadge(s: string) {
  const map: Record<string, string> = {
    CRITICAL: 'bg-red-100 text-red-700 border-red-200',
    HIGH: 'bg-orange-100 text-orange-700 border-orange-200',
    MEDIUM: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    LOW: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return map[s] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

function statusBadge(s: string) {
  const map: Record<string, string> = {
    OPEN: 'bg-red-100 text-red-700',
    IN_PROGRESS: 'bg-blue-100 text-blue-700',
    RESOLVED: 'bg-green-100 text-green-700',
    ACCEPTED: 'bg-slate-100 text-slate-600',
    DEFERRED: 'bg-yellow-100 text-yellow-700',
    PENDING: 'bg-yellow-100 text-yellow-700',
    COMPLETED: 'bg-green-100 text-green-700',
    OVERDUE: 'bg-red-100 text-red-700',
    REJECTED: 'bg-slate-100 text-slate-600',
    EFFECTIVE: 'bg-green-100 text-green-700',
    PARTIALLY_EFFECTIVE: 'bg-yellow-100 text-yellow-700',
    INEFFECTIVE: 'bg-red-100 text-red-700',
    NOT_ASSESSED: 'bg-slate-100 text-slate-500',
  };
  return map[s] ?? 'bg-slate-100 text-slate-500';
}

function statusLabel(s: string) {
  const map: Record<string, string> = {
    NOT_ASSESSED: 'Not Assessed',
    PARTIALLY_EFFECTIVE: 'Partially Effective',
    IN_PROGRESS: 'In Progress',
  };
  return map[s] ?? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
}

function categoryBadge(cat: string) {
  const map: Record<string, string> = {
    Policy: 'bg-indigo-100 text-indigo-700',
    Assessment: 'bg-violet-100 text-violet-700',
    Issue: 'bg-red-100 text-red-700',
    Attestation: 'bg-green-100 text-green-700',
    Control: 'bg-sky-100 text-sky-700',
    Integration: 'bg-slate-100 text-slate-600',
    Investigation: 'bg-orange-100 text-orange-700',
    Security: 'bg-red-100 text-red-700',
    General: 'bg-slate-100 text-slate-500',
  };
  return map[cat] ?? 'bg-slate-100 text-slate-500';
}

function riskBadge(r: string) {
  const map: Record<string, string> = {
    Critical: 'bg-red-100 text-red-700 border-red-200',
    High: 'bg-orange-100 text-orange-700 border-orange-200',
    Medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
    Low: 'bg-blue-100 text-blue-700 border-blue-200',
  };
  return map[r] ?? 'bg-slate-100 text-slate-500 border-slate-200';
}

function deadlineDaysBadge(days: number) {
  if (days < 0) return 'bg-red-600 text-white';
  if (days <= 14) return 'bg-red-100 text-red-700';
  if (days <= 30) return 'bg-orange-100 text-orange-700';
  if (days <= 60) return 'bg-yellow-100 text-yellow-700';
  return 'bg-slate-100 text-slate-600';
}

function deadlineMonthDay(iso: string) {
  const d = new Date(iso);
  return {
    month: d.toLocaleString('en-US', { month: 'short' }).toUpperCase(),
    day: d.getDate(),
  };
}

function deadlineColor(days: number) {
  if (days < 0) return { bg: 'bg-red-600', text: 'text-white' };
  if (days <= 14) return { bg: 'bg-red-500', text: 'text-white' };
  if (days <= 30) return { bg: 'bg-orange-500', text: 'text-white' };
  if (days <= 60) return { bg: 'bg-yellow-500', text: 'text-white' };
  return { bg: 'bg-indigo-600', text: 'text-white' };
}

// ── Micro-chart: simple SVG line for score trend ─────────────────────────────

function MiniScoreTrend({ points, color = '#2155d9' }: { points: ComplianceTrendPoint[]; color?: string }) {
  if (points.length < 2) {
    return <div className="h-20 flex items-center justify-center text-xs text-slate-400">No trend data yet</div>;
  }
  const scores = points.map((p) => p.score);
  const max = Math.max(...scores, 100);
  const min = Math.min(...scores, 0);
  const range = max - min || 1;
  const w = 280;
  const h = 80;
  const pad = 8;
  const xs = points.map((_, i) => pad + (i / (points.length - 1)) * (w - pad * 2));
  const ys = scores.map((s) => pad + ((max - s) / range) * (h - pad * 2));
  const line = xs.map((x, i) => `${i === 0 ? 'M' : 'L'} ${x} ${ys[i]}`).join(' ');
  const area = `${line} L ${xs[xs.length - 1]} ${h} L ${xs[0]} ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full h-20">
      <defs>
        <linearGradient id="scoreGrad" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={0.25} />
          <stop offset="100%" stopColor={color} stopOpacity={0.02} />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#scoreGrad)" />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      {/* End dot */}
      <circle cx={xs[xs.length - 1]} cy={ys[ys.length - 1]} r={3} fill={color} />
    </svg>
  );
}

// ── Arc gauge (light theme) ────────────────────────────────────────────────

function ArcGauge({ score, label }: { score: number; label: string }) {
  const size = 120;
  const cx = size / 2;
  const sw = 14;
  const r = (size - sw) / 2 - 4;
  const cy = r + sw / 2 + 4;
  const viewH = cy + sw / 2 + 4;
  const color = scoreColor(score);

  const startAngle = 180;
  const sweepAngle = (score / 100) * 180;

  function polar(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function arc(start: number, end: number) {
    const s = polar(start);
    const e = polar(Math.min(end, start + 359.99));
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  const trackPath = arc(startAngle, startAngle + 180);
  const fillPath = sweepAngle > 0.5 ? arc(startAngle, startAngle + sweepAngle) : null;

  return (
    <div className="flex flex-col items-center">
      <svg viewBox={`0 0 ${size} ${viewH.toFixed(1)}`} style={{ width: size, height: viewH }}>
        <path d={trackPath} fill="none" stroke="#E2E8F0" strokeWidth={sw} strokeLinecap="round" />
        {fillPath && <path d={fillPath} fill="none" stroke={color} strokeWidth={sw} strokeLinecap="round" />}
        <text x={cx} y={cy - r * 0.45} textAnchor="middle" dominantBaseline="central" fontSize={22} fontWeight="900" fill="#0F172A">
          {score}%
        </text>
        <text x={cx} y={cy - r * 0.1} textAnchor="middle" dominantBaseline="central" fontSize={10} fill={color} fontWeight="700">
          {label}
        </text>
      </svg>
    </div>
  );
}

// ── Donut chart (light theme) ─────────────────────────────────────────────

function DonutChart({
  segments,
  size = 140,
  strokeWidth = 24,
  center,
  sub,
}: {
  segments: { label: string; value: number; color: string }[];
  size?: number;
  strokeWidth?: number;
  center?: string;
  sub?: string;
}) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  function polar(cx: number, cy: number, r: number, angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(startAngle: number, endAngle: number) {
    const clamped = Math.min(endAngle, startAngle + 359.99);
    const s = polar(cx, cy, r, startAngle);
    const e = polar(cx, cy, r, clamped);
    const large = clamped - startAngle > 180 ? 1 : 0;
    return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y}`;
  }

  if (total === 0) {
    return (
      <div style={{ width: size, height: size }} className="rounded-full border-2 border-slate-100 flex items-center justify-center">
        <span className="text-xs text-slate-400">No data</span>
      </div>
    );
  }

  let currentAngle = 0;
  const arcs = segments.map((seg) => {
    const angle = (seg.value / total) * 360;
    const startAngle = currentAngle;
    currentAngle += angle;
    return { ...seg, startAngle, angle };
  });

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F1F5F9" strokeWidth={strokeWidth} />
        {arcs.map((arc) => (
          <path
            key={arc.label}
            d={describeArc(arc.startAngle, arc.startAngle + arc.angle)}
            fill="none"
            stroke={arc.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
          />
        ))}
      </svg>
      {center && (
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl font-black text-slate-900 leading-none">{center}</p>
          {sub && <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{sub}</p>}
        </div>
      )}
    </div>
  );
}

// ── KPI Card ──────────────────────────────────────────────────────────────────

function KPICard({ title, value, sub, icon, trend, trendLabel, accent = '#2155d9', alert }: {
  title: string;
  value: string | number;
  sub?: React.ReactNode;
  icon: React.ReactNode;
  trend?: number | null;
  trendLabel?: string;
  accent?: string;
  alert?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <span className="text-sm font-black text-slate-500 leading-tight">{title}</span>
        <div className="shrink-0 grid h-9 w-9 place-items-center rounded-xl" style={{ background: `${accent}18` }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
      </div>
      <div>
        <div className="text-3xl font-black text-slate-950 leading-none tabular-nums">{value}</div>
        {alert && <div className="mt-1.5">{alert}</div>}
        {sub && <div className="mt-1 text-xs font-semibold text-slate-500">{sub}</div>}
      </div>
      {trend !== undefined && trend !== null && (
        <div className="flex items-center gap-1 text-xs font-black">
          <span className={trend >= 0 ? 'text-emerald-600' : 'text-red-500'}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </span>
          <span className="font-semibold text-slate-400">{trendLabel ?? 'vs last month'}</span>
        </div>
      )}
    </div>
  );
}

// ── Score KPI (with arc gauge) ────────────────────────────────────────────────

function ScoreKPICard({ score, label, trend }: { score: number; label: string; trend: number | null }) {
  return (
    <div className="flex flex-col gap-1 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <span className="text-sm font-black text-slate-500">Overall Compliance Score</span>
      <div className="flex items-center gap-4">
        <ArcGauge score={score} label={label} />
        <div className="flex flex-col gap-1">
          {trend !== null && (
            <div className="flex items-center gap-1 text-xs font-black">
              <span className={trend >= 0 ? 'text-emerald-600' : 'text-red-500'}>
                {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}pts
              </span>
              <span className="font-semibold text-slate-400">vs last month</span>
            </div>
          )}
          <div className="text-xs font-semibold text-slate-400">
            {score >= 75 ? '✓ Audit ready' : score >= 60 ? '⚠ Review needed' : '✗ Action required'}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Framework row ─────────────────────────────────────────────────────────────

const FW_LOGOS: Record<string, string> = {
  iso27001: '🔒',
  soc2: '🛡️',
  gdpr: '🇪🇺',
  hipaa: '🏥',
  pcidss: '💳',
  nist_csf: '📊',
};

function FrameworkRow({ fw, onView }: { fw: FrameworkSummary; onView: () => void }) {
  const score = fw.score;
  return (
    <tr className="border-t border-slate-100 hover:bg-slate-50 transition-colors cursor-pointer" onClick={onView}>
      <td className="py-3 pl-4 pr-2">
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-base">
            {FW_LOGOS[fw.slug] ?? '📋'}
          </div>
          <span className="text-sm font-black text-slate-800">{fw.name}</span>
        </div>
      </td>
      <td className="py-3 px-2">
        {score === null ? (
          <span className="text-xs font-semibold text-slate-400">Not assessed</span>
        ) : (
          <div className="flex items-center gap-2">
            <div className="w-20 h-1.5 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
            </div>
            <span className="text-sm font-black text-slate-800 tabular-nums">{score}%</span>
          </div>
        )}
      </td>
      <td className="py-3 px-2 text-sm font-semibold text-slate-600 text-right tabular-nums">{fw.controls}</td>
      <td className="py-3 px-2 text-right">
        {fw.openIssues > 0 ? (
          <span className="text-sm font-black text-red-600 tabular-nums">{fw.openIssues}</span>
        ) : (
          <span className="text-sm font-semibold text-slate-400">0</span>
        )}
      </td>
      <td className="py-3 pl-2 pr-4 text-xs font-semibold text-slate-400">{shortDate(fw.lastAssessmentAt)}</td>
    </tr>
  );
}

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = ['Overview', 'Frameworks', 'Controls', 'Policy Center', 'Risk & Issues', 'Attestations', 'Audit Trail'] as const;
type TabId = (typeof TABS)[number];

// ── Overview Tab ──────────────────────────────────────────────────────────────

function OverviewTab({ data, trend, onFrameworkView }: {
  data: ComplianceOverview;
  trend: ComplianceTrendPoint[];
  onFrameworkView: () => void;
}) {
  const cs = data.controlStats;
  const donutSegments = [
    { label: 'Effective', value: cs.effective, color: '#10B981' },
    { label: 'Partially Effective', value: cs.partiallyEffective, color: '#F59E0B' },
    { label: 'Ineffective', value: cs.ineffective, color: '#EF4444' },
    { label: 'Not Assessed', value: cs.notAssessed, color: '#CBD5E1' },
  ];

  return (
    <div className="space-y-5">
      {/* KPI Strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-5">
        <ScoreKPICard score={data.score} label={data.scoreLabel} trend={data.scoreTrend} />
        <KPICard
          title="Frameworks"
          value={data.frameworks.filter((f) => f.isEnabled).length}
          sub={`${data.frameworks.length} configured`}
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>}
          accent="#6366F1"
        />
        <KPICard
          title="Total Controls"
          value={cs.total}
          sub={`${cs.effective} effective`}
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" /></svg>}
          accent="#0EA5E9"
          trend={null}
        />
        <KPICard
          title="Open Issues"
          value={data.openIssues}
          alert={data.highPriorityIssues > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-black text-red-700">
              ⚠ {data.highPriorityIssues} High Priority
            </span>
          ) : null}
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>}
          accent="#EF4444"
          trend={null}
        />
        <KPICard
          title="Upcoming Audits"
          value={data.upcomingAudits}
          sub={data.upcomingDeadlines[0] ? `Next in ${Math.max(0, data.upcomingDeadlines[0].daysRemaining)}d` : 'No upcoming audits'}
          icon={<svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>}
          accent="#8B5CF6"
        />
      </div>

      {/* Main layout */}
      <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:gap-5">
        {/* Left column (flex-1) */}
        <div className="min-w-0 flex-1 space-y-5">
          {/* Row 1: Framework table + Score trend */}
          <div className="grid gap-5 lg:grid-cols-2">
            {/* Framework posture */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-sm font-black text-slate-800">Compliance Posture by Framework</h3>
                <button className="text-xs font-black text-[#2155d9] hover:underline">View all</button>
              </div>
              {data.frameworks.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <p className="text-sm font-semibold text-slate-500">No frameworks configured yet.</p>
                  <p className="mt-1 text-xs text-slate-400">Configure your compliance frameworks to start tracking.</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="pb-2 pl-4 pr-2">Framework</th>
                      <th className="pb-2 px-2">Score</th>
                      <th className="pb-2 px-2 text-right">Controls</th>
                      <th className="pb-2 px-2 text-right">Issues</th>
                      <th className="pb-2 pl-2 pr-4">Last Assessment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.frameworks.slice(0, 6).map((fw) => (
                      <FrameworkRow key={fw.id} fw={fw} onView={onFrameworkView} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Score trend */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-black text-slate-800">Compliance Score Trend</h3>
                <span className="text-xs font-black text-slate-400 bg-slate-100 px-2 py-1 rounded-lg">Last 30 days</span>
              </div>
              {trend.length === 0 ? (
                <div className="h-40 flex flex-col items-center justify-center text-center">
                  <p className="text-sm font-semibold text-slate-500">No trend data yet.</p>
                  <p className="mt-1 text-xs text-slate-400">Compliance evaluations generate trend data over time.</p>
                </div>
              ) : (
                <div>
                  {/* Y labels */}
                  <div className="flex flex-col text-[10px] font-semibold text-slate-400 gap-0 mb-1">
                    {[100, 75, 50, 25, 0].map((v) => (
                      <div key={v} className="flex items-center gap-1">
                        <span className="w-6 text-right tabular-nums">{v}%</span>
                      </div>
                    ))}
                  </div>
                  <MiniScoreTrend points={trend} color="#2155d9" />
                  {/* X labels */}
                  <div className="flex justify-between text-[10px] font-semibold text-slate-400 mt-1">
                    {trend.length > 0 && (
                      <>
                        <span>{trend[0]?.label}</span>
                        <span>{trend[Math.floor(trend.length / 2)]?.label}</span>
                        <span>{trend[trend.length - 1]?.label}</span>
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Risk Areas + Control Status + Recent Activities */}
          <div className="grid gap-5 lg:grid-cols-3">
            {/* Top Risk Areas */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-sm font-black text-slate-800">Top Risk Areas</h3>
                <button className="text-xs font-black text-[#2155d9] hover:underline">View all</button>
              </div>
              {data.topRiskAreas.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm font-semibold text-slate-400">No risk areas identified.</div>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                      <th className="pb-2 pl-4 pr-2">Risk Area</th>
                      <th className="pb-2 px-1">Level</th>
                      <th className="pb-2 px-1 text-right">Issues</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.topRiskAreas.map((r) => (
                      <tr key={r.name} className="border-t border-slate-100">
                        <td className="py-2.5 pl-4 pr-2 text-xs font-black text-slate-700">{r.name}</td>
                        <td className="py-2.5 px-1">
                          <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-black ${riskBadge(r.riskLevel)}`}>
                            {r.riskLevel}
                          </span>
                        </td>
                        <td className="py-2.5 px-1 text-right text-xs font-black text-slate-700 tabular-nums">{r.openIssues}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            {/* Control Status donut */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-black text-slate-800 mb-3">Control Status</h3>
              <div className="flex items-start gap-4">
                <DonutChart
                  segments={donutSegments}
                  size={120}
                  strokeWidth={20}
                  center={String(cs.total)}
                  sub="Total Controls"
                />
                <div className="flex-1 space-y-2 pt-1">
                  {donutSegments.map((seg) => (
                    <div key={seg.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-1.5">
                        <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                        <span className="text-[11px] font-semibold text-slate-600">{seg.label}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="text-xs font-black text-slate-800 tabular-nums">{seg.value}</span>
                        <span className="text-[10px] text-slate-400">
                          ({cs.total > 0 ? Math.round((seg.value / cs.total) * 100) : 0}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {cs.total > 0 && (
                <a href="/trust/compliance#controls" className="mt-3 flex items-center justify-center text-xs font-black text-[#2155d9] hover:underline">
                  View all controls →
                </a>
              )}
            </div>

            {/* Recent Compliance Activities */}
            <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <h3 className="text-sm font-black text-slate-800">Recent Activities</h3>
                <button className="text-xs font-black text-[#2155d9] hover:underline">View all</button>
              </div>
              {data.recentActivities.length === 0 ? (
                <div className="px-4 py-6 text-center text-sm font-semibold text-slate-400">No recent activities.</div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.recentActivities.slice(0, 6).map((a) => (
                    <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                      <div className="mt-0.5 shrink-0">
                        <div className="h-7 w-7 rounded-lg bg-slate-100 flex items-center justify-center">
                          <svg className="h-3.5 w-3.5 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" />
                          </svg>
                        </div>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-700 leading-snug">{a.label}</p>
                        <div className="mt-1 flex items-center gap-2">
                          <span className="text-[10px] font-semibold text-slate-400">{relDate(a.createdAt)}</span>
                          <span className={`inline-block rounded-full px-1.5 py-0.5 text-[10px] font-black ${categoryBadge(a.category)}`}>{a.category}</span>
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>

          {/* Compliance Health Overview strip */}
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="px-5 pt-4 pb-2">
              <h3 className="text-sm font-black text-slate-800">Compliance Health Overview</h3>
            </div>
            {data.healthMetrics.length === 0 ? (
              <div className="px-5 py-4 text-sm text-slate-400">No health data available.</div>
            ) : (
              <div className="grid grid-cols-2 divide-x divide-y divide-slate-100 sm:grid-cols-3 lg:grid-cols-6">
                {data.healthMetrics.map((m) => (
                  <div key={m.label} className="flex flex-col gap-1 p-4">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{m.label}</span>
                    <span className="text-2xl font-black text-slate-900 tabular-nums leading-none">{m.value}</span>
                    {m.delta !== null && (
                      <span className={`text-[10px] font-black ${m.delta >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                        {m.delta >= 0 ? `↑ ${m.delta}` : `↓ ${Math.abs(m.delta)}`} this month
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Sidebar: Upcoming Deadlines */}
        <aside className="w-full shrink-0 xl:w-72 xl:sticky xl:top-6">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <h3 className="text-sm font-black text-slate-800">Upcoming Deadlines</h3>
              <button className="text-xs font-black text-[#2155d9] hover:underline">View all</button>
            </div>
            {data.upcomingDeadlines.length === 0 ? (
              <div className="px-4 py-8 text-center">
                <p className="text-sm font-semibold text-slate-500">No upcoming deadlines.</p>
                <p className="mt-1 text-xs text-slate-400">Configure frameworks to track audit deadlines.</p>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {data.upcomingDeadlines.map((d) => {
                  const { month, day } = deadlineMonthDay(d.dueDate);
                  const { bg, text } = deadlineColor(d.daysRemaining);
                  return (
                    <li key={d.id} className="flex items-start gap-3 px-4 py-3">
                      <div className={`shrink-0 flex flex-col items-center justify-center rounded-lg ${bg} ${text} w-11 h-11`}>
                        <span className="text-[9px] font-black uppercase">{month}</span>
                        <span className="text-lg font-black leading-none">{day}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-black text-slate-800 leading-snug">{d.title}</p>
                        {d.frameworkName && <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{d.frameworkName}</p>}
                        <div className="mt-1">
                          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${deadlineDaysBadge(d.daysRemaining)}`}>
                            {d.daysRemaining < 0 ? 'Overdue' : `${d.daysRemaining} days left`}
                          </span>
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Evidence + Approval Coverage */}
          <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="text-sm font-black text-slate-800 mb-3">Coverage Metrics</h3>
            <div className="space-y-3">
              {[
                { label: 'Evidence Coverage', value: data.evidenceCoverage, color: '#10B981' },
                { label: 'Approval Compliance', value: data.approvalCompliance, color: '#2155d9' },
              ].map(({ label, value, color }) => (
                <div key={label}>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-black text-slate-600">{label}</span>
                    <span className="text-xs font-black tabular-nums" style={{ color }}>{value}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Frameworks Tab ────────────────────────────────────────────────────────────

function FrameworksTab({ initial }: { initial: FrameworkSummary[] }) {
  const [frameworks, setFrameworks] = useState(initial);
  const [loading, setLoading] = useState(false);

  async function refresh() {
    setLoading(true);
    try {
      const res = await fetch('/api/compliance/frameworks');
      if (res.ok) {
        const data = await res.json();
        setFrameworks(data.frameworks);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { refresh(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white">Compliance Frameworks</h2>
        <button onClick={refresh} disabled={loading} className="text-xs font-black text-[#2155d9] bg-[#2155d9]/10 px-3 py-1.5 rounded-lg hover:bg-[#2155d9]/20 transition disabled:opacity-50">
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {frameworks.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">No compliance frameworks configured yet.</p>
          <p className="mt-1 text-xs text-slate-400">Use the seed API to configure default frameworks, or contact your administrator.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {frameworks.map((fw) => {
            const score = fw.score;
            return (
              <div key={fw.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 hover:shadow-md transition">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-100 text-xl">
                      {FW_LOGOS[fw.slug] ?? '📋'}
                    </div>
                    <div>
                      <h3 className="text-sm font-black text-slate-900">{fw.name}</h3>
                      <span className={`text-[10px] font-black ${fw.isEnabled ? 'text-emerald-600' : 'text-slate-400'}`}>
                        {fw.isEnabled ? '● Active' : '○ Inactive'}
                      </span>
                    </div>
                  </div>
                  {score !== null && (
                    <span className="text-2xl font-black tabular-nums" style={{ color: scoreColor(score) }}>{score}%</span>
                  )}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <div className="text-lg font-black text-slate-900 tabular-nums">{fw.controls}</div>
                    <div className="text-[10px] font-semibold text-slate-400">Controls</div>
                  </div>
                  <div>
                    <div className="text-lg font-black text-red-600 tabular-nums">{fw.openIssues}</div>
                    <div className="text-[10px] font-semibold text-slate-400">Open Issues</div>
                  </div>
                  <div>
                    <div className="text-[11px] font-black text-slate-600">{shortDate(fw.lastAssessmentAt)}</div>
                    <div className="text-[10px] font-semibold text-slate-400">Last Review</div>
                  </div>
                </div>
                {score !== null && (
                  <div className="mt-3 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, backgroundColor: scoreColor(score) }} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Controls Tab ──────────────────────────────────────────────────────────────

function ControlsTab() {
  const [controls, setControls] = useState<ControlSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/compliance/controls')
      .then((r) => r.json())
      .then((d) => setControls(d.controls ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function updateStatus(controlId: string, status: string) {
    setUpdating(controlId);
    try {
      await fetch('/api/compliance/controls', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlId, status }),
      });
      setControls((cs) => cs.map((c) => c.id === controlId ? { ...c, status } : c));
    } finally {
      setUpdating(null);
    }
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400 shadow-sm">Loading controls…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white">Compliance Controls</h2>
        <span className="text-xs font-semibold text-slate-400">{controls.length} controls</span>
      </div>
      {controls.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">No controls configured yet.</p>
          <p className="mt-1 text-xs text-slate-400">Controls are added automatically when you configure compliance frameworks.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 pl-4 pr-2">Control</th>
                  <th className="py-3 px-2">Framework</th>
                  <th className="py-3 px-2">Category</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2">Issues</th>
                  <th className="py-3 pl-2 pr-4">Last Tested</th>
                  <th className="py-3 pl-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {controls.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 pl-4 pr-2">
                      <div>
                        <span className="text-xs font-black text-slate-400 font-mono">{c.controlRef}</span>
                        <p className="text-xs font-black text-slate-800 mt-0.5">{c.name}</p>
                      </div>
                    </td>
                    <td className="py-3 px-2">
                      <span className="text-xs font-semibold text-slate-600">{c.frameworkName}</span>
                    </td>
                    <td className="py-3 px-2">
                      <span className="text-xs font-semibold text-slate-500">{c.category ?? '—'}</span>
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${statusBadge(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-xs font-black text-slate-700 tabular-nums">{c.openIssues > 0 ? c.openIssues : '—'}</td>
                    <td className="py-3 pl-2 pr-4 text-xs font-semibold text-slate-400">{shortDate(c.lastTestedAt)}</td>
                    <td className="py-3 pl-2 pr-4">
                      <select
                        disabled={updating === c.id}
                        value={c.status}
                        onChange={(e) => updateStatus(c.id, e.target.value)}
                        className="text-[10px] font-black rounded-lg border border-slate-200 bg-white px-1.5 py-1 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#2155d9] disabled:opacity-50"
                      >
                        <option value="NOT_ASSESSED">Not Assessed</option>
                        <option value="EFFECTIVE">Effective</option>
                        <option value="PARTIALLY_EFFECTIVE">Partially Effective</option>
                        <option value="INEFFECTIVE">Ineffective</option>
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Policy Center Tab ─────────────────────────────────────────────────────────

function PolicyCenterTab() {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white">Policy Center</h2>
        <a href="/playbooks" className="text-xs font-black text-[#2155d9] bg-[#2155d9]/10 px-3 py-1.5 rounded-lg hover:bg-[#2155d9]/20 transition">
          Open Playbook AI →
        </a>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-50 flex items-center justify-center">
              <svg className="h-5 w-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">Playbook AI</h3>
              <p className="text-xs font-semibold text-slate-500">Policy rules & compliance guidance</p>
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-600 leading-relaxed">
            Playbook AI evaluates approval decisions against your uploaded policy documents, extracting compliance rules and checking required approvers, thresholds, and evidence.
          </p>
          <div className="mt-4 flex gap-2">
            <a href="/playbooks" className="inline-flex items-center gap-1.5 rounded-xl bg-[#2155d9] px-3 py-1.5 text-xs font-black text-white hover:bg-[#1a44be] transition">
              View Playbooks
            </a>
            <a href="/playbooks" className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition">
              Upload Policy
            </a>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-10 w-10 rounded-xl bg-violet-50 flex items-center justify-center">
              <svg className="h-5 w-5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" />
              </svg>
            </div>
            <div>
              <h3 className="text-sm font-black text-slate-900">AI Copilot</h3>
              <p className="text-xs font-semibold text-slate-500">Compliance intelligence assistant</p>
            </div>
          </div>
          <p className="text-xs font-semibold text-slate-600 leading-relaxed">
            Ask the AI Copilot compliance questions — missing evidence, failing controls, audit readiness — using real ApprovLine data from your workspace.
          </p>
          <div className="mt-4 flex gap-2">
            <a href="/copilot?q=What+is+our+compliance+score%3F" className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-700 transition">
              Ask Compliance Question
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h3 className="text-sm font-black text-slate-800 mb-2">Policy → Control → Approval → Evidence Flow</h3>
        <p className="text-xs font-semibold text-slate-500 mb-4">How ApprovLine connects policy requirements to real approval evidence.</p>
        <div className="flex flex-wrap items-center gap-2 text-xs font-black">
          {['Policy Upload', 'Rule Extraction', 'Approval Review', 'Evidence Capture', 'Compliance Score', 'Issue Creation', 'Remediation', 'Audit Ready'].map((step, i, arr) => (
            <>
              <span key={step} className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-slate-700">
                <span className="text-[10px] font-black text-[#2155d9]">{i + 1}</span>
                {step}
              </span>
              {i < arr.length - 1 && <span className="text-slate-300" key={`arrow-${i}`}>→</span>}
            </>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Risk & Issues Tab ─────────────────────────────────────────────────────────

function RiskIssuesTab() {
  const [issues, setIssues] = useState<IssueSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ status?: string; severity?: string }>({});
  const [updating, setUpdating] = useState<string | null>(null);

  const fetchIssues = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams();
    if (filter.status) params.set('status', filter.status);
    if (filter.severity) params.set('severity', filter.severity);
    try {
      const res = await fetch(`/api/compliance/issues?${params}`);
      if (res.ok) {
        const data = await res.json();
        setIssues(data.issues ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);

  async function updateStatus(issueId: string, status: string) {
    setUpdating(issueId);
    try {
      await fetch('/api/compliance/issues', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ issueId, status }),
      });
      await fetchIssues();
    } finally {
      setUpdating(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-black text-white">Risk & Issues</h2>
        <div className="flex items-center gap-2">
          <select
            value={filter.severity ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, severity: e.target.value || undefined }))}
            className="text-xs font-black rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#2155d9]"
          >
            <option value="">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
          </select>
          <select
            value={filter.status ?? ''}
            onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value || undefined }))}
            className="text-xs font-black rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#2155d9]"
          >
            <option value="">All Statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In Progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="ACCEPTED">Accepted</option>
            <option value="DEFERRED">Deferred</option>
          </select>
          <Link href="/investigations" className="text-xs font-black text-[#2155d9] bg-[#2155d9]/10 px-3 py-1.5 rounded-lg hover:bg-[#2155d9]/20 transition">
            Investigation Center →
          </Link>
        </div>
      </div>
      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400 shadow-sm">Loading issues…</div>
      ) : issues.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">No compliance issues found.</p>
          <p className="mt-1 text-xs text-slate-400">Issues are created when compliance violations are detected.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 pl-4 pr-2">Issue</th>
                  <th className="py-3 px-2">Severity</th>
                  <th className="py-3 px-2">Framework</th>
                  <th className="py-3 px-2">Control</th>
                  <th className="py-3 px-2">Owner</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2">Due</th>
                  <th className="py-3 pl-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {issues.map((issue) => (
                  <tr key={issue.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 pl-4 pr-2 max-w-xs">
                      <p className="text-xs font-black text-slate-800 leading-snug">{issue.title}</p>
                      {issue.description && <p className="text-[10px] font-semibold text-slate-400 mt-0.5 line-clamp-1">{issue.description}</p>}
                    </td>
                    <td className="py-3 px-2">
                      <span className={`inline-block rounded-full border px-1.5 py-0.5 text-[10px] font-black ${severityBadge(issue.severity)}`}>
                        {issue.severity}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-600">{issue.frameworkName ?? '—'}</td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-600">{issue.controlName ?? '—'}</td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-600">{issue.owner ?? '—'}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${statusBadge(issue.status)}`}>
                        {statusLabel(issue.status)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-400">{shortDate(issue.dueDate)}</td>
                    <td className="py-3 pl-2 pr-4">
                      {issue.status !== 'RESOLVED' && (
                        <button
                          disabled={updating === issue.id}
                          onClick={() => updateStatus(issue.id, 'RESOLVED')}
                          className="text-[10px] font-black text-emerald-700 bg-emerald-50 hover:bg-emerald-100 px-2 py-1 rounded-lg transition disabled:opacity-50"
                        >
                          Resolve
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Attestations Tab ──────────────────────────────────────────────────────────

function AttestationsTab() {
  const [attestations, setAttestations] = useState<AttestationSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [completing, setCompleting] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/compliance/attestations')
      .then((r) => r.json())
      .then((d) => setAttestations(d.attestations ?? []))
      .finally(() => setLoading(false));
  }, []);

  async function complete(id: string) {
    setCompleting(id);
    try {
      await fetch('/api/compliance/attestations', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attestationId: id }),
      });
      setAttestations((atts) => atts.map((a) => a.id === id ? { ...a, status: 'COMPLETED', completedAt: new Date().toISOString() } : a));
    } finally {
      setCompleting(null);
    }
  }

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400 shadow-sm">Loading attestations…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white">Attestations</h2>
        <span className="text-xs font-semibold text-slate-400">{attestations.length} attestations</span>
      </div>
      {attestations.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <p className="text-sm font-semibold text-slate-500">No attestations configured.</p>
          <p className="mt-1 text-xs text-slate-400">Attestations are periodic sign-offs for compliance controls.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 pl-4 pr-2">Attestation</th>
                  <th className="py-3 px-2">Policy</th>
                  <th className="py-3 px-2">Control</th>
                  <th className="py-3 px-2">Owner</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 px-2">Due Date</th>
                  <th className="py-3 px-2">Completed</th>
                  <th className="py-3 pl-2 pr-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {attestations.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 pl-4 pr-2">
                      <p className="text-xs font-black text-slate-800">{a.title}</p>
                    </td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-600">{a.policy ?? '—'}</td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-600">{a.controlName ?? '—'}</td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-600">{a.owner ?? '—'}</td>
                    <td className="py-3 px-2">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${statusBadge(a.status)}`}>
                        {statusLabel(a.status)}
                      </span>
                    </td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-400">{shortDate(a.dueDate)}</td>
                    <td className="py-3 px-2 text-xs font-semibold text-slate-400">{shortDate(a.completedAt)}</td>
                    <td className="py-3 pl-2 pr-4">
                      {a.status === 'PENDING' && (
                        <button
                          disabled={completing === a.id}
                          onClick={() => complete(a.id)}
                          className="text-[10px] font-black text-[#2155d9] bg-[#2155d9]/10 hover:bg-[#2155d9]/20 px-2 py-1 rounded-lg transition disabled:opacity-50"
                        >
                          {completing === a.id ? 'Completing…' : 'Complete'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Audit Trail Tab ───────────────────────────────────────────────────────────

type AuditEntry = { id: string; action: string; actorUserId: string | null; approvalRecordId: string | null; metadata: Record<string, unknown> | null; createdAt: string };

function AuditTrailTab() {
  const [logs, setLogs] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch('/dashboard/audit')
      .then(() => {})
      .catch(() => {});
    // Fetch via audit API (existing audit infrastructure)
    const abortController = new AbortController();
    fetch('/api/analytics/compliance?limit=50', { signal: abortController.signal })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.records) {
          setLogs(d.records.map((r: Record<string, unknown>) => ({
            id: r.id as string,
            action: 'APPROVAL_COMPLIANCE_RECORD',
            actorUserId: r.approverUserId as string | null,
            approvalRecordId: r.id as string,
            metadata: r as Record<string, unknown>,
            createdAt: r.createdAt as string,
          })));
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
    return () => abortController.abort();
  }, []);

  if (loading) return <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center text-sm font-semibold text-slate-400 shadow-sm">Loading audit trail…</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-black text-white">Audit Trail</h2>
        <div className="flex items-center gap-2">
          <a href="/dashboard/audit" className="text-xs font-black text-[#2155d9] bg-[#2155d9]/10 px-3 py-1.5 rounded-lg hover:bg-[#2155d9]/20 transition">
            Full Audit Log →
          </a>
          <a href="/api/export/approvals?format=csv" className="text-xs font-black text-slate-700 border border-slate-200 bg-white px-3 py-1.5 rounded-lg hover:bg-slate-50 transition">
            Export CSV
          </a>
        </div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-xs font-semibold text-slate-500 mb-4">
          The Audit Trail is powered by the ApprovLine audit log. All compliance-relevant actions — policy uploads, evaluations, control updates, issue resolutions, attestations — are captured and accessible in the full audit log.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
          {[
            { label: 'Policy Events', href: '/playbooks', icon: '📄', desc: 'Policy uploads, indexing, archiving' },
            { label: 'Evaluation Events', href: '/playbooks', icon: '✓', desc: 'Compliance evaluations run' },
            { label: 'Approval Records', href: '/dashboard/approvals', icon: '✍️', desc: 'Approvals captured and classified' },
            { label: 'Investigation Events', href: '/investigations', icon: '🔍', desc: 'Cases opened and resolved' },
            { label: 'Full Audit Log', href: '/dashboard/audit', icon: '📋', desc: 'All platform events with actor' },
            { label: 'Export Evidence', href: '/api/export/approvals?format=csv', icon: '⬇️', desc: 'Download approval evidence CSV' },
          ].map((item) => (
            <a key={item.label} href={item.href} className="flex items-start gap-3 rounded-xl border border-slate-200 p-3 hover:border-[#2155d9]/30 hover:bg-slate-50 transition">
              <span className="text-xl">{item.icon}</span>
              <div>
                <p className="text-xs font-black text-slate-800">{item.label}</p>
                <p className="text-[10px] font-semibold text-slate-400">{item.desc}</p>
              </div>
            </a>
          ))}
        </div>
      </div>
      {logs.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2">
            <h3 className="text-sm font-black text-slate-800">Recent Compliance Records</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 pl-4 pr-2">Subject</th>
                  <th className="py-3 px-2">Compliance Score</th>
                  <th className="py-3 px-2">Status</th>
                  <th className="py-3 pl-2 pr-4">Date</th>
                </tr>
              </thead>
              <tbody>
                {logs.slice(page * 20, page * 20 + 20).map((log) => {
                  const meta = log.metadata as Record<string, unknown>;
                  return (
                    <tr key={log.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                      <td className="py-3 pl-4 pr-2">
                        <p className="text-xs font-black text-slate-800 line-clamp-1">{String(meta?.subject ?? 'Approval record')}</p>
                        {meta?.department != null && <p className="text-[10px] font-semibold text-slate-400">{String(meta.department)}</p>}
                      </td>
                      <td className="py-3 px-2">
                        {typeof meta?.complianceScore === 'number' ? (
                          <span className="text-xs font-black tabular-nums" style={{ color: scoreColor(meta.complianceScore as number) }}>
                            {meta.complianceScore}%
                          </span>
                        ) : <span className="text-xs text-slate-400">—</span>}
                      </td>
                      <td className="py-3 px-2">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${statusBadge(String(meta?.status ?? 'PENDING'))}`}>
                          {String(meta?.status ?? 'Pending')}
                        </span>
                      </td>
                      <td className="py-3 pl-2 pr-4 text-xs font-semibold text-slate-400">{relDate(log.createdAt)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {logs.length > 20 && (
            <div className="flex justify-center gap-3 p-3 border-t border-slate-100">
              <button disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="text-xs font-black text-[#2155d9] disabled:opacity-40">← Previous</button>
              <span className="text-xs font-semibold text-slate-400">{page + 1} / {Math.ceil(logs.length / 20)}</span>
              <button disabled={(page + 1) * 20 >= logs.length} onClick={() => setPage((p) => p + 1)} className="text-xs font-black text-[#2155d9] disabled:opacity-40">Next →</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main Shell ────────────────────────────────────────────────────────────────

type Props = {
  initialData: ComplianceOverview;
  trendPoints: ComplianceTrendPoint[];
  orgId: string;
};

export function ComplianceHubShell({ initialData, trendPoints }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('Overview');

  const handleFrameworkView = useCallback(() => {
    setActiveTab('Frameworks');
  }, []);

  return (
    <div>
      {/* Tab navigation */}
      <div className="mb-5 flex overflow-x-auto border-b border-white/[0.08] pb-0 gap-0">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`shrink-0 border-b-2 px-4 py-2.5 text-sm font-black transition-all ${
              activeTab === tab
                ? 'border-[#2155d9] text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'Overview' && (
        <OverviewTab
          data={initialData}
          trend={trendPoints}
          onFrameworkView={handleFrameworkView}
        />
      )}
      {activeTab === 'Frameworks' && <FrameworksTab initial={initialData.frameworks} />}
      {activeTab === 'Controls' && <ControlsTab />}
      {activeTab === 'Policy Center' && <PolicyCenterTab />}
      {activeTab === 'Risk & Issues' && <RiskIssuesTab />}
      {activeTab === 'Attestations' && <AttestationsTab />}
      {activeTab === 'Audit Trail' && <AuditTrailTab />}
    </div>
  );
}
