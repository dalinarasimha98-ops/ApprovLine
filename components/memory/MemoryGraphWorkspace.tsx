'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

// ── Types ─────────────────────────────────────────────────────────────────────

export type GraphEntity = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  riskScore: number;
  sourceSystem: string | null;
  connectionCount: number;
  firstSeenAt: string;
  lastSeenAt: string;
  updatedAt: string;
  metadata: unknown;
};

export type GraphRelationship = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  relationshipType: string;
  confidence: number;
  evidenceSnippet: string | null;
};

type EntityDetail = {
  id: string;
  type: string;
  title: string;
  subtitle: string | null;
  summary: string | null;
  riskScore: number;
  sourceSystem: string | null;
  externalId: string | null;
  firstSeenAt: string;
  lastSeenAt: string;
  metadata: Record<string, unknown> | null;
  outgoingRelationships: Array<{
    id: string;
    relationshipType: string;
    confidence: number;
    evidenceSnippet: string | null;
    toEntity: { id: string; type: string; title: string; riskScore: number };
  }>;
  incomingRelationships: Array<{
    id: string;
    relationshipType: string;
    confidence: number;
    evidenceSnippet: string | null;
    fromEntity: { id: string; type: string; title: string; riskScore: number };
  }>;
  timelineEvents: Array<{
    id: string;
    title: string;
    description: string | null;
    eventType: string;
    occurredAt: string;
    sourceSystem: string | null;
    sourceLink: string | null;
  }>;
};

type Filters = { q: string; type: string; risk: string; source: string };

type SimNode = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  fx: number | null;
  fy: number | null;
  type: string;
  title: string;
  riskScore: number;
  connectionCount: number;
  radius: number;
};

type SimEdge = { id: string; source: string; target: string; type: string };

// ── Constants ─────────────────────────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  APPROVAL: '#3B82F6',
  DECISION: '#3B82F6',
  VENDOR: '#F59E0B',
  CONTRACT: '#D97706',
  GATEWAY_RECORD: '#B45309',
  POLICY: '#8B5CF6',
  RISK: '#EF4444',
  INVESTIGATION: '#F97316',
  APPROVER: '#10B981',
  EMPLOYEE: '#10B981',
  DEPARTMENT: '#06B6D4',
  PROJECT: '#0EA5E9',
  EMAIL: '#6366F1',
  OUTLOOK_EMAIL: '#4F46E5',
  SLACK_MESSAGE: '#6366F1',
  TEAMS_MESSAGE: '#5B5FD4',
  MESSAGE: '#6366F1',
  JIRA_TICKET: '#EC4899',
  SERVICENOW_RECORD: '#DB2777',
  TICKET: '#EC4899',
  MEETING: '#14B8A6',
  ZOOM_DECISION: '#0D9488',
};

const ENTITY_LABELS: Record<string, string> = {
  VENDOR: 'Vendor', CONTRACT: 'Contract', APPROVAL: 'Approval', APPROVER: 'Approver',
  DEPARTMENT: 'Department', PROJECT: 'Project', POLICY: 'Policy', INVESTIGATION: 'Investigation',
  RISK: 'Risk', EMAIL: 'Email', OUTLOOK_EMAIL: 'Outlook Email', TEAMS_MESSAGE: 'Teams Message',
  SLACK_MESSAGE: 'Slack Message', ZOOM_DECISION: 'Zoom Decision', JIRA_TICKET: 'Jira Ticket',
  SERVICENOW_RECORD: 'ServiceNow', GATEWAY_RECORD: 'Gateway', EMPLOYEE: 'Employee',
  MEETING: 'Meeting', TICKET: 'Ticket', DECISION: 'Decision', MESSAGE: 'Message',
};

const TYPE_OPTIONS = [
  { value: '', label: 'All Types' }, { value: 'APPROVAL', label: 'Approvals' },
  { value: 'VENDOR', label: 'Vendors' }, { value: 'CONTRACT', label: 'Contracts' },
  { value: 'POLICY', label: 'Policies' }, { value: 'RISK', label: 'Risks' },
  { value: 'INVESTIGATION', label: 'Investigations' }, { value: 'APPROVER', label: 'Approvers' },
  { value: 'EMPLOYEE', label: 'Employees' }, { value: 'DEPARTMENT', label: 'Departments' },
  { value: 'DECISION', label: 'Decisions' }, { value: 'MEETING', label: 'Meetings' },
];

const RISK_OPTIONS = [
  { value: '', label: 'All Risk' }, { value: 'high', label: 'High (70+)' },
  { value: 'medium', label: 'Medium (40–69)' }, { value: 'low', label: 'Low (<40)' },
];

