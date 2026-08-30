type Segment = {
  label: string;
  value: number;
  color: string;
};

type Props = {
  segments: Segment[];
  size?: number;
  strokeWidth?: number;
  centerLabel?: string;
  centerSublabel?: string;
  showLegend?: boolean;
};

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  // Clamp to avoid full-circle SVG arc issues
  const clamped = Math.min(endAngle, startAngle + 359.99);
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, clamped);
  const largeArc = clamped - startAngle > 180 ? 1 : 0;
  return `M ${start.x} ${start.y} A ${r} ${r} 0 ${largeArc} 1 ${end.x} ${end.y}`;
}

function nf(n: number) {
  return new Intl.NumberFormat('en-US').format(n);
}

export function SVGDonutChart({
  segments,
  size = 160,
  strokeWidth = 28,
  centerLabel,
  centerSublabel,
  showLegend = true,
}: Props) {
  const cx = size / 2;
  const cy = size / 2;
  const r = (size - strokeWidth) / 2;
  const total = segments.reduce((s, seg) => s + seg.value, 0);

  if (total === 0) {
    return (
      <div className="flex flex-col items-center gap-3">
        <div
          className="flex items-center justify-center rounded-full border border-[#1E2D4A]"
          style={{ width: size, height: size }}
        >
          <p className="text-xs font-semibold text-slate-500">No data</p>
        </div>
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
    <div className="flex flex-col items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background ring */}
          <circle
            cx={cx}
            cy={cy}
            r={r}
            fill="none"
            stroke="#1E2D4A"
            strokeWidth={strokeWidth}
          />
          {/* Segments */}
          {arcs.map((arc) => (
            <path
              key={arc.label}
              d={describeArc(cx, cy, r, arc.startAngle, arc.startAngle + arc.angle)}
              fill="none"
              stroke={arc.color}
              strokeWidth={strokeWidth}
              strokeLinecap="round"
            />
          ))}
        </svg>
        {/* Center label */}
        {centerLabel && (
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <p className="text-xl font-black text-white leading-none">{centerLabel}</p>
            {centerSublabel && (
              <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{centerSublabel}</p>
            )}
          </div>
        )}
      </div>

      {showLegend && (
        <div className="grid gap-1.5 w-full">
          {segments.map((seg) => (
            <div key={seg.label} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full flex-shrink-0" style={{ backgroundColor: seg.color }} />
                <span className="text-xs font-medium text-slate-400">{seg.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-white">{nf(seg.value)}</span>
                <span className="text-[10px] text-slate-500">
                  {total > 0 ? `${Math.round((seg.value / total) * 100)}%` : '0%'}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
