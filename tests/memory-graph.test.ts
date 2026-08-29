import assert from 'node:assert/strict';
import test from 'node:test';
import { hasAnyRole } from '../lib/rbac';
import {
  buildMemoryDashboard,
  getMemoryEntityProfile,
  queryMemoryGraphForCopilot,
  memoryEntityLabels,
} from '../services/memory';

// ── Label coverage ────────────────────────────────────────────────────────────

test('memoryEntityLabels covers all 22 entity types', () => {
  const expected = [
    'VENDOR', 'CONTRACT', 'APPROVAL', 'APPROVER', 'DEPARTMENT', 'PROJECT',
    'POLICY', 'INVESTIGATION', 'RISK', 'EMAIL', 'OUTLOOK_EMAIL', 'TEAMS_MESSAGE',
    'SLACK_MESSAGE', 'ZOOM_DECISION', 'JIRA_TICKET', 'SERVICENOW_RECORD',
    'GATEWAY_RECORD', 'EMPLOYEE', 'MEETING', 'TICKET', 'DECISION', 'MESSAGE',
  ];
  for (const t of expected) {
    assert.ok(t in memoryEntityLabels, `Missing label for ${t}`);
    assert.ok(typeof memoryEntityLabels[t as keyof typeof memoryEntityLabels] === 'string');
    assert.ok(memoryEntityLabels[t as keyof typeof memoryEntityLabels].length > 0);
  }
  assert.equal(expected.length, 22);
});

test('memoryEntityLabels values are non-empty strings', () => {
  for (const [k, v] of Object.entries(memoryEntityLabels)) {
    assert.ok(typeof v === 'string' && v.length > 0, `Empty label for ${k}`);
  }
});

// ── RBAC coverage ─────────────────────────────────────────────────────────────

test('memory graph RBAC allows MANAGER, ADMIN, OWNER', () => {
  assert.equal(hasAnyRole('MANAGER', ['MANAGER', 'ADMIN', 'OWNER']), true);
  assert.equal(hasAnyRole('ADMIN', ['MANAGER', 'ADMIN', 'OWNER']), true);
  assert.equal(hasAnyRole('OWNER', ['MANAGER', 'ADMIN', 'OWNER']), true);
});

test('memory graph RBAC blocks MEMBER, VIEWER, AUDITOR', () => {
  assert.equal(hasAnyRole('MEMBER', ['MANAGER', 'ADMIN', 'OWNER']), false);
  assert.equal(hasAnyRole('VIEWER', ['MANAGER', 'ADMIN', 'OWNER']), false);
  assert.equal(hasAnyRole('AUDITOR', ['MANAGER', 'ADMIN', 'OWNER']), false);
});

// ── Service exports are callable ──────────────────────────────────────────────

test('memory service exports are functions', () => {
  assert.equal(typeof buildMemoryDashboard, 'function');
  assert.equal(typeof getMemoryEntityProfile, 'function');
  assert.equal(typeof queryMemoryGraphForCopilot, 'function');
});

// ── Risk filter logic (pure) ──────────────────────────────────────────────────

function riskFilter(risk: string, score: number): boolean {
  if (risk === 'high') return score >= 70;
  if (risk === 'medium') return score >= 40 && score < 70;
  if (risk === 'low') return score < 40;
  return true;
}

test('risk filter: high matches scores >= 70', () => {
  assert.equal(riskFilter('high', 70), true);
  assert.equal(riskFilter('high', 100), true);
  assert.equal(riskFilter('high', 69), false);
});

test('risk filter: medium matches 40–69', () => {
  assert.equal(riskFilter('medium', 40), true);
  assert.equal(riskFilter('medium', 69), true);
  assert.equal(riskFilter('medium', 39), false);
  assert.equal(riskFilter('medium', 70), false);
});

test('risk filter: low matches scores < 40', () => {
  assert.equal(riskFilter('low', 0), true);
  assert.equal(riskFilter('low', 39), true);
  assert.equal(riskFilter('low', 40), false);
});

test('risk filter: empty string passes all scores', () => {
  assert.equal(riskFilter('', 0), true);
  assert.equal(riskFilter('', 50), true);
  assert.equal(riskFilter('', 100), true);
});

// ── Node radius calculation (pure) ────────────────────────────────────────────

function nodeRadius(connectionCount: number, riskScore: number): number {
  return 10 + Math.min(18, connectionCount * 1.4) + Math.min(7, riskScore / 15);
}