// ── Utilities ─────────────────────────────────────────────────────────────────

function entityColor(type: string): string { return ENTITY_COLORS[type] ?? '#64748B'; }

function nodeRadius(connectionCount: number, riskScore: number): number {
  return 10 + Math.min(18, connectionCount * 1.4) + Math.min(7, riskScore / 15);
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function relLabel(type: string): string { return type.replaceAll('_', ' '); }

function riskLabel(score: number): { label: string; color: string } {
  if (score >= 70) return { label: 'High', color: '#EF4444' };
  if (score >= 40) return { label: 'Medium', color: '#F59E0B' };
  return { label: 'Low', color: '#10B981' };
}

// ── Force Simulation ──────────────────────────────────────────────────────────

function screenToGraph(sx: number, sy: number, t: { tx: number; ty: number; scale: number }) {
  return { x: (sx - t.tx) / t.scale, y: (sy - t.ty) / t.scale };
}

function hitTest(gx: number, gy: number, nodes: SimNode[]): SimNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = gx - n.x, dy = gy - n.y;
    if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 5) return n;
  }
  return null;
}

function tickSim(nodes: SimNode[], edges: SimEdge[], alpha: number, w: number, h: number) {
  const cx = w / 2, cy = h / 2;
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));

  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    // Center gravity
    a.vx += (cx - a.x) * 0.0018 * alpha;
    a.vy += (cy - a.y) * 0.0018 * alpha;
    // Repulsion
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 0.01;
      const d = Math.sqrt(d2);
      const minD = a.radius + b.radius + 25;
      if (d < minD * 5) {
        const f = (3200 / d2) * alpha;
        const fx = (dx / d) * f, fy = (dy / d) * f;
        if (a.fx === null) { a.vx += fx; a.vy += fy; }
        if (b.fx === null) { b.vx -= fx; b.vy -= fy; }
      }
    }
  }

  for (const e of edges) {
    const src = nodeMap.get(e.source), tgt = nodeMap.get(e.target);
    if (!src || !tgt) continue;
    const dx = tgt.x - src.x, dy = tgt.y - src.y;
    const d = Math.sqrt(dx * dx + dy * dy) + 0.01;
    const ideal = src.radius + tgt.radius + 85;
    const f = (d - ideal) * 0.055 * alpha;
    const fx = (dx / d) * f, fy = (dy / d) * f;
    if (src.fx === null) { src.vx += fx; src.vy += fy; }
    if (tgt.fx === null) { tgt.vx -= fx; tgt.vy -= fy; }
  }

  const pad = 40, damp = 0.76;
  for (const n of nodes) {
    if (n.fx !== null) n.x = n.fx; else { n.vx *= damp; n.x = Math.max(pad, Math.min(w - pad, n.x + n.vx)); }
    if (n.fy !== null) n.y = n.fy; else { n.vy *= damp; n.y = Math.max(pad, Math.min(h - pad, n.y + n.vy)); }
  }
}

// ── Canvas Render ─────────────────────────────────────────────────────────────

