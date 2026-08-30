import { Link2, Download, SlidersHorizontal, Sparkles, Layers, Database } from 'lucide-react';

export type FlowCounts = {
  sources: number | null;
  captured: number | null;
  normalized: number | null;
  classified: number | null;
  correlated: number | null;
  unified: number | null;
};

const STAGES = [
  { key: 'sources',    title: 'Source Connectors', desc: 'Active integrations', color: '#3B82F6', Icon: Link2 },
  { key: 'captured',   title: 'Capture & Ingest',  desc: 'Evidence received',   color: '#8B5CF6', Icon: Download },
  { key: 'normalized', title: 'Normalize',          desc: 'Events processed',    color: '#06B6D4', Icon: SlidersHorizontal },
  { key: 'classified', title: 'AI Classify',        desc: 'Decisions detected',  color: '#10B981', Icon: Sparkles },
  { key: 'correlated', title: 'Correlate & Link',   desc: 'Cross-linked events', color: '#F59E0B', Icon: Layers },
  { key: 'unified',    title: 'Unified Evidence',   desc: 'Records created',     color: '#EC4899', Icon: Database },
] as const;

function nf(n: number | null) {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('en-US').format(n);
}

export function GatewayFlowDiagram({ counts }: { counts: FlowCounts }) {
  return (
    <>
      <style>{`
        @keyframes gwDot {
          0%   { opacity:0;transform:translateX(-6px); }
          25%  { opacity:.8; }
          75%  { opacity:.8; }
          100% { opacity:0;transform:translateX(16px); }
        }
        .gw-dot { animation:gwDot 2s ease-in-out infinite; }
        @media (prefers-reduced-motion:reduce) { .gw-dot { animation:none;opacity:.3; } }
      `}</style>

      {/* Desktop horizontal flow */}
      <div className="hidden lg:flex items-start">
        {STAGES.map((stage, i) => {
          const count = counts[stage.key as keyof FlowCounts];
          const { Icon } = stage;
          return (
            <div key={stage.key} className="flex flex-1 items-start">
              <div className="flex-1 flex flex-col items-center text-center px-1">
                <div
                  className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl"
                  style={{ background: `${stage.color}18`, border: `1.5px solid ${stage.color}40` }}
                >
                  <Icon className="h-5 w-5" style={{ color: stage.color }} />
                </div>
                <p className="text-[11px] font-bold text-white leading-tight" style={{ textWrap: 'balance' } as React.CSSProperties}>{stage.title}</p>
                <p className="mt-0.5 text-[10px] text-slate-500 max-w-[88px] leading-relaxed">{stage.desc}</p>
                <span
                  className="mt-1.5 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{ background: `${stage.color}14`, color: stage.color }}
                >
                  {nf(count)}
                </span>
              </div>
              {i < STAGES.length - 1 && (
                <div className="flex items-start justify-center pt-3 w-8 flex-shrink-0">
                  <span className="flex items-center gap-0.5">
                    {([0, 0.4, 0.8] as const).map((delay) => (
                      <span
                        key={delay}
                        className="gw-dot inline-block h-1.5 w-1.5 rounded-full"
                        style={{ background: '#7C3AED80', animationDelay: `${delay}s` }}
                      />
                    ))}
                    <span className="ml-0.5 text-[10px] text-slate-600">›</span>
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Mobile vertical list */}
      <div className="lg:hidden grid gap-2.5">
        {STAGES.map((stage) => {
          const count = counts[stage.key as keyof FlowCounts];
          const { Icon } = stage;
          return (
            <div key={stage.key} className="flex items-center gap-3">
              <div
                className="h-9 w-9 flex-shrink-0 flex items-center justify-center rounded-xl"
                style={{ background: `${stage.color}18`, border: `1.5px solid ${stage.color}40` }}
              >
                <Icon className="h-4 w-4" style={{ color: stage.color }} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-bold text-white">{stage.title}</p>
                <p className="text-[10px] text-slate-500">{stage.desc}</p>
              </div>
              <span
                className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold tabular-nums"
                style={{ background: `${stage.color}14`, color: stage.color }}
              >
                {nf(count)}
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