test('nodeRadius returns values in expected range', () => {
  const min = nodeRadius(0, 0);
  const max = nodeRadius(100, 100);
  assert.ok(min >= 10, 'min radius at least 10');
  assert.ok(max <= 10 + 18 + 7 + 1, 'max radius within bounds');
});

test('nodeRadius grows with more connections', () => {
  const r1 = nodeRadius(1, 50);
  const r5 = nodeRadius(5, 50);
  assert.ok(r5 > r1, 'more connections → larger radius');
});

test('nodeRadius grows with higher risk', () => {
  const low = nodeRadius(3, 0);
  const high = nodeRadius(3, 100);
  assert.ok(high > low, 'higher risk → larger radius');
});

// ── Relationship label formatting (pure) ──────────────────────────────────────

function relLabel(type: string): string { return type.replaceAll('_', ' '); }

test('relLabel converts underscores to spaces', () => {
  assert.equal(relLabel('APPROVED_BY'), 'APPROVED BY');
  assert.equal(relLabel('GOVERNED_BY'), 'GOVERNED BY');
  assert.equal(relLabel('BELONGS_TO'), 'BELONGS TO');
  assert.equal(relLabel('HAS_RISK'), 'HAS RISK');
  assert.equal(relLabel('INVESTIGATES'), 'INVESTIGATES');
});

// ── Entity color mapping (pure) ───────────────────────────────────────────────

const ENTITY_COLORS: Record<string, string> = {
  APPROVAL: '#3B82F6', DECISION: '#3B82F6', VENDOR: '#F59E0B', CONTRACT: '#D97706',
  POLICY: '#8B5CF6', RISK: '#EF4444', INVESTIGATION: '#F97316', APPROVER: '#10B981',
  EMPLOYEE: '#10B981', DEPARTMENT: '#06B6D4',
};

function entityColor(type: string): string { return ENTITY_COLORS[type] ?? '#64748B'; }

test('entityColor returns valid hex for known types', () => {
  const types = ['APPROVAL', 'VENDOR', 'POLICY', 'RISK', 'INVESTIGATION', 'APPROVER'];
  for (const t of types) {
    const c = entityColor(t);
    assert.ok(c.startsWith('#'), `${t} color should be hex`);
    assert.ok(c.length === 7, `${t} color should be 7 chars`);
  }
});

test('entityColor returns fallback for unknown type', () => {
  const c = entityColor('UNKNOWN_TYPE_XYZ');
  assert.equal(c, '#64748B');
});

test('APPROVAL and DECISION share the same color (both are decision nodes)', () => {
  assert.equal(entityColor('APPROVAL'), entityColor('DECISION'));
});

test('APPROVER and EMPLOYEE share the same color (both are people nodes)', () => {
  assert.equal(entityColor('APPROVER'), entityColor('EMPLOYEE'));
});

// ── Force simulation (pure physics logic) ────────────────────────────────────

type SimNode = { id: string; x: number; y: number; vx: number; vy: number; fx: number | null; fy: number | null; radius: number };

function tickOnce(nodes: SimNode[], w: number, h: number): void {
  const cx = w / 2, cy = h / 2;
  for (let i = 0; i < nodes.length; i++) {
    const a = nodes[i];
    a.vx += (cx - a.x) * 0.002;
    a.vy += (cy - a.y) * 0.002;
    for (let j = i + 1; j < nodes.length; j++) {
      const b = nodes[j];
      const dx = a.x - b.x, dy = a.y - b.y;
      const d2 = dx * dx + dy * dy + 0.01;
      const d = Math.sqrt(d2);
      const f = 3200 / d2;
      const fx = (dx / d) * f, fy = (dy / d) * f;
      if (a.fx === null) { a.vx += fx; a.vy += fy; }
      if (b.fx === null) { b.vx -= fx; b.vy -= fy; }
    }
  }
  const pad = 40, damp = 0.76;
  for (const n of nodes) {
    if (n.fx !== null) n.x = n.fx; else { n.vx *= damp; n.x = Math.max(pad, Math.min(w - pad, n.x + n.vx)); }
    if (n.fy !== null) n.y = n.fy; else { n.vy *= damp; n.y = Math.max(pad, Math.min(h - pad, n.y + n.vy)); }
  }
}

test('force simulation: nodes repel each other', () => {
  const n1: SimNode = { id: '1', x: 450, y: 300, vx: 0, vy: 0, fx: null, fy: null, radius: 12 };
  const n2: SimNode = { id: '2', x: 460, y: 300, vx: 0, vy: 0, fx: null, fy: null, radius: 12 };
  const distBefore = Math.abs(n2.x - n1.x);
  tickOnce([n1, n2], 900, 600);
  const distAfter = Math.abs(n2.x - n1.x);
  assert.ok(distAfter > distBefore, 'nodes should move apart after tick');
});