function render(
  ctx: CanvasRenderingContext2D,
  nodes: SimNode[],
  edges: SimEdge[],
  selId: string | null,
  hovId: string | null,
  tr: { tx: number; ty: number; scale: number },
  w: number,
  h: number,
) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#030b18';
  ctx.fillRect(0, 0, w, h);

  // Subtle dot grid
  ctx.fillStyle = 'rgba(30,45,74,0.45)';
  const gs = 44 * tr.scale, ox = tr.tx % gs, oy = tr.ty % gs;
  for (let x = ox; x < w; x += gs) for (let y = oy; y < h; y += gs) { ctx.beginPath(); ctx.arc(x, y, 1, 0, Math.PI * 2); ctx.fill(); }

  ctx.save();
  ctx.translate(tr.tx, tr.ty);
  ctx.scale(tr.scale, tr.scale);

  const nm = new Map(nodes.map((n) => [n.id, n]));

  // Edges
  for (const e of edges) {
    const s = nm.get(e.source), t = nm.get(e.target);
    if (!s || !t) continue;
    const isSel = selId === e.source || selId === e.target;
    const isHov = hovId === e.source || hovId === e.target;
    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);
    ctx.strokeStyle = isSel ? 'rgba(139,92,246,0.65)' : isHov ? 'rgba(107,127,168,0.45)' : 'rgba(30,45,74,0.8)';
    ctx.lineWidth = isSel ? 2 : isHov ? 1.5 : 1;
    ctx.stroke();
    if (isSel && e.type) {
      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2;
      ctx.font = '9px system-ui,sans-serif';
      ctx.fillStyle = 'rgba(107,127,168,0.9)';
      ctx.textAlign = 'center';
      ctx.fillText(relLabel(e.type).slice(0, 22), mx, my - 5);
    }
  }

  // Nodes
  for (const n of nodes) {
    const isSel = n.id === selId, isHov = n.id === hovId;
    const c = entityColor(n.type);

    if (isSel) {
      const grd = ctx.createRadialGradient(n.x, n.y, n.radius * 0.5, n.x, n.y, n.radius * 2.8);
      grd.addColorStop(0, c + '50'); grd.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(n.x, n.y, n.radius * 2.8, 0, Math.PI * 2);
      ctx.fillStyle = grd; ctx.fill();
    }

    ctx.beginPath(); ctx.arc(n.x, n.y, n.radius, 0, Math.PI * 2);
    ctx.fillStyle = c + (isSel ? 'ff' : isHov ? 'dd' : 'aa');
    ctx.fill();
    ctx.strokeStyle = isSel ? '#ffffff' : isHov ? c + 'cc' : c + '55';
    ctx.lineWidth = isSel ? 2.5 : isHov ? 2 : 1.5;
    ctx.stroke();

    if (n.riskScore >= 70) {
      ctx.beginPath(); ctx.arc(n.x, n.y, n.radius + 3.5, 0, Math.PI * 2);
      ctx.strokeStyle = '#EF4444' + (isSel ? 'ff' : '88');
      ctx.lineWidth = 1.5; ctx.stroke();
    }

    const maxC = Math.max(7, Math.floor(n.radius / 5));
    const label = n.title.length > maxC ? n.title.slice(0, maxC - 1) + '…' : n.title;
    const fs = Math.max(9, Math.min(12, n.radius * 0.72));
    ctx.font = `${isSel || isHov ? '600 ' : ''}${fs}px system-ui,sans-serif`;
    ctx.fillStyle = isSel ? '#ffffff' : '#CBD5E1';
    ctx.textAlign = 'center';
    ctx.fillText(label, n.x, n.y + n.radius + 12);
  }

  ctx.restore();
}

// ── Node Detail Panel ─────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: string }) {
  const c = entityColor(type);
  return (
    <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ background: c + '25', color: c, border: `1px solid ${c}40` }}>
      {ENTITY_LABELS[type] ?? type}
    </span>
  );
}

function RiskBar({ score }: { score: number }) {
  const { label, color } = riskLabel(score);
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-[11px] font-semibold text-[#6B7FA8] uppercase tracking-wide">Risk Score</span>
        <span className="text-xs font-bold" style={{ color }}>{label} · {score}</span>
      </div>
      <div className="h-1.5 rounded-full bg-[#1E2D4A] overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function RelatedEntityRow({ id, type, title, riskScore, relType, onSelect }: {
  id: string; type: string; title: string; riskScore: number; relType: string; onSelect: (id: string) => void;
}) {
  const c = entityColor(type);
  const { color } = riskLabel(riskScore);
  return (
    <button onClick={() => onSelect(id)} className="w-full text-left flex items-center gap-2.5 rounded-lg px-3 py-2 hover:bg-[#0E1830] transition group">
      <span className="flex-shrink-0 w-2.5 h-2.5 rounded-full" style={{ background: c }} />
      <span className="flex-1 min-w-0">
        <span className="block text-xs font-semibold text-[#E8EEFF] truncate group-hover:text-violet-300">{title}</span>
        <span className="block text-[10px] text-[#6B7FA8]">{relLabel(relType)} · {ENTITY_LABELS[type] ?? type}</span>
      </span>
      <span className="flex-shrink-0 text-[10px] font-bold" style={{ color }}>{riskScore}</span>
    </button>
  );
}

