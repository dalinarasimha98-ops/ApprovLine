type Props = {
  value: number; // 0-100
  label?: string;
  sublabel?: string;
  size?: number;
  color?: string;
};

/**
 * Semi-circular speedometer gauge.
 *
 * Arc sweeps from the LEFT endpoint (9 o'clock, 270°) clockwise through the
 * TOP (12 o'clock) to the RIGHT endpoint (3 o'clock, 90°). The bottom of the
 * circle is clipped by the viewBox, giving the familiar half-circle look.
 *
 * `value` is 0–100 and fills the arc proportionally left → right.
 */
export function SVGArcGauge({
  value,
  label,
  sublabel,
  size = 180,
}: Props) {
  const cx = size / 2;
  const sw = size * 0.1;       // stroke width
  const r = size * 0.42;       // radius
  const cy = r + sw / 2 + 6;  // center: r + stroke-clearance above + top padding
  const viewH = cy + sw / 2 + 6; // viewBox height: just past the arc endpoints

  // Arc from left (270°) clockwise through top (360°) to right (270°+180°=450°)
  const startAngle = 270;
  const sweepAngle = (value / 100) * 180;

  function polarToCartesian(angleDeg: number) {
    const rad = ((angleDeg - 90) * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  function describeArc(start: number, end: number) {
    const s = polarToCartesian(start);
    const e = polarToCartesian(Math.min(end, start + 359.99));
    const large = end - start > 180 ? 1 : 0;
    return `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;
  }

  // Full 180° track + proportional fill
  const trackPath = describeArc(startAngle, startAngle + 180);
  const fillPath = sweepAngle > 0.5 ? describeArc(startAngle, startAngle + sweepAngle) : null;

  // Color by value
  let arcColor = '#10B981'; // green ≥ 75
  if (value < 50) arcColor = '#EF4444';
  else if (value < 75) arcColor = '#F59E0B';

  // Text: centered in the visible arc hole (between top of arc and endpoints)
  // Hole spans y=[cy-r, cy]; centre at cy-r/2
  const holeCenter = cy - r * 0.5;
  const valueY = holeCenter - size * 0.02;
  const labelY = holeCenter + size * 0.09;

  return (
    <div className="flex flex-col items-center w-full">
      <svg viewBox={`0 0 ${size} ${viewH.toFixed(1)}`} className="w-full">
        {/* Gray track */}
        <path
          d={trackPath}
          fill="none"
          stroke="#1E2D4A"
          strokeWidth={sw}
          strokeLinecap="round"
        />
        {/* Colored fill */}
        {fillPath && (
          <path
            d={fillPath}
            fill="none"
            stroke={arcColor}
            strokeWidth={sw}
            strokeLinecap="round"
          />
        )}
        {/* Percentage */}
        <text
          x={cx}
          y={valueY}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={size * 0.2}
          fontWeight="900"
          fill="white"
        >
          {value}%
        </text>
        {/* Label */}
        {label && (
          <text
            x={cx}
            y={labelY}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={size * 0.075}
            fill="#9CA3AF"
            fontWeight="600"
          >
            {label}
          </text>
        )}
      </svg>
      {sublabel && (
        <p className="mt-1 text-center text-xs font-medium text-slate-400">{sublabel}</p>
      )}
    </div>
  );
}