test('force simulation: gravity pulls toward center', () => {
  const n: SimNode = { id: '1', x: 50, y: 50, vx: 0, vy: 0, fx: null, fy: null, radius: 12 };
  const before = { x: n.x, y: n.y };
  tickOnce([n], 900, 600);
  // Node in top-left corner should move right and down toward center
  assert.ok(n.x >= before.x, 'x should move toward center (right)');
  assert.ok(n.y >= before.y, 'y should move toward center (down)');
});

test('force simulation: pinned node does not move', () => {
  const n: SimNode = { id: '1', x: 200, y: 150, vx: 10, vy: 10, fx: 200, fy: 150, radius: 12 };
  tickOnce([n], 900, 600);
  assert.equal(n.x, 200);
  assert.equal(n.y, 150);
});

test('force simulation: nodes stay within canvas bounds', () => {
  const nodes: SimNode[] = Array.from({ length: 20 }, (_, i) => ({
    id: String(i), x: Math.random() * 900, y: Math.random() * 600, vx: (Math.random() - 0.5) * 50, vy: (Math.random() - 0.5) * 50, fx: null, fy: null, radius: 12,
  }));
  for (let i = 0; i < 60; i++) tickOnce(nodes, 900, 600);
  for (const n of nodes) {
    assert.ok(n.x >= 40 && n.x <= 860, `x=${n.x} out of bounds`);
    assert.ok(n.y >= 40 && n.y <= 560, `y=${n.y} out of bounds`);
  }
});

// ── Hit test (pure) ───────────────────────────────────────────────────────────

type HitNode = { id: string; x: number; y: number; radius: number };

function hitTest(gx: number, gy: number, nodes: HitNode[]): HitNode | null {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const dx = gx - n.x, dy = gy - n.y;
    if (Math.sqrt(dx * dx + dy * dy) <= n.radius + 5) return n;
  }
  return null;
}

test('hitTest selects node at exact center', () => {
  const nodes: HitNode[] = [{ id: 'a', x: 100, y: 100, radius: 15 }];
  const hit = hitTest(100, 100, nodes);
  assert.equal(hit?.id, 'a');
});

test('hitTest selects node at edge of radius', () => {
  const nodes: HitNode[] = [{ id: 'a', x: 100, y: 100, radius: 15 }];
  const hit = hitTest(120, 100, nodes);
  assert.equal(hit?.id, 'a');
});

test('hitTest returns null when miss', () => {
  const nodes: HitNode[] = [{ id: 'a', x: 100, y: 100, radius: 15 }];
  const hit = hitTest(200, 200, nodes);
  assert.equal(hit, null);
});

test('hitTest returns top-most (last) node when overlapping', () => {
  const nodes: HitNode[] = [
    { id: 'bottom', x: 100, y: 100, radius: 15 },
    { id: 'top', x: 102, y: 102, radius: 15 },
  ];
  const hit = hitTest(105, 105, nodes);
  assert.equal(hit?.id, 'top');
});

// ── Screen-to-graph coordinate transform (pure) ───────────────────────────────

function screenToGraph(sx: number, sy: number, tx: number, ty: number, scale: number) {
  return { x: (sx - tx) / scale, y: (sy - ty) / scale };
}

test('screenToGraph with identity transform returns same coords', () => {
  const { x, y } = screenToGraph(200, 150, 0, 0, 1);
  assert.equal(x, 200);
  assert.equal(y, 150);
});

test('screenToGraph with pan offset', () => {
  const { x, y } = screenToGraph(200, 150, 50, 30, 1);
  assert.equal(x, 150);
  assert.equal(y, 120);
});

test('screenToGraph with scale', () => {
  const { x, y } = screenToGraph(200, 150, 0, 0, 2);
  assert.equal(x, 100);
  assert.equal(y, 75);
});

// ── Date formatting (pure) ────────────────────────────────────────────────────

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

test('fmtDate formats ISO string as human-readable date', () => {
  const result = fmtDate('2026-06-15T10:00:00.000Z');
  assert.ok(result.includes('2026'), 'contains year');
  assert.ok(typeof result === 'string' && result.length > 0);
});

test('fmtDate handles different months', () => {
  const jan = fmtDate('2026-01-01T00:00:00.000Z');
  const dec = fmtDate('2026-12-31T00:00:00.000Z');
  assert.ok(jan.includes('2026'));
  assert.ok(dec.includes('2026'));
});