function NodeDetailPanel({
  detail,
  loading,
  onClose,
  onSelectEntity,
}: {
  detail: EntityDetail | null;
  loading: boolean;
  onClose: () => void;
  onSelectEntity: (id: string) => void;
}) {
  const allRelated = [
    ...(detail?.outgoingRelationships ?? []).map((r) => ({ ...r.toEntity, relType: r.relationshipType, dir: 'out' as const })),
    ...(detail?.incomingRelationships ?? []).map((r) => ({ ...r.fromEntity, relType: r.relationshipType, dir: 'in' as const })),
  ];

  return (
    <div className="absolute right-0 top-0 h-full w-80 xl:w-96 flex flex-col bg-[#07111f] border-l border-[#1E2D4A] z-10 shadow-2xl">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#1E2D4A] flex-shrink-0">
        <span className="text-xs font-bold text-[#6B7FA8] uppercase tracking-wider">Entity Detail</span>
        <button onClick={onClose} className="text-[#6B7FA8] hover:text-[#E8EEFF] transition text-lg leading-none">×</button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5">
        {loading && (
          <div className="space-y-3">
            {[80, 50, 100, 60].map((w, i) => (
              <div key={i} className="h-4 rounded bg-[#1E2D4A] animate-pulse" style={{ width: `${w}%` }} />
            ))}
          </div>
        )}

        {!loading && !detail && (
          <p className="text-sm text-[#6B7FA8]">Entity data unavailable.</p>
        )}

        {!loading && detail && (
          <>
            {/* Type + title */}
            <div>
              <TypeBadge type={detail.type} />
              <h3 className="mt-2 text-base font-bold text-[#E8EEFF] leading-snug">{detail.title}</h3>
              {detail.subtitle && <p className="mt-1 text-xs text-[#6B7FA8]">{detail.subtitle}</p>}
            </div>

            {/* Risk */}
            <RiskBar score={detail.riskScore} />

            {/* Summary */}
            {detail.summary && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7FA8] mb-1">Summary</p>
                <p className="text-xs text-[#CBD5E1] leading-relaxed">{detail.summary}</p>
              </div>
            )}

            {/* Key fields */}
            <div className="rounded-lg bg-[#0E1830] border border-[#1E2D4A] divide-y divide-[#1E2D4A]">
              {[
                { label: 'First Seen', value: fmtDate(detail.firstSeenAt) },
                { label: 'Last Seen', value: fmtDate(detail.lastSeenAt) },
                detail.sourceSystem && { label: 'Source', value: detail.sourceSystem },
                detail.externalId && { label: 'External ID', value: detail.externalId },
              ].filter(Boolean).map((row, i) => row && (
                <div key={i} className="flex items-center justify-between px-3 py-2">
                  <span className="text-[10px] font-semibold text-[#6B7FA8] uppercase tracking-wide">{row.label}</span>
                  <span className="text-xs font-medium text-[#E8EEFF] truncate max-w-[56%] text-right">{row.value}</span>
                </div>
              ))}
            </div>

            {/* Connected entities */}
            {allRelated.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7FA8] mb-2">
                  Connected Entities <span className="text-violet-400">({allRelated.length})</span>
                </p>
                <div className="space-y-1">
                  {allRelated.slice(0, 12).map((r, i) => (
                    <RelatedEntityRow
                      key={`${r.id}-${i}`}
                      id={r.id}
                      type={r.type}
                      title={r.title}
                      riskScore={r.riskScore}
                      relType={r.relType}
                      onSelect={onSelectEntity}
                    />
                  ))}
                  {allRelated.length > 12 && (
                    <p className="text-[10px] text-[#6B7FA8] px-3 pt-1">+{allRelated.length - 12} more</p>
                  )}
                </div>
              </div>
            )}

            {/* Timeline */}
            {detail.timelineEvents.length > 0 && (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#6B7FA8] mb-2">Timeline</p>
                <div className="space-y-2">
                  {detail.timelineEvents.slice(0, 6).map((ev) => (
                    <div key={ev.id} className="relative pl-4 border-l border-[#1E2D4A]">
                      <span className="absolute -left-[3px] top-1.5 w-1.5 h-1.5 rounded-full bg-violet-500" />
                      <p className="text-xs font-semibold text-[#E8EEFF]">{ev.title}</p>
                      <p className="text-[10px] text-[#6B7FA8]">{fmtDate(ev.occurredAt)} · {ev.eventType}</p>
                      {ev.description && <p className="mt-0.5 text-[10px] text-[#6B7FA8]">{ev.description}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="grid grid-cols-1 gap-2">
              {detail.type === 'INVESTIGATION' && (
                <Link href="/investigations" className="flex items-center gap-2 rounded-lg bg-[#0E1830] border border-[#1E2D4A] px-3 py-2 text-xs font-semibold text-violet-300 hover:border-violet-500/50 hover:text-violet-200 transition">
                  <span>↗</span> Open Investigation Center
                </Link>
              )}
              <Link href="/approvals" className="flex items-center gap-2 rounded-lg bg-[#0E1830] border border-[#1E2D4A] px-3 py-2 text-xs font-semibold text-blue-300 hover:border-blue-500/50 hover:text-blue-200 transition">
                <span>↗</span> View Approval Records
              </Link>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── List View ─────────────────────────────────────────────────────────────────

function ListView({ entities, onSelect }: { entities: GraphEntity[]; onSelect: (id: string) => void }) {
  if (entities.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <div className="w-12 h-12 rounded-full bg-[#0E1830] flex items-center justify-center mb-3">
          <span className="text-2xl opacity-50">🔭</span>
        </div>
        <p className="text-sm font-semibold text-[#6B7FA8]">No entities match your filters.</p>
        <p className="text-xs text-[#6B7FA8] mt-1">Adjust filters or clear search to explore the graph.</p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-[#1E2D4A]">
            {['Type', 'Title', 'Risk', 'Source', 'Connections', 'Last Seen'].map((h) => (
              <th key={h} className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[#6B7FA8]">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#1E2D4A]">
          {entities.map((e) => {
            const { label: rl, color: rc } = riskLabel(e.riskScore);
            return (
              <tr key={e.id} onClick={() => onSelect(e.id)} className="cursor-pointer hover:bg-[#0E1830] transition group">
                <td className="px-4 py-3">
                  <span className="inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: entityColor(e.type) + '25', color: entityColor(e.type) }}>
                    {ENTITY_LABELS[e.type] ?? e.type}
                  </span>
                </td>
                <td className="px-4 py-3 max-w-xs">
                  <p className="font-semibold text-[#E8EEFF] truncate group-hover:text-violet-300">{e.title}</p>
                  {e.subtitle && <p className="text-[10px] text-[#6B7FA8] truncate">{e.subtitle}</p>}
                </td>
                <td className="px-4 py-3">
                  <span className="text-xs font-bold" style={{ color: rc }}>{rl} · {e.riskScore}</span>
                </td>
                <td className="px-4 py-3 text-xs text-[#6B7FA8]">{e.sourceSystem ?? '—'}</td>
                <td className="px-4 py-3 text-xs text-[#6B7FA8]">{e.connectionCount}</td>
                <td className="px-4 py-3 text-xs text-[#6B7FA8]">{fmtDate(e.lastSeenAt)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

type Props = {
  initialEntities: GraphEntity[];
  initialRelationships: GraphRelationship[];
  initialTotal: number;
};

export function MemoryGraphWorkspace({ initialEntities, initialRelationships, initialTotal }: Props) {
  const [mode, setMode] = useState<'explore' | 'list'>('explore');
  const [filters, setFilters] = useState<Filters>({ q: '', type: '', risk: '', source: '' });
  const [draftQ, setDraftQ] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  const [entities, setEntities] = useState(initialEntities);
  const [relationships, setRelationships] = useState(initialRelationships);
  const [total, setTotal] = useState(initialTotal);
  const [graphLoading, setGraphLoading] = useState(false);
  const [graphError, setGraphError] = useState<string | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [entityDetail, setEntityDetail] = useState<EntityDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 900, h: 600 });

  // Simulation refs (avoid re-renders in animation loop)
  const simNodes = useRef<SimNode[]>([]);
  const simEdges = useRef<SimEdge[]>([]);
  const alphaRef = useRef(1.0);
  const trRef = useRef({ tx: 0, ty: 0, scale: 1 });
  const hovIdRef = useRef<string | null>(null);
  const selIdRef = useRef<string | null>(null);
  const dragNodeRef = useRef<SimNode | null>(null);
  const panRef = useRef<{ sx: number; sy: number; tx: number; ty: number } | null>(null);
  const isDraggingRef = useRef(false);
  const rafRef = useRef(0);

  // Keep selIdRef in sync
  useEffect(() => { selIdRef.current = selectedId; }, [selectedId]);

  // Fetch graph data
  const fetchGraph = useCallback(async (f: Filters) => {
    setGraphLoading(true);
    setGraphError(null);
    try {
      const p = new URLSearchParams({ limit: '80' });
      if (f.q) p.set('q', f.q);
      if (f.type) p.set('type', f.type);
      if (f.risk) p.set('risk', f.risk);
      if (f.source) p.set('source', f.source);
      const res = await fetch(`/api/memory/graph?${p}`);
      if (!res.ok) throw new Error('Failed to load graph.');
      const data = await res.json() as { entities: GraphEntity[]; relationships: GraphRelationship[]; total: number };
      setEntities(data.entities);
      setRelationships(data.relationships);
      setTotal(data.total);
      alphaRef.current = 1.0;
    } catch (err) {
      setGraphError(err instanceof Error ? err.message : 'Could not load graph data.');
    } finally {
      setGraphLoading(false);
    }
  }, []);

  const fetchDetail = useCallback(async (id: string) => {
    setDetailLoading(true);
    setEntityDetail(null);
    try {
      const res = await fetch(`/api/memory/${id}`);
      if (!res.ok) throw new Error('Not found.');
      const data = await res.json() as { entity: EntityDetail };
      setEntityDetail(data.entity);
    } catch { setEntityDetail(null); }
    finally { setDetailLoading(false); }
  }, []);

  useEffect(() => { if (selectedId) fetchDetail(selectedId); else setEntityDetail(null); }, [selectedId, fetchDetail]);
  useEffect(() => { fetchGraph(filters); }, [filters, fetchGraph]);

  // Rebuild sim nodes on data change
  useEffect(() => {
    const { w, h } = dims;
    const existing = new Map(simNodes.current.map((n) => [n.id, n]));
    simNodes.current = entities.map((e) => {
      const ex = existing.get(e.id);
      const r = nodeRadius(e.connectionCount, e.riskScore);
      return ex
        ? { ...ex, title: e.title, riskScore: e.riskScore, connectionCount: e.connectionCount, radius: r }
        : { id: e.id, x: w / 2 + (Math.random() - 0.5) * w * 0.55, y: h / 2 + (Math.random() - 0.5) * h * 0.55, vx: (Math.random() - 0.5) * 2, vy: (Math.random() - 0.5) * 2, fx: null, fy: null, type: e.type, title: e.title, riskScore: e.riskScore, connectionCount: e.connectionCount, radius: r };
    });
    simEdges.current = relationships.map((r) => ({ id: r.id, source: r.fromEntityId, target: r.toEntityId, type: r.relationshipType }));
    alphaRef.current = 1.0;
  }, [entities, relationships, dims]);

  // ResizeObserver
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setDims({ w: Math.max(400, rect.width), h: Math.max(360, rect.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Canvas animation loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let running = true, last = 0;

    const localCtx = ctx;
    function loop(now: number) {
      if (!running) return;
      rafRef.current = requestAnimationFrame(loop);
      if (now - last > 14) {
        last = now;
        if (alphaRef.current > 0.003) { tickSim(simNodes.current, simEdges.current, alphaRef.current, dims.w, dims.h); alphaRef.current *= 0.985; }
      }
      render(localCtx, simNodes.current, simEdges.current, selIdRef.current, hovIdRef.current, trRef.current, dims.w, dims.h);
    }
    rafRef.current = requestAnimationFrame(loop);
    return () => { running = false; cancelAnimationFrame(rafRef.current); };
  }, [dims]);

  // Mouse events on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== 'explore') return;
    const localCanvas = canvas;

    function getPos(e: MouseEvent) {
      const r = localCanvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    }

    function onDown(e: MouseEvent) {
      const { x, y } = getPos(e);
      const g = screenToGraph(x, y, trRef.current);
      const hit = hitTest(g.x, g.y, simNodes.current);
      if (hit) {
        isDraggingRef.current = false;
        dragNodeRef.current = hit;
        hit.fx = hit.x; hit.fy = hit.y;
        alphaRef.current = Math.max(alphaRef.current, 0.3);
      } else {
        panRef.current = { sx: x, sy: y, tx: trRef.current.tx, ty: trRef.current.ty };
      }
    }

    function onMove(e: MouseEvent) {
      const { x, y } = getPos(e);
      const g = screenToGraph(x, y, trRef.current);

      if (dragNodeRef.current) {
        isDraggingRef.current = true;
        dragNodeRef.current.fx = g.x; dragNodeRef.current.fy = g.y;
        alphaRef.current = Math.max(alphaRef.current, 0.15);
      } else if (panRef.current) {
        isDraggingRef.current = true;
        trRef.current = { ...trRef.current, tx: panRef.current.tx + (x - panRef.current.sx), ty: panRef.current.ty + (y - panRef.current.sy) };
      } else {
        hovIdRef.current = hitTest(g.x, g.y, simNodes.current)?.id ?? null;
        localCanvas.style.cursor = hovIdRef.current ? 'pointer' : 'grab';
      }
    }

    function onUp(e: MouseEvent) {
      const { x, y } = getPos(e);
      if (dragNodeRef.current) {
        dragNodeRef.current.fx = null; dragNodeRef.current.fy = null;
        if (!isDraggingRef.current) {
          // Click: select node
          const g = screenToGraph(x, y, trRef.current);
          const hit = hitTest(g.x, g.y, simNodes.current);
          setSelectedId(hit?.id ?? null);
        }
        dragNodeRef.current = null;
      } else if (!isDraggingRef.current && panRef.current) {
        setSelectedId(null);
      }
      panRef.current = null;
      isDraggingRef.current = false;
    }

    function onWheel(e: WheelEvent) {
      e.preventDefault();
      const { x, y } = getPos(e);
      const zf = e.deltaY < 0 ? 1.12 : 0.89;
      const ns = Math.max(0.25, Math.min(4, trRef.current.scale * zf));
      trRef.current = {
        scale: ns,
        tx: x - (x - trRef.current.tx) * (ns / trRef.current.scale),
        ty: y - (y - trRef.current.ty) * (ns / trRef.current.scale),
      };
    }

    function onLeave() { hovIdRef.current = null; localCanvas.style.cursor = 'grab'; }

    localCanvas.addEventListener('mousedown', onDown);
    localCanvas.addEventListener('mousemove', onMove);
    localCanvas.addEventListener('mouseup', onUp);
    localCanvas.addEventListener('wheel', onWheel, { passive: false });
    localCanvas.addEventListener('mouseleave', onLeave);
    return () => {
      localCanvas.removeEventListener('mousedown', onDown);
      localCanvas.removeEventListener('mousemove', onMove);
      localCanvas.removeEventListener('mouseup', onUp);
      localCanvas.removeEventListener('wheel', onWheel);
      localCanvas.removeEventListener('mouseleave', onLeave);
    };
  }, [mode]);

  function applyFilter(key: keyof Filters, val: string) {
    setFilters((f) => ({ ...f, [key]: val }));
  }

  function resetView() {
    trRef.current = { tx: 0, ty: 0, scale: 1 };
    alphaRef.current = 1.0;
  }

  function fitGraph() {
    if (!simNodes.current.length) return;
    const xs = simNodes.current.map((n) => n.x), ys = simNodes.current.map((n) => n.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const gw = maxX - minX + 80, gh = maxY - minY + 80;
    const scale = Math.max(0.25, Math.min(3, Math.min(dims.w / gw, dims.h / gh)));
    const tx = dims.w / 2 - ((minX + maxX) / 2) * scale;
    const ty = dims.h / 2 - ((minY + maxY) / 2) * scale;
    trRef.current = { tx, ty, scale };
  }

  const activeFiltersCount = [filters.type, filters.risk, filters.source].filter(Boolean).length;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 px-4 py-3 border-b border-[#1E2D4A] flex-shrink-0">
        {/* Mode toggle */}
        <div className="flex rounded-lg overflow-hidden border border-[#1E2D4A]">
          {(['explore', 'list'] as const).map((m) => (
            <button key={m} onClick={() => setMode(m)} className={`px-3 py-1.5 text-xs font-semibold transition ${mode === m ? 'bg-violet-600 text-white' : 'text-[#6B7FA8] hover:text-[#E8EEFF] hover:bg-[#0E1830]'}`}>
              {m === 'explore' ? '⬡ Explore' : '☰ List'}
            </button>
          ))}
        </div>

        {/* Search */}
        <form onSubmit={(e) => { e.preventDefault(); applyFilter('q', draftQ); }} className="flex gap-1.5 flex-1 min-w-0 max-w-sm">
          <input value={draftQ} onChange={(e) => setDraftQ(e.target.value)} placeholder="Search entities…" className="flex-1 min-w-0 rounded-lg bg-[#0E1830] border border-[#1E2D4A] px-3 py-1.5 text-xs text-[#E8EEFF] placeholder:text-[#6B7FA8] focus:outline-none focus:border-violet-500/50" />
          <button type="submit" className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 text-xs font-semibold text-white transition">Search</button>
          {filters.q && <button type="button" onClick={() => { setDraftQ(''); applyFilter('q', ''); }} className="px-2 py-1.5 rounded-lg border border-[#1E2D4A] text-xs text-[#6B7FA8] hover:text-[#E8EEFF] transition">✕</button>}
        </form>

        {/* Filters toggle */}
        <button onClick={() => setShowFilters((v) => !v)} className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${showFilters ? 'border-violet-500/50 text-violet-300 bg-violet-600/10' : 'border-[#1E2D4A] text-[#6B7FA8] hover:text-[#E8EEFF]'}`}>
          ⚙ Filters {activeFiltersCount > 0 && <span className="rounded-full bg-violet-600 text-white text-[9px] w-4 h-4 flex items-center justify-center">{activeFiltersCount}</span>}
        </button>

        {/* Graph controls (explore mode only) */}
        {mode === 'explore' && (
          <>
            <button onClick={fitGraph} title="Fit graph to screen" className="px-2.5 py-1.5 rounded-lg border border-[#1E2D4A] text-xs text-[#6B7FA8] hover:text-[#E8EEFF] transition">⊞ Fit</button>
            <button onClick={resetView} title="Reset zoom and pan" className="px-2.5 py-1.5 rounded-lg border border-[#1E2D4A] text-xs text-[#6B7FA8] hover:text-[#E8EEFF] transition">↺ Reset</button>
          </>
        )}

        {/* Stats */}
        <div className="ml-auto text-[10px] text-[#6B7FA8] tabular-nums">
          {graphLoading ? <span className="text-violet-400">Loading…</span> : <span>{entities.length} / {total} entities</span>}
        </div>
      </div>

      {/* Filters bar */}
      {showFilters && (
        <div className="flex flex-wrap gap-3 px-4 py-3 border-b border-[#1E2D4A] bg-[#07111f] flex-shrink-0">
          <select value={filters.type} onChange={(e) => applyFilter('type', e.target.value)} className="rounded-lg bg-[#0E1830] border border-[#1E2D4A] px-3 py-1.5 text-xs text-[#E8EEFF] focus:outline-none focus:border-violet-500/50">
            {TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <select value={filters.risk} onChange={(e) => applyFilter('risk', e.target.value)} className="rounded-lg bg-[#0E1830] border border-[#1E2D4A] px-3 py-1.5 text-xs text-[#E8EEFF] focus:outline-none focus:border-violet-500/50">
            {RISK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
          <input value={filters.source} onChange={(e) => applyFilter('source', e.target.value)} placeholder="Source system…" className="rounded-lg bg-[#0E1830] border border-[#1E2D4A] px-3 py-1.5 text-xs text-[#E8EEFF] placeholder:text-[#6B7FA8] focus:outline-none focus:border-violet-500/50 w-36" />
          {(filters.type || filters.risk || filters.source) && (
            <button onClick={() => setFilters((f) => ({ ...f, type: '', risk: '', source: '' }))} className="text-[10px] text-[#6B7FA8] hover:text-rose-400 transition underline">Clear filters</button>
          )}
        </div>
      )}

      {/* Error state */}
      {graphError && (
        <div className="mx-4 mt-3 rounded-lg bg-rose-950/40 border border-rose-900/50 px-4 py-3 text-xs text-rose-300 flex items-center justify-between flex-shrink-0">
          <span>{graphError}</span>
          <button onClick={() => fetchGraph(filters)} className="ml-3 text-rose-200 underline">Retry</button>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 min-h-0 relative">
        {mode === 'explore' ? (
          <div ref={containerRef} className="absolute inset-0">
            <canvas
              ref={canvasRef}
              width={dims.w}
              height={dims.h}
              className="block"
              style={{ cursor: 'grab', touchAction: 'none' }}
            />
            {/* Legend */}
            <div className="absolute bottom-4 left-4 rounded-lg bg-[#07111f]/90 border border-[#1E2D4A] p-3 backdrop-blur text-[10px] pointer-events-none">
              <p className="font-bold text-[#6B7FA8] uppercase tracking-wide mb-2">Legend</p>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1">
                {[['Approval', '#3B82F6'], ['Vendor', '#F59E0B'], ['Policy', '#8B5CF6'], ['Risk', '#EF4444'], ['Investigation', '#F97316'], ['Approver', '#10B981']].map(([l, c]) => (
                  <div key={l} className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c }} />
                    <span className="text-[#6B7FA8]">{l}</span>
                  </div>
                ))}
              </div>
              <p className="mt-2 text-[#6B7FA8] opacity-60">Click to select · Drag to move · Scroll to zoom</p>
            </div>

            {/* Loading overlay */}
            {graphLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-[#030b18]/60 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
                  <p className="text-xs font-semibold text-[#E8EEFF]">Loading graph…</p>
                </div>
              </div>
            )}

            {/* Selected node detail panel */}
            {selectedId && (
              <NodeDetailPanel
                detail={entityDetail}
                loading={detailLoading}
                onClose={() => setSelectedId(null)}
                onSelectEntity={(id) => { setSelectedId(id); }}
              />
            )}
          </div>
        ) : (
          <div className="h-full overflow-y-auto">
            {graphLoading ? (
              <div className="flex items-center justify-center h-32">
                <div className="w-6 h-6 rounded-full border-2 border-violet-500 border-t-transparent animate-spin" />
              </div>
            ) : (
              <ListView entities={entities} onSelect={(id) => { setSelectedId(id); setMode('explore'); }} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
