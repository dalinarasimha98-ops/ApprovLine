'use client';

import { useState, useEffect, useCallback } from 'react';
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
  ComplianceWorkspace,
  ActionItem,
  WorkQueueItem,
  PolicyDocStatus,
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

// ── Framework logos ───────────────────────────────────────────────────────────

const FW_LOGOS: Record<string, string> = {
  iso27001: '🔒',
  soc2: '🛡️',
  gdpr: '🇪🇺',
  hipaa: '🏥',
  pcidss: '💳',
  nist_csf: '📊',
};

// ── Tab definitions ───────────────────────────────────────────────────────────

const TABS = ['Overview', 'Frameworks', 'Controls', 'Policy Center', 'Risk & Issues', 'Attestations', 'Audit Trail'] as const;
type TabId = (typeof TABS)[number];

// ── Action Item severity helpers ──────────────────────────────────────────────

function actionSeverityStyles(severity: ActionItem['severity']) {
  switch (severity) {
    case 'critical': return { border: 'border-red-300', bg: 'bg-red-50', badge: 'bg-red-600 text-white', icon: 'text-red-600', count: 'text-red-700' };
    case 'high': return { border: 'border-orange-300', bg: 'bg-orange-50', badge: 'bg-orange-500 text-white', icon: 'text-orange-600', count: 'text-orange-700' };
    case 'medium': return { border: 'border-yellow-300', bg: 'bg-yellow-50', badge: 'bg-yellow-500 text-white', icon: 'text-yellow-700', count: 'text-yellow-700' };
    default: return { border: 'border-blue-200', bg: 'bg-blue-50', badge: 'bg-blue-500 text-white', icon: 'text-blue-600', count: 'text-blue-700' };
  }
}

function actionItemIcon(type: ActionItem['type']) {
  switch (type) {
    case 'high_risk_approvals':
      return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>;
    case 'evidence_gaps':
      return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25M9 16.5v.75m3-3v3M15 12v5.25m-4.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" /></svg>;
    case 'policy_acknowledgements':
      return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" /></svg>;
    case 'overdue_issues':
      return <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
  }
}

function priorityBadge(p: WorkQueueItem['priority']) {
  switch (p) {
    case 'High': return 'bg-red-100 text-red-700';
    case 'Medium': return 'bg-yellow-100 text-yellow-700';
    default: return 'bg-slate-100 text-slate-600';
  }
}

function policyStateStyles(state: PolicyDocStatus['state']) {
  switch (state) {
    case 'compliant': return { dot: 'bg-emerald-500', text: 'text-emerald-700' };
    case 'review_required': return { dot: 'bg-orange-500', text: 'text-orange-700' };
    case 'violations': return { dot: 'bg-red-500', text: 'text-red-700' };
    case 'indexing': return { dot: 'bg-blue-400 animate-pulse', text: 'text-blue-600' };
    case 'archived': return { dot: 'bg-slate-300', text: 'text-slate-500' };
  }
}

// ── Overview Tab (operational workspace) ──────────────────────────────────────

function OverviewTab({ data, workspace, onTabChange }: {
  data: ComplianceOverview;
  workspace: ComplianceWorkspace;
  onTabChange: (tab: TabId) => void;
}) {
  const scoreCol = scoreColor(data.score);

  return (
    <div className="space-y-5">

      {/* ── Section 1: Compliance Posture ─────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm px-5 py-4">
        <div className="flex flex-wrap items-center gap-5">
          {/* Score circle */}
          <div className="flex items-center gap-3 shrink-0">
            <div className="relative flex h-14 w-14 items-center justify-center rounded-full border-4" style={{ borderColor: scoreCol }}>
              <span className="text-lg font-black tabular-nums" style={{ color: scoreCol }}>{data.score}</span>
            </div>
            <div>
              <p className="text-xs font-black text-slate-500 uppercase tracking-wider">Compliance Score</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <span className="text-sm font-black" style={{ color: scoreCol }}>{data.scoreLabel}</span>
                {data.scoreTrend !== null && (
                  <span className={`text-xs font-black ${data.scoreTrend >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
                    {data.scoreTrend >= 0 ? `↑${data.scoreTrend}pts` : `↓${Math.abs(data.scoreTrend)}pts`}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="h-10 w-px bg-slate-200 shrink-0 hidden sm:block" />

          {/* 4 key stats */}
          <div className="flex flex-wrap gap-x-6 gap-y-2 flex-1">
            {[
              { label: 'Active Frameworks', value: data.frameworks.filter(f => f.isEnabled).length },
              { label: 'Total Controls', value: data.controlStats.total },
              { label: 'Open Issues', value: data.openIssues, alert: data.highPriorityIssues > 0 },
              { label: 'Evidence Coverage', value: `${data.evidenceCoverage}%` },
            ].map(({ label, value, alert }) => (
              <div key={label} className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</span>
                <span className={`text-xl font-black tabular-nums leading-none mt-0.5 ${alert ? 'text-red-600' : 'text-slate-900'}`}>{value}</span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            <a
              href="/api/export/approvals?format=csv"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" /></svg>
              Export
            </a>
            <a
              href="/dashboard/audit-log"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>
              Audit Log
            </a>
          </div>
        </div>
      </div>

      {/* ── Section 2: Action Required ────────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-900">Action Required</h2>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Items that require your attention today</p>
          </div>
          {workspace.actionItems.length > 0 && (
            <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-red-600 text-[11px] font-black text-white">
              {workspace.actionItems.length}
            </span>
          )}
        </div>

        {workspace.actionItems.length === 0 ? (
          <div className="px-5 py-8 flex flex-col items-center text-center gap-2">
            <div className="h-10 w-10 rounded-full bg-emerald-100 flex items-center justify-center">
              <svg className="h-5 w-5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <p className="text-sm font-black text-slate-700">All clear</p>
            <p className="text-xs font-semibold text-slate-400">No compliance actions require attention right now.</p>
          </div>
        ) : (
          <div className="grid gap-3 p-4 sm:grid-cols-2 xl:grid-cols-4">
            {workspace.actionItems.map((item) => {
              const s = actionSeverityStyles(item.severity);
              return (
                <div key={item.type} className={`rounded-xl border ${s.border} ${s.bg} p-4 flex flex-col gap-3`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className={`shrink-0 ${s.icon}`}>{actionItemIcon(item.type)}</div>
                    <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${s.badge}`}>
                      {item.severity}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p className="text-xs font-black text-slate-900 leading-snug">{item.title}</p>
                    <p className="mt-1 text-[11px] font-semibold text-slate-600 leading-snug">{item.subtitle}</p>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-2xl font-black tabular-nums ${s.count}`}>{item.count}</span>
                    <a href={item.href} className="inline-flex items-center gap-1 rounded-lg bg-white border border-white/80 px-2.5 py-1 text-[11px] font-black text-slate-800 hover:bg-slate-50 transition shadow-sm">
                      {item.actionLabel} →
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Section 3: My Compliance Work ────────────────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-900">My Compliance Work</h2>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Your active compliance tasks across frameworks, controls, and attestations</p>
          </div>
          <button
            onClick={() => onTabChange('Attestations')}
            className="text-xs font-black text-[#2155d9] hover:underline"
          >
            View All →
          </button>
        </div>

        {workspace.workQueue.length === 0 ? (
          <div className="px-5 py-6 text-center">
            <p className="text-sm font-semibold text-slate-500">No active compliance work assigned.</p>
            <p className="mt-1 text-xs text-slate-400">Tasks appear when attestations, controls, or issues require your attention.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 pl-5 pr-3">Item</th>
                  <th className="py-3 px-3">Owner</th>
                  <th className="py-3 px-3">Priority</th>
                  <th className="py-3 px-3">Due</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 pl-3 pr-5">Action</th>
                </tr>
              </thead>
              <tbody>
                {workspace.workQueue.map((item) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 pl-5 pr-3 max-w-xs">
                      <p className="text-xs font-black text-slate-800 leading-snug">{item.title}</p>
                      {item.subtitle && <p className="text-[10px] font-semibold text-slate-400 mt-0.5">{item.subtitle}</p>}
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold text-slate-600">{item.owner ?? '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${priorityBadge(item.priority)}`}>
                        {item.priority}
                      </span>
                    </td>
                    <td className="py-3 px-3">
                      {item.dueLabel ? (
                        <span className={`text-xs font-black ${item.dueUrgent ? 'text-red-600' : 'text-slate-500'}`}>
                          {item.dueLabel}
                        </span>
                      ) : <span className="text-xs text-slate-400">—</span>}
                    </td>
                    <td className="py-3 px-3">
                      {item.status && (
                        <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${statusBadge(item.status)}`}>
                          {statusLabel(item.status)}
                        </span>
                      )}
                    </td>
                    <td className="py-3 pl-3 pr-5">
                      <a href={item.href} className="text-[11px] font-black text-[#2155d9] hover:underline whitespace-nowrap">
                        {item.actionLabel} →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 4: Controls Requiring Attention ───────────────────────── */}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-slate-100">
          <div>
            <h2 className="text-sm font-black text-slate-900">Controls Requiring Attention</h2>
            <p className="text-[11px] font-semibold text-slate-400 mt-0.5">Ineffective and partially effective controls that need remediation</p>
          </div>
          <button
            onClick={() => onTabChange('Controls')}
            className="text-xs font-black text-[#2155d9] hover:underline"
          >
            View All Controls →
          </button>
        </div>

        {workspace.topControls.length === 0 ? (
          <div className="px-5 py-6 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-emerald-100 flex items-center justify-center shrink-0">
              <svg className="h-4 w-4 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
            </div>
            <div>
              <p className="text-sm font-black text-slate-700">All controls are effective</p>
              <p className="text-xs font-semibold text-slate-400">No control remediation is required at this time.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  <th className="py-3 pl-5 pr-3">Control</th>
                  <th className="py-3 px-3">Framework</th>
                  <th className="py-3 px-3">Owner</th>
                  <th className="py-3 px-3">Status</th>
                  <th className="py-3 px-3">Last Tested</th>
                  <th className="py-3 pl-3 pr-5">Action</th>
                </tr>
              </thead>
              <tbody>
                {workspace.topControls.map((c) => (
                  <tr key={c.id} className="border-t border-slate-100 hover:bg-slate-50 transition-colors">
                    <td className="py-3 pl-5 pr-3">
                      <p className="text-xs font-black text-slate-800">{c.name}</p>
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold text-slate-600">{c.frameworkName ?? '—'}</td>
                    <td className="py-3 px-3 text-xs font-semibold text-slate-600">{c.owner ?? '—'}</td>
                    <td className="py-3 px-3">
                      <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-black ${statusBadge(c.status)}`}>
                        {statusLabel(c.status)}
                      </span>
                    </td>
                    <td className="py-3 px-3 text-xs font-semibold text-slate-400">
                      {c.lastTestedAt ? relDate(c.lastTestedAt) : '—'}
                    </td>
                    <td className="py-3 pl-3 pr-5">
                      <a href={c.href} className="text-[11px] font-black text-[#2155d9] hover:underline">
                        Update Status →
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 5: 4-column grid ──────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

        {/* Risk & Issues */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-800">Risk &amp; Issues</h3>
            <button onClick={() => onTabChange('Risk & Issues')} className="text-[11px] font-black text-[#2155d9] hover:underline">
              View all
            </button>
          </div>
          {workspace.recentIssues.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs font-semibold text-slate-400">No open compliance issues.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {workspace.recentIssues.slice(0, 5).map((issue) => (
                <li key={issue.id} className="px-4 py-3 flex items-start gap-2.5">
                  <div className="shrink-0 mt-0.5">
                    <div className={`h-1.5 w-1.5 rounded-full mt-1 ${issue.severity === 'CRITICAL' ? 'bg-red-500' : issue.severity === 'HIGH' ? 'bg-orange-500' : 'bg-yellow-500'}`} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-800 leading-snug line-clamp-2">{issue.title}</p>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span className={`inline-block rounded-full border px-1 py-0.5 text-[9px] font-black ${severityBadge(issue.severity)}`}>
                        {issue.severity}
                      </span>
                      {issue.frameworkName && (
                        <span className="text-[9px] font-semibold text-slate-400">{issue.frameworkName}</span>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Policy Status */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-800">Policy Status</h3>
            <a href="/playbooks" className="text-[11px] font-black text-[#2155d9] hover:underline">Open Playbooks</a>
          </div>
          {workspace.policyDocs.length === 0 ? (
            <div className="px-4 py-5 text-center">
              <p className="text-xs font-semibold text-slate-400">No policy documents uploaded.</p>
              <a href="/playbooks" className="mt-2 inline-block text-[11px] font-black text-[#2155d9] hover:underline">Upload policy →</a>
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {workspace.policyDocs.slice(0, 5).map((doc) => {
                const s = policyStateStyles(doc.state);
                return (
                  <li key={doc.id} className="px-4 py-3 flex items-center gap-2.5">
                    <div className={`h-2 w-2 rounded-full shrink-0 ${s.dot}`} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-slate-800 truncate">{doc.name}</p>
                      <p className={`text-[10px] font-semibold ${s.text}`}>{doc.detail}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* Evidence Health */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm p-4">
          <h3 className="text-xs font-black text-slate-800 mb-3">Evidence Health</h3>
          <div className="space-y-3.5">
            {[
              { label: 'Evidence Coverage', value: data.evidenceCoverage, color: '#10B981' },
              { label: 'Approval Compliance', value: data.approvalCompliance, color: '#2155d9' },
              { label: 'Effective Controls', value: data.controlStats.total > 0 ? Math.round((data.controlStats.effective / data.controlStats.total) * 100) : 0, color: '#8B5CF6' },
            ].map(({ label, value, color }) => (
              <div key={label}>
                <div className="flex justify-between mb-1">
                  <span className="text-[11px] font-black text-slate-600">{label}</span>
                  <span className="text-[11px] font-black tabular-nums" style={{ color }}>{value}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                  <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, backgroundColor: color }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Deadlines */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-800">Upcoming Deadlines</h3>
          </div>
          {data.upcomingDeadlines.length === 0 ? (
            <div className="px-4 py-5 text-center text-xs font-semibold text-slate-400">No upcoming deadlines.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.upcomingDeadlines.slice(0, 5).map((d) => {
                const { month, day } = deadlineMonthDay(d.dueDate);
                const { bg, text } = deadlineColor(d.daysRemaining);
                return (
                  <li key={d.id} className="flex items-center gap-3 px-4 py-3">
                    <div className={`shrink-0 flex flex-col items-center justify-center rounded-lg ${bg} ${text} w-9 h-9`}>
                      <span className="text-[8px] font-black uppercase">{month}</span>
                      <span className="text-sm font-black leading-none">{day}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[11px] font-black text-slate-800 leading-snug line-clamp-1">{d.title}</p>
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black mt-0.5 ${deadlineDaysBadge(d.daysRemaining)}`}>
                        {d.daysRemaining < 0 ? 'Overdue' : `${d.daysRemaining}d left`}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>

      {/* ── Section 6: 3-column grid ──────────────────────────────────────── */}
      <div className="grid gap-4 lg:grid-cols-3">

        {/* Recent Activity */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-800">Recent Activity</h3>
            <button onClick={() => onTabChange('Audit Trail')} className="text-[11px] font-black text-[#2155d9] hover:underline">
              Full audit log
            </button>
          </div>
          {data.recentActivities.length === 0 ? (
            <div className="px-4 py-6 text-center text-xs font-semibold text-slate-400">No recent compliance activity.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.recentActivities.slice(0, 7).map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <div className="mt-0.5 shrink-0">
                    <div className="h-6 w-6 rounded-lg bg-slate-100 flex items-center justify-center">
                      <svg className="h-3 w-3 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25z" /></svg>
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[11px] font-black text-slate-700 leading-snug">{a.label}</p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-slate-400">{relDate(a.createdAt)}</span>
                      <span className={`inline-block rounded-full px-1.5 py-0.5 text-[9px] font-black ${categoryBadge(a.category)}`}>{a.category}</span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* AI Compliance Advisor */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                <svg className="h-3.5 w-3.5 text-violet-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9.75 3.104v5.714a2.25 2.25 0 01-.659 1.591L5 14.5M9.75 3.104c-.251.023-.501.05-.75.082m.75-.082a24.301 24.301 0 014.5 0m0 0v5.714c0 .597.237 1.17.659 1.591L19.8 15.3M14.25 3.104c.251.023.501.05.75.082M19.8 15.3l-1.57.393A9.065 9.065 0 0112 15a9.065 9.065 0 00-6.23-.693L5 14.5m14.8.8l1.402 1.402c1.232 1.232.65 3.318-1.067 3.611A48.309 48.309 0 0112 21c-2.773 0-5.491-.235-8.135-.687-1.718-.293-2.3-2.379-1.067-3.61L5 14.5" /></svg>
              </div>
              <h3 className="text-xs font-black text-slate-800">AI Compliance Advisor</h3>
            </div>
          </div>

          {workspace.aiAdvisor === null ? (
            <div className="px-4 py-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-2">
                <svg className="h-5 w-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                <p className="text-sm font-black text-slate-700">Looking good</p>
              </div>
              <p className="text-xs font-semibold text-slate-400 leading-relaxed">No critical compliance patterns detected. Continue monitoring your controls and maintaining evidence documentation.</p>
              <a href="/copilot?q=What+is+our+compliance+posture%3F" className="mt-3 inline-flex items-center gap-1 rounded-xl bg-violet-600 px-3 py-1.5 text-[11px] font-black text-white hover:bg-violet-700 transition">
                Ask AI Copilot
              </a>
            </div>
          ) : (
            <div className="px-4 py-4 space-y-3">
              <div className="rounded-xl bg-violet-50 border border-violet-200 p-3">
                <p className="text-xs font-black text-violet-900 leading-snug">{workspace.aiAdvisor.headline}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Why it matters</p>
                <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">{workspace.aiAdvisor.whyItMatters}</p>
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 mb-1">Recommended action</p>
                <p className="text-[11px] font-semibold text-slate-600 leading-relaxed">{workspace.aiAdvisor.recommendedAction}</p>
              </div>
              <div className="flex gap-2 pt-1">
                <a href={workspace.aiAdvisor.evidenceHref} className="inline-flex items-center gap-1 rounded-xl bg-[#2155d9] px-3 py-1.5 text-[11px] font-black text-white hover:bg-[#1a44be] transition">
                  View Evidence →
                </a>
                <a href={`/copilot?q=${encodeURIComponent(workspace.aiAdvisor.copilotQuery)}`} className="inline-flex items-center gap-1 rounded-xl border border-slate-200 px-3 py-1.5 text-[11px] font-black text-slate-700 hover:bg-slate-50 transition">
                  Ask AI Copilot
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
          <div className="px-4 pt-4 pb-2 border-b border-slate-100">
            <h3 className="text-xs font-black text-slate-800">Quick Actions</h3>
          </div>
          <div className="p-3 space-y-1.5">
            {[
              { label: 'Review Approvals', sub: 'Check pending high-risk approvals', href: '/approvals', icon: '✍️' },
              { label: 'Manage Controls', sub: 'Update control effectiveness', href: '/trust/compliance?tab=controls', icon: '🛡️', tab: 'Controls' as TabId },
              { label: 'Complete Attestations', sub: 'Sign off pending attestations', href: '/trust/compliance?tab=attestations', icon: '✅', tab: 'Attestations' as TabId },
              { label: 'Upload Policy', sub: 'Add or update policy documents', href: '/playbooks', icon: '📄' },
              { label: 'Investigate Issues', sub: 'Open Investigation Center', href: '/investigations', icon: '🔍' },
              { label: 'View Evidence', sub: 'Browse evidence records', href: '/evidence', icon: '📋' },
            ].map((action) => (
              action.tab ? (
                <button
                  key={action.label}
                  onClick={() => onTabChange(action.tab!)}
                  className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 transition text-left"
                >
                  <span className="text-base shrink-0">{action.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-800">{action.label}</p>
                    <p className="text-[10px] font-semibold text-slate-400">{action.sub}</p>
                  </div>
                  <svg className="h-3.5 w-3.5 text-slate-300 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </button>
              ) : (
                <a
                  key={action.label}
                  href={action.href}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50 transition"
                >
                  <span className="text-base shrink-0">{action.icon}</span>
                  <div className="min-w-0">
                    <p className="text-[11px] font-black text-slate-800">{action.label}</p>
                    <p className="text-[10px] font-semibold text-slate-400">{action.sub}</p>
                  </div>
                  <svg className="h-3.5 w-3.5 text-slate-300 ml-auto shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" /></svg>
                </a>
              )
            ))}
          </div>
        </div>
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
    fetch('/dashboard/audit-log')
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
          <a href="/dashboard/audit-log" className="text-xs font-black text-[#2155d9] bg-[#2155d9]/10 px-3 py-1.5 rounded-lg hover:bg-[#2155d9]/20 transition">
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
            { label: 'Full Audit Log', href: '/dashboard/audit-log', icon: '📋', desc: 'All platform events with actor' },
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
  workspaceData: ComplianceWorkspace;
  orgId: string;
};

export function ComplianceHubShell({ initialData, workspaceData }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('Overview');

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
          workspace={workspaceData}
          onTabChange={setActiveTab}
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
